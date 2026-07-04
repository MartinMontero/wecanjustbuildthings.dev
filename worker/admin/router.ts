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
 * Everything else FAILS CLOSED with 404; missing bindings fail closed with 503.
 *
 * Security model:
 *   - The committed EMPTY allowlist (worker/admin/allowlist.ts) is checked
 *     server-side after every cryptographic verification. Allowlist rejection and
 *     verification failure return the SAME generic 401 — an attacker learns
 *     nothing about which gate stopped them. There is no bypass, no env override.
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
import { authJson, authError } from '../auth/respond.ts';
import { issueChallenge, verifyNostrAuth, verifyNip98Event } from '../auth/nostr.ts';
import { resolveSession, readCookie } from '../auth/session.ts';
import { getIdentitySubject } from '../auth/db.ts';
import { overRateLimit, crossSiteRequest } from '../auth/guards.ts';
import type { KVNamespace, DurableObjectNamespace } from '../auth/cf.ts';
import type { AdminEnv } from './types.ts';
import {
  ADMIN_ALLOWLIST, isAllowedNostrPubkey, isAllowedBlueskyDid, type AdminAllowlist,
} from './allowlist.ts';
import {
  ADMIN_SESSION_COOKIE, newAdminSessionId, putAdminSession, destroyAdminSession,
  resolveAdminSessionId, adminSessionCookie, clearAdminSessionCookie, type AdminMethod,
} from './session.ts';

/** How long a used per-request NIP-98 event id stays burned. Must exceed the
 *  verifier's ±60s acceptance window so an exact replay can never slip in after
 *  the guard expires but still inside the window. */
const NIP98_REPLAY_TTL_SECONDS = 150;

export interface AdminDeps {
  allowlist: AdminAllowlist;
}

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
  // Allowlist AFTER proof, same generic 401 as a failed proof (no oracle).
  if (!isAllowedNostrPubkey(deps.allowlist, proven.pubkey)) return authError();
  return openAdminSession(env, 'nostr', proven.pubkey);
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
  if (!did || !isAllowedBlueskyDid(deps.allowlist, did)) return authError();
  return openAdminSession(env, 'bluesky', did);
}

/** Shared tail of both login paths: identity is PROVEN + ALLOWLISTED. Gate on the
 *  per-identity coordinator (velocity + CSRF mint), persist the session, set the
 *  __Host- Strict cookie. */
async function openAdminSession(
  env: AdminEnv & { ADMIN_SESSIONS: KVNamespace; ADMIN_COORD: DurableObjectNamespace },
  method: AdminMethod,
  subject: string,
): Promise<Response> {
  const id = newAdminSessionId();
  const opened = await coord(env.ADMIN_COORD, method, subject, '/open', { sessionId: id });
  if (!opened || opened.status !== 200 || opened.data.ok !== true) {
    return opened?.status === 429 ? authError(429, 'too many requests') : authError();
  }
  await putAdminSession(env.ADMIN_SESSIONS, id, subject, method);
  return authJson(
    { identity: subject, method, csrf: opened.data.csrf },
    200,
    { 'set-cookie': adminSessionCookie(id) },
  );
}

/** True when a proven subject is STILL a member of the allowlist for its method. */
function isSubjectAllowed(allowlist: AdminAllowlist, method: AdminMethod, subject: string): boolean {
  return method === 'nostr'
    ? isAllowedNostrPubkey(allowlist, subject)
    : isAllowedBlueskyDid(allowlist, subject);
}

/**
 * The single per-request enforcement choke point for every COOKIE-authenticated
 * admin route. Resolves the session (idle/absolute bounds) AND re-checks that its
 * identity is STILL allowlisted — so removing an identity from the committed
 * allowlist revokes every live session on its NEXT request, not merely at expiry
 * (matching the governance model: revocation = commit + deploy, effective next
 * request). A session whose identity has been de-listed is destroyed, not just
 * rejected. The NIP-98 API path enforces membership inline (see whoami Path 2);
 * this covers the browser path and any future privileged cookie route — route
 * privileged reads/writes through this, never through resolveAdminSessionId alone.
 * Returns null → caller responds 401.
 */
async function resolveAllowlistedAdmin(
  request: Request,
  env: AdminEnv & { ADMIN_SESSIONS: KVNamespace },
  deps: AdminDeps,
): Promise<{ id: string; record: { subject: string; method: AdminMethod } } | null> {
  const session = await resolveAdminSessionId(env.ADMIN_SESSIONS, readCookie(request, ADMIN_SESSION_COOKIE));
  if (!session) return null;
  const { record } = session;
  if (!isSubjectAllowed(deps.allowlist, record.method, record.subject)) {
    await destroyAdminSession(env.ADMIN_SESSIONS, session.id); // de-listed → kill the session
    return null;
  }
  return session;
}

async function whoami(request: Request, env: AdminEnv, deps: AdminDeps): Promise<Response> {
  if (!adminConfigured(env)) return authError(503, 'admin not configured');

  // Path 1 — browser: the admin cookie session, re-checked against the allowlist on
  // EVERY request (resolveAllowlistedAdmin) so a revoked identity loses access on its
  // next call, not at expiry. The CSRF token rides along so a reloaded tab can still
  // make its next state-changing call; the response is same-origin-readable only
  // (authJson sets no CORS) and the token is useless without the HttpOnly cookie.
  const cookieId = readCookie(request, ADMIN_SESSION_COOKIE);
  if (cookieId) {
    const session = await resolveAllowlistedAdmin(request, env, deps);
    if (!session) return authError();
    const { record } = session;
    const csrfRes = await coord(env.ADMIN_COORD, record.method, record.subject, '/csrf', { sessionId: session.id });
    const csrf = csrfRes?.status === 200 ? (csrfRes.data.csrf as string) : undefined;
    return authJson({ identity: record.subject, method: record.method, ...(csrf ? { csrf } : {}) });
  }

  // Path 2 — API client: per-request NIP-98 over this exact URL + method, with a
  // single-use event id (challenge-less requests are replay-bounded by burning the
  // id for longer than the verifier's acceptance window).
  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    const proven = await verifyNip98Event(authHeader, '', adminUrl(request, env, '/api/admin/whoami'), 'GET');
    if (!proven) return authError();
    if (!isAllowedNostrPubkey(deps.allowlist, proven.pubkey)) return authError();
    const replayKey = `nip98:${proven.eventId}`;
    if ((await env.ADMIN_SESSIONS.get(replayKey)) !== null) return authError();
    await env.ADMIN_SESSIONS.put(replayKey, '1', { expirationTtl: NIP98_REPLAY_TTL_SECONDS });
    return authJson({ identity: proven.pubkey, method: 'nostr' });
  }

  return authError();
}

async function logout(request: Request, env: AdminEnv): Promise<Response> {
  if (!adminConfigured(env)) return authError(503, 'admin not configured');
  if (crossSiteRequest(request, env.SITE_URL)) return authError(403, 'cross-site request rejected');
  const session = await resolveAdminSessionId(env.ADMIN_SESSIONS, readCookie(request, ADMIN_SESSION_COOKIE));
  if (!session) return authError();
  const { record } = session;
  // CSRF: the token minted at login (x-admin-csrf header) must validate against
  // the per-identity coordinator before the state change.
  const token = request.headers.get('x-admin-csrf') ?? '';
  const check = await coord(env.ADMIN_COORD, record.method, record.subject, '/check', { sessionId: session.id, token });
  if (!check || check.status !== 200 || check.data.ok !== true) return authError(403, 'invalid csrf token');
  await coord(env.ADMIN_COORD, record.method, record.subject, '/close', { sessionId: session.id });
  await destroyAdminSession(env.ADMIN_SESSIONS, session.id);
  return authJson({ ok: true }, 200, { 'set-cookie': clearAdminSessionCookie() });
}

export async function routeAdmin(
  request: Request,
  env: AdminEnv,
  deps: AdminDeps = { allowlist: ADMIN_ALLOWLIST },
): Promise<Response> {
  const path = new URL(request.url).pathname;
  const method = request.method.toUpperCase();
  if (path === '/api/admin/login/nostr/challenge' && method === 'POST') return nostrChallenge(request, env);
  if (path === '/api/admin/login/nostr/verify' && method === 'POST') return nostrVerify(request, env, deps);
  if (path === '/api/admin/elevate/bluesky' && method === 'POST') return elevateBluesky(request, env, deps);
  if (path === '/api/admin/whoami' && method === 'GET') return whoami(request, env, deps);
  if (path === '/api/admin/logout' && method === 'POST') return logout(request, env);
  // Deny-by-default: unknown paths and wrong methods fail closed.
  return authJson({ error: 'not found' }, 404);
}
