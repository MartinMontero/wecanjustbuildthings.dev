/**
 * /api/admin/* sub-router — mirrors the worker/auth/* pattern and is dispatched
 * from worker/index.ts (before the static-asset fallthrough).
 *
 * Phase 2 (hardened admin auth). Routes:
 *   POST /api/admin/login/nostr/challenge  → single-use NIP-98 challenge (admin store)
 *   POST /api/admin/login/nostr/verify     → 7-check NIP-98 + ALLOWLIST → admin session
 *   POST /api/admin/elevate/bluesky        → existing user session + ALLOWLISTED DID → admin session
 *   GET  /api/admin/whoami                 → { identity, method } via cookie session OR
 *                                            per-request NIP-98 (API clients)
 *   POST /api/admin/logout                 → CSRF-checked session destruction
 * Phase 3 (two-tier roster management — SUPERADMIN only, cookie+CSRF or
 * per-request NIP-98; Bluesky superadmins manage via cookie+CSRF only):
 *   GET  /api/admin/admins                 → file principals (immutable) ∪ D1 roster
 *   POST /api/admin/admins/add             → roster add (409 file-resident/duplicate)
 *   POST /api/admin/admins/remove          → roster remove (403 file-resident,
 *                                            404 unknown) + best-effort session purge
 * Every roster mutation writes the insert-only admin_audit with actor + method.
 * Everything else FAILS CLOSED with 404; missing bindings fail closed with 503.
 *
 * Security model:
 *   - TWO-TIER membership, re-derived per request (worker/admin/roles.ts): the
 *     committed file (worker/admin/allowlist.ts — superadmins + file admins,
 *     immutable at runtime) first, then the D1 runtime roster (admins only).
 *     Checked server-side after every cryptographic verification. Membership
 *     rejection and verification failure return the SAME generic 401 — an
 *     attacker learns nothing about which gate stopped them (and no role
 *     oracle: a non-superadmin probing a management route sees the same 401).
 *     There is no bypass, no env override.
 *   - Pre-auth throttling: native rate limiter, buckets admin-login/admin-elevate,
 *     keyed on client IP. Post-auth velocity + CSRF: the per-identity ADMIN_COORD
 *     Durable Object, reachable only after verification + allowlist (decision 4).
 *   - NIP-98 split model: browsers hold the __Host-wcjbt_admin cookie session (the
 *     key signs ONCE, at login — extension or remote bunker; the server verifies
 *     the same schnorr signature either way and cannot tell which signer produced
 *     it); non-browser API clients sign EVERY request (per-request NIP-98 with a
 *     single-use event id).
 *   - No credential material is ever logged — no cookies, no Authorization
 *     headers, no tokens (this module logs nothing at all).
 *
 * `deps` is a compile-time-only test seam (tests must exercise a NON-empty
 * allowlist without committing real identities): runtime callers (worker/index.ts)
 * never pass it and no environment value reaches it, so it cannot act as a
 * runtime bypass.
 */
import { decode as nip19Decode } from 'nostr-tools/nip19';
import { authJson, authError } from '../auth/respond.ts';
import { issueChallenge, verifyNostrAuth, verifyNip98Event, sanitizeDisplayName } from '../auth/nostr.ts';
import { resolveSession, readCookie } from '../auth/session.ts';
import { getIdentitySubject } from '../auth/db.ts';
import { overRateLimit, crossSiteRequest } from '../auth/guards.ts';
import type { KVNamespace, D1Database, DurableObjectNamespace } from '../auth/cf.ts';
import type { AdminEnv } from './types.ts';
import {
  adminRoleFor, normalizeSubject, isValidSubject,
  isWellFormedNostrEntry, isWellFormedBlueskyEntry, type AdminRole,
} from './allowlist.ts';
import { resolveAdminRole, DEFAULT_ADMIN_DEPS, type AdminDeps } from './roles.ts';
import {
  listRosterEntries, rosterHas, addRosterEntry, removeRosterEntry, type AdminProvider, type AuditMethod,
} from './roster.ts';
import {
  ADMIN_SESSION_COOKIE, newAdminSessionId, putAdminSession, destroyAdminSession,
  resolveAdminSessionId, adminSessionCookie, clearAdminSessionCookie, purgeAdminSessions,
  type AdminMethod,
} from './session.ts';

/** How long a used per-request NIP-98 event id stays burned. Must exceed the
 *  verifier's ±60s acceptance window so an exact replay can never slip in after
 *  the guard expires but still inside the window. */
const NIP98_REPLAY_TTL_SECONDS = 150;

export type { AdminDeps } from './roles.ts';

/** The two bindings every admin auth route needs. SESSIONS/DB are additionally
 *  required by the elevation route and checked there. */
function adminConfigured(env: AdminEnv): env is AdminEnv & {
  ADMIN_SESSIONS: KVNamespace; ADMIN_COORD: DurableObjectNamespace;
} {
  return Boolean(env.ADMIN_SESSIONS && env.ADMIN_COORD);
}

/** Absolute URL the NIP-98 `u` tag must match — pinned to SITE_URL (config), not
 *  the request Host header, so a spoofed Host can't change what we accept. */
function adminUrl(request: Request, env: AdminEnv, path: string): string {
  const origin = env.SITE_URL ?? new URL(request.url).origin;
  return `${origin}${path}`;
}

/** Single-use NIP-98 event ids (THE replay gate for every per-request-signed
 *  route): false when the id was already seen, else burns it for longer than
 *  the verifier's ±60s acceptance window and returns true. */
async function burnNip98EventId(kv: KVNamespace, eventId: string): Promise<boolean> {
  const replayKey = `nip98:${eventId}`;
  if ((await kv.get(replayKey)) !== null) return false;
  await kv.put(replayKey, '1', { expirationTtl: NIP98_REPLAY_TTL_SECONDS });
  return true;
}

// ---- per-identity coordinator RPC (post-verification only; see coordinator.ts) ----

async function coord(
  ns: DurableObjectNamespace, method: AdminMethod, subject: string, path: string,
  body: Record<string, string>,
): Promise<{ status: number; data: Record<string, unknown> } | null> {
  try {
    const stub = ns.get(ns.idFromName(`${method}:${subject}`));
    const res = await stub.fetch(new Request(`https://admin-coord${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));
    return { status: res.status, data: (await res.json()) as Record<string, unknown> };
  } catch {
    return null; // coordinator unreachable → callers fail closed
  }
}

// ---- handlers ----

async function nostrChallenge(request: Request, env: AdminEnv): Promise<Response> {
  if (!adminConfigured(env)) return authError(503, 'admin not configured');
  if (await overRateLimit(env.AUTH_RATE_LIMITER, request, 'admin-login')) return authError(429, 'too many requests');
  return authJson({ challenge: await issueChallenge({ SESSIONS: env.ADMIN_SESSIONS }) });
}

async function nostrVerify(request: Request, env: AdminEnv, deps: AdminDeps): Promise<Response> {
  if (!adminConfigured(env)) return authError(503, 'admin not configured');
  if (await overRateLimit(env.AUTH_RATE_LIMITER, request, 'admin-login')) return authError(429, 'too many requests');
  const rawBody = await request.text();
  let parsed: { challenge?: string };
  try {
    parsed = JSON.parse(rawBody) as typeof parsed;
  } catch {
    return authError();
  }
  const proven = await verifyNostrAuth(
    { SESSIONS: env.ADMIN_SESSIONS },
    request.headers.get('authorization'),
    rawBody,
    adminUrl(request, env, '/api/admin/login/nostr/verify'),
    parsed.challenge ?? '',
  );
  if (!proven) return authError();
  // Membership (file ∪ roster) AFTER proof, same generic 401 as a failed proof
  // (no oracle). The resolved role rides the login response so the console can
  // route straight to the right panel without a second round-trip.
  const role = await resolveAdminRole('nostr', proven.pubkey, env, deps);
  if (!role) return authError();
  return openAdminSession(env, 'nostr', proven.pubkey, role);
}

async function elevateBluesky(request: Request, env: AdminEnv, deps: AdminDeps): Promise<Response> {
  if (!adminConfigured(env)) return authError(503, 'admin not configured');
  if (!env.SESSIONS || !env.DB) return authError(503, 'admin not configured');
  if (crossSiteRequest(request, env.SITE_URL)) return authError(403, 'cross-site request rejected');
  if (await overRateLimit(env.AUTH_RATE_LIMITER, request, 'admin-elevate')) return authError(429, 'too many requests');
  // Reuse-then-elevate: the ordinary Bluesky sign-in already proved control of the
  // DID via AT-Proto OAuth; here we re-read that PROVEN subject from the identity
  // model and gate it on the allowlist. No new OAuth dance, no new redirect URI.
  const resolved = await resolveSession(request, { SESSIONS: env.SESSIONS, DB: env.DB });
  if (!resolved) return authError();
  let did: string | null;
  try {
    did = await getIdentitySubject(env.DB, resolved.user.id, 'bluesky');
  } catch {
    return authError();
  }
  if (!did) return authError();
  const role = await resolveAdminRole('bluesky', did, env, deps);
  if (!role) return authError();
  return openAdminSession(env, 'bluesky', did, role);
}

/** Shared tail of both login paths: identity is PROVEN + ALLOWLISTED. Gate on the
 *  per-identity coordinator (velocity + CSRF mint), persist the session, set the
 *  __Host- Strict cookie. */
async function openAdminSession(
  env: AdminEnv & { ADMIN_SESSIONS: KVNamespace; ADMIN_COORD: DurableObjectNamespace },
  method: AdminMethod,
  subject: string,
  role: AdminRole,
): Promise<Response> {
  const id = newAdminSessionId();
  const opened = await coord(env.ADMIN_COORD, method, subject, '/open', { sessionId: id });
  if (!opened || opened.status !== 200 || opened.data.ok !== true) {
    return opened?.status === 429 ? authError(429, 'too many requests') : authError();
  }
  // Role is NOT persisted in the session record — it is re-derived per request
  // (resolveRoledAdmin) so a revocation takes effect next request. It rides the
  // response purely so the console can render the right panel immediately.
  await putAdminSession(env.ADMIN_SESSIONS, id, subject, method);
  return authJson(
    { identity: subject, method, role, csrf: opened.data.csrf },
    200,
    { 'set-cookie': adminSessionCookie(id) },
  );
}

/**
 * The single per-request enforcement choke point for every COOKIE-authenticated
 * admin route. Resolves the session (idle/absolute bounds) AND re-derives the
 * identity's role from the CURRENT effective set (file ∪ roster) — so removing a
 * principal (a file commit+deploy, or a roster remove) revokes every live
 * session on its NEXT request, not merely at expiry. A session whose identity
 * has been de-listed is destroyed, not just rejected. The role is derived here
 * per request and never stored in the session record. The NIP-98 API path
 * enforces membership inline (see whoami Path 2); this covers the browser path
 * and every privileged cookie route — route privileged reads/writes through
 * this, never through resolveAdminSessionId alone. Returns null → caller
 * responds 401.
 */
async function resolveRoledAdmin(
  request: Request,
  env: AdminEnv & { ADMIN_SESSIONS: KVNamespace },
  deps: AdminDeps,
): Promise<{ id: string; record: { subject: string; method: AdminMethod }; role: AdminRole } | null> {
  const session = await resolveAdminSessionId(env.ADMIN_SESSIONS, readCookie(request, ADMIN_SESSION_COOKIE));
  if (!session) return null;
  const { record } = session;
  const role = await resolveAdminRole(record.method, record.subject, env, deps);
  if (!role) {
    await destroyAdminSession(env.ADMIN_SESSIONS, session.id); // de-listed → kill the session
    return null;
  }
  return { ...session, role };
}

async function whoami(request: Request, env: AdminEnv, deps: AdminDeps): Promise<Response> {
  if (!adminConfigured(env)) return authError(503, 'admin not configured');

  // Path 1 — browser: the admin cookie session, its role re-derived from the
  // effective set (file ∪ roster) on EVERY request (resolveRoledAdmin) so a
  // revoked identity loses access on its next call, not at expiry. The CSRF token
  // rides along so a reloaded tab can still make its next state-changing call;
  // the response is same-origin-readable only (authJson sets no CORS) and the
  // token is useless without the HttpOnly cookie.
  const cookieId = readCookie(request, ADMIN_SESSION_COOKIE);
  if (cookieId) {
    const session = await resolveRoledAdmin(request, env, deps);
    if (!session) return authError();
    const { record } = session;
    const csrfRes = await coord(env.ADMIN_COORD, record.method, record.subject, '/csrf', { sessionId: session.id });
    const csrf = csrfRes?.status === 200 ? (csrfRes.data.csrf as string) : undefined;
    return authJson({ identity: record.subject, method: record.method, role: session.role, ...(csrf ? { csrf } : {}) });
  }

  // Path 2 — API client: per-request NIP-98 over this exact URL + method, with a
  // single-use event id (challenge-less requests are replay-bounded by burning the
  // id for longer than the verifier's acceptance window).
  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    const proven = await verifyNip98Event(authHeader, '', adminUrl(request, env, '/api/admin/whoami'), 'GET');
    if (!proven) return authError();
    const role = await resolveAdminRole('nostr', proven.pubkey, env, deps);
    if (!role) return authError();
    if (!(await burnNip98EventId(env.ADMIN_SESSIONS, proven.eventId))) return authError();
    return authJson({ identity: proven.pubkey, method: 'nostr', role });
  }

  return authError();
}

async function logout(request: Request, env: AdminEnv, deps: AdminDeps): Promise<Response> {
  if (!adminConfigured(env)) return authError(503, 'admin not configured');
  if (crossSiteRequest(request, env.SITE_URL)) return authError(403, 'cross-site request rejected');
  const session = await resolveAdminSessionId(env.ADMIN_SESSIONS, readCookie(request, ADMIN_SESSION_COOKIE));
  if (!session) return authError();
  const { record } = session;
  // Per-request role re-derivation, cookie path included — logout is not exempt.
  // A valid session id that reaches logout ALWAYS ends destroyed: membership
  // failure changes the status code, never leaves the record alive. The
  // coordinator is NOT consulted for a de-listed principal (it is only ever
  // reachable post-verification + membership); its orphaned CSRF entry is inert
  // once the session record is gone.
  if (!(await resolveAdminRole(record.method, record.subject, env, deps))) {
    await destroyAdminSession(env.ADMIN_SESSIONS, session.id);
    return authError();
  }
  // CSRF: the token minted at login (x-admin-csrf header) must validate against
  // the per-identity coordinator before the state change.
  const token = request.headers.get('x-admin-csrf') ?? '';
  const check = await coord(env.ADMIN_COORD, record.method, record.subject, '/check', { sessionId: session.id, token });
  if (!check || check.status !== 200 || check.data.ok !== true) return authError(403, 'invalid csrf token');
  await coord(env.ADMIN_COORD, record.method, record.subject, '/close', { sessionId: session.id });
  await destroyAdminSession(env.ADMIN_SESSIONS, session.id);
  return authJson({ ok: true }, 200, { 'set-cookie': clearAdminSessionCookie() });
}

// ---- Phase 3: superadmin roster management ----

/** Env narrowing for the management routes: the core admin bindings PLUS the D1
 *  DB the roster lives in. Here a missing DB is an explicit 503 — the inverse
 *  of the auth path's silent-empty roster (worker/admin/roles.ts) — because a
 *  management surface must never render a file-only view as if complete. */
function managementConfigured(env: AdminEnv): env is AdminEnv & {
  ADMIN_SESSIONS: KVNamespace; ADMIN_COORD: DurableObjectNamespace; DB: D1Database;
} {
  return adminConfigured(env) && Boolean(env.DB);
}

interface SuperadminActor { actor: string; method: AuditMethod }

/**
 * The single auth gate for the management routes: cookie session (role
 * re-derived from file ∪ roster on THIS request; coordinator CSRF for
 * mutations) OR per-request NIP-98 (Nostr file superadmins; single-use event
 * id — Bluesky superadmins manage via cookie+CSRF only, NIP-98 has no AT-Proto
 * analogue). Only a CURRENT 'superadmin' passes; everything short of that gets
 * the same generic 401 as any failed authentication — no role oracle. Returns
 * a ready-to-send failure Response otherwise.
 */
async function requireSuperadmin(
  request: Request,
  env: AdminEnv & { ADMIN_SESSIONS: KVNamespace; ADMIN_COORD: DurableObjectNamespace },
  deps: AdminDeps,
  opts: { path: string; httpMethod: 'GET' | 'POST'; rawBody: string; mutation: boolean },
): Promise<SuperadminActor | Response> {
  const cookieId = readCookie(request, ADMIN_SESSION_COOKIE);
  if (cookieId) {
    const session = await resolveRoledAdmin(request, env, deps);
    if (!session) return authError();
    if (session.role !== 'superadmin') return authError(); // same generic 401 — no role oracle
    if (opts.mutation) {
      const token = request.headers.get('x-admin-csrf') ?? '';
      const check = await coord(env.ADMIN_COORD, session.record.method, session.record.subject, '/check', { sessionId: session.id, token });
      if (!check || check.status !== 200 || check.data.ok !== true) return authError(403, 'invalid csrf token');
    }
    return { actor: `${session.record.method}:${session.record.subject}`, method: 'cookie' };
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    const proven = await verifyNip98Event(authHeader, opts.rawBody, adminUrl(request, env, opts.path), opts.httpMethod);
    if (!proven) return authError();
    if ((await resolveAdminRole('nostr', proven.pubkey, env, deps)) !== 'superadmin') return authError();
    if (!(await burnNip98EventId(env.ADMIN_SESSIONS, proven.eventId))) return authError();
    return { actor: `nostr:${proven.pubkey}`, method: 'nip98' };
  }

  return authError();
}

/** Parse + normalize a mutation's target principal through the SHARED
 *  validator (allowlist.ts normalizeSubject/isValidSubject — one validator,
 *  not two). Runs only AFTER successful superadmin auth, so there is no
 *  pre-auth format oracle. Accepts npub input for Nostr (decoded with the
 *  in-tree nostr-tools nip19) — the success response echoes the hex. */
function parseTargetPrincipal(body: { provider?: unknown; subject?: unknown }):
  { provider: AdminProvider; subject: string } | null {
  const provider = body.provider;
  if (provider !== 'nostr' && provider !== 'bluesky') return null;
  if (typeof body.subject !== 'string') return null;
  let subject = normalizeSubject(provider, body.subject);
  if (provider === 'nostr' && subject.startsWith('npub1')) {
    try {
      const decoded = nip19Decode(subject);
      if (decoded.type !== 'npub') return null;
      subject = normalizeSubject('nostr', decoded.data);
    } catch {
      return null; // malformed npub
    }
  }
  return isValidSubject(provider, subject) ? { provider, subject } : null;
}

async function adminsList(request: Request, env: AdminEnv, deps: AdminDeps): Promise<Response> {
  if (!managementConfigured(env)) return authError(503, 'admin not configured');
  if (await overRateLimit(env.AUTH_RATE_LIMITER, request, 'admin-manage')) return authError(429, 'too many requests');
  const gate = await requireSuperadmin(request, env, deps, {
    path: '/api/admin/admins', httpMethod: 'GET', rawBody: '', mutation: false,
  });
  if (gate instanceof Response) return gate;
  let roster;
  try {
    roster = await listRosterEntries(env.DB);
  } catch {
    return authError(503, 'roster unavailable'); // explicit — never a file-only list served as complete
  }
  const file = [
    ...deps.allowlist.nostr.filter(isWellFormedNostrEntry).map((e) => ({
      provider: 'nostr' as const, subject: e.pubkey.toLowerCase(), role: e.role, source: 'file' as const, immutable: true,
    })),
    ...deps.allowlist.bluesky.filter(isWellFormedBlueskyEntry).map((e) => ({
      provider: 'bluesky' as const, subject: e.did, role: e.role, source: 'file' as const, immutable: true,
    })),
  ];
  const runtime = roster.map((e) => ({
    provider: e.provider, subject: e.subject, role: 'admin' as const, source: 'roster' as const,
    added_by: e.added_by, added_at: e.added_at, ...(e.note ? { note: e.note } : {}),
  }));
  return authJson({ admins: [...file, ...runtime] });
}

async function adminsAdd(request: Request, env: AdminEnv, deps: AdminDeps): Promise<Response> {
  if (!managementConfigured(env)) return authError(503, 'admin not configured');
  if (crossSiteRequest(request, env.SITE_URL)) return authError(403, 'cross-site request rejected');
  if (await overRateLimit(env.AUTH_RATE_LIMITER, request, 'admin-manage')) return authError(429, 'too many requests');
  const rawBody = await request.text();
  const gate = await requireSuperadmin(request, env, deps, {
    path: '/api/admin/admins/add', httpMethod: 'POST', rawBody, mutation: true,
  });
  if (gate instanceof Response) return gate;
  let parsed: { provider?: unknown; subject?: unknown; note?: unknown };
  try {
    parsed = JSON.parse(rawBody) as typeof parsed;
  } catch {
    return authJson({ error: 'invalid body' }, 400);
  }
  const target = parseTargetPrincipal(parsed);
  if (!target) return authJson({ error: 'invalid principal' }, 400);
  // File principals are IMMUTABLE at runtime: adding one (whatever its recorded
  // role) is a conflict with the PR-governed tier, never a roster write.
  if (adminRoleFor(deps.allowlist, target.provider, target.subject)) {
    return authJson({ error: 'file-resident principal (PR-governed)' }, 409);
  }
  const note = sanitizeDisplayName(typeof parsed.note === 'string' ? parsed.note : null);
  try {
    if (await rosterHas(env.DB, target.provider, target.subject)) return authJson({ error: 'already an admin' }, 409);
    await addRosterEntry(env.DB, { ...target, actor: gate.actor, method: gate.method, note, now: Date.now() });
  } catch {
    return authError(503, 'roster unavailable');
  }
  return authJson({ ok: true, provider: target.provider, subject: target.subject, role: 'admin', ...(note ? { note } : {}) });
}

async function adminsRemove(request: Request, env: AdminEnv, deps: AdminDeps): Promise<Response> {
  if (!managementConfigured(env)) return authError(503, 'admin not configured');
  if (crossSiteRequest(request, env.SITE_URL)) return authError(403, 'cross-site request rejected');
  if (await overRateLimit(env.AUTH_RATE_LIMITER, request, 'admin-manage')) return authError(429, 'too many requests');
  const rawBody = await request.text();
  const gate = await requireSuperadmin(request, env, deps, {
    path: '/api/admin/admins/remove', httpMethod: 'POST', rawBody, mutation: true,
  });
  if (gate instanceof Response) return gate;
  let parsed: { provider?: unknown; subject?: unknown };
  try {
    parsed = JSON.parse(rawBody) as typeof parsed;
  } catch {
    return authJson({ error: 'invalid body' }, 400);
  }
  const target = parseTargetPrincipal(parsed);
  if (!target) return authJson({ error: 'invalid principal' }, 400);
  // Runtime can NEVER revoke a file principal — superadmin and file admin alike.
  if (adminRoleFor(deps.allowlist, target.provider, target.subject)) {
    return authJson({ error: 'file-resident principal is immutable at runtime' }, 403);
  }
  try {
    if (!(await rosterHas(env.DB, target.provider, target.subject))) return authJson({ error: 'not found' }, 404);
    await removeRosterEntry(env.DB, { ...target, actor: gate.actor, method: gate.method, now: Date.now() });
  } catch {
    return authError(503, 'roster unavailable');
  }
  // Best-effort purge of the removed admin's live sessions; the per-request
  // role re-derivation above stays authoritative either way.
  await purgeAdminSessions(env.ADMIN_SESSIONS, target.provider, target.subject);
  return authJson({ ok: true, provider: target.provider, subject: target.subject });
}

export async function routeAdmin(
  request: Request,
  env: AdminEnv,
  deps: AdminDeps = DEFAULT_ADMIN_DEPS,
): Promise<Response> {
  const path = new URL(request.url).pathname;
  const method = request.method.toUpperCase();
  if (path === '/api/admin/login/nostr/challenge' && method === 'POST') return nostrChallenge(request, env);
  if (path === '/api/admin/login/nostr/verify' && method === 'POST') return nostrVerify(request, env, deps);
  if (path === '/api/admin/elevate/bluesky' && method === 'POST') return elevateBluesky(request, env, deps);
  if (path === '/api/admin/whoami' && method === 'GET') return whoami(request, env, deps);
  if (path === '/api/admin/logout' && method === 'POST') return logout(request, env, deps);
  if (path === '/api/admin/admins' && method === 'GET') return adminsList(request, env, deps);
  if (path === '/api/admin/admins/add' && method === 'POST') return adminsAdd(request, env, deps);
  if (path === '/api/admin/admins/remove' && method === 'POST') return adminsRemove(request, env, deps);
  // Deny-by-default: unknown paths and wrong methods fail closed.
  return authJson({ error: 'not found' }, 404);
}
