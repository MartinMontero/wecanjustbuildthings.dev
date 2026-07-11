/**
 * Cloudflare Worker entry. Serves the static site (ASSETS binding) and the live
 * APIs the in-browser tools call:
 *
 *   GET  /api/health
 *   GET  /api/license?eco=&name=            → live registry license lookup
 *   GET  /api/github/status                 → is the GitHub one-click configured?
 *   GET  /api/github/start?redirect=        → begin GitHub OAuth
 *   GET  /api/github/callback               → finish OAuth, set short-lived token cookie
 *   POST /api/github/create                 → create a repo and push the starter files
 *   GET  /api/auth/session                  → current session (authenticated? + user)
 *   POST /api/auth/logout                   → destroy the session and clear its cookie
 *   POST /api/auth/nostr/challenge          → issue a single-use NIP-98 sign-in challenge
 *   POST /api/auth/nostr/verify             → verify a signed NIP-98 event → session
 *   GET  /api/auth/nostr/status             → is Sign in with Nostr configured?
 *   GET  /api/auth/bluesky/status           → is Sign in with Bluesky configured?
 *   GET  /api/auth/bluesky/client-metadata.json → public AT Proto OAuth client metadata
 *   GET  /api/auth/bluesky/start?handle=    → begin AT Proto OAuth (redirect to PDS)
 *   GET  /api/auth/bluesky/callback         → finish OAuth → session (identity only)
 *
 * Static assets are served by the asset layer first; this Worker only runs for
 * /api/* routes, with env.ASSETS as the fallback for anything else.
 */
import type { KVNamespace, D1Database, RateLimit, DurableObjectNamespace } from './auth/cf.ts';
import { routeAdmin } from './admin/router.ts';
import { AdminCoordinator } from './admin/coordinator.ts';
import { authJson, authError } from './auth/respond.ts';
import {
  resolveSession, destroySession, createSession, sessionCookie, clearSessionCookie,
  readCookie, SESSION_COOKIE, type AuthEnv,
} from './auth/session.ts';
import { issueChallenge, verifyNostrAuth, sanitizeDisplayName } from './auth/nostr.ts';
import { overRateLimit, crossSiteRequest } from './auth/guards.ts';
import {
  blueskyClientMetadata, blueskyAuthorizeUrl, blueskyCallback, isValidHandle, type BlueskyEnv,
} from './auth/bluesky.ts';
import { getOrCreateUserByIdentity } from './auth/db.ts';
import { estimate, coerceUsageProfile } from '../src/modules/cost-estimator/core/estimator.ts';
import { ALL_ADAPTERS } from '../src/modules/cost-estimator/adapters/index.ts';
import type { UsageProfile } from '../src/modules/cost-estimator/core/types.ts';
import { SECURITY_HEADERS, CSP_REPORT_PATH, CSP_REPORT_MAX_BYTES, summariseCspReport } from '../src/lib/security-headers.ts';

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  // The OAuth *app* identity — registered once by the maintainer. This is NOT a
  // per-user credential: every builder authorizes with their own GitHub account,
  // and repos are created with that builder's own token (see githubCreate).
  GITHUB_OAUTH_CLIENT_ID?: string;
  GITHUB_OAUTH_CLIENT_SECRET?: string;
  // NOTE: deliberately no shared GITHUB_TOKEN. Repo creation MUST use each
  // builder's own OAuth token (the gh_token cookie) so repos land in their
  // account, not the maintainer's. Do not add a server token fallback here.
  // Auth (Sign in with Nostr / Bluesky). Optional: when a binding is unset the
  // auth endpoints degrade gracefully (report "not authenticated") so the site
  // still runs without auth provisioned.
  SESSIONS?: KVNamespace; // app sessions (sess:<id>) + single-use Nostr challenges (chal:<v>)
  ATPROTO?: KVNamespace;  // AT Proto OAuth state/session stores + did/handle caches (Phase 3)
  DB?: D1Database;        // identity model — users, identities (migrations/0001_auth.sql)
  SITE_URL?: string;      // canonical origin for OAuth client metadata + redirects
  // Secret: the app's ES256 private key (JWK JSON) used to sign private_key_jwt
  // client assertions for Sign in with Bluesky. Set with `wrangler secret put`.
  // The matching public JWK is derived at runtime and published in the client metadata.
  BLUESKY_PRIVATE_KEY_JWK?: string;
  // Native per-colo rate limiter (wrangler.jsonc `ratelimits`). Optional: when the
  // binding is absent (local dev, tests, older deploy) the guards no-op so the site
  // still works — the limiter only ever tightens, never breaks, a request path.
  AUTH_RATE_LIMITER?: RateLimit;
  // Admin panel bindings (Phase 1 scaffold). Optional so the admin surface fails
  // closed when unprovisioned; see worker/admin/* and docs/admin-panel-spec.md.
  ADMIN_COORD?: DurableObjectNamespace; // per-identity coordinator DO (CSRF + rate-limit)
  ADMIN_SESSIONS?: KVNamespace;          // opaque admin sessions (separate from SESSIONS)
  ADMIN_DB?: D1Database;                 // Phase-3 admin storage (staging + action audit)
}

const UA = 'wecanjustbuildthings/1.0 (+https://wecanjustbuildthings.dev)';


function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', ...extraHeaders },
  });
}

async function getJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export function normalizeRepo(url?: string): string | undefined {
  if (!url) return undefined;
  let u = String(url).replace(/^git\+/, '').replace(/^git:\/\//, 'https://').replace(/\.git($|[#?])/, '$1');
  if (/^[\w.-]+\/[\w.-]+$/.test(u)) u = `https://github.com/${u}`;
  return /^https?:\/\//.test(u) ? u : undefined;
}

async function licenseHandler(url: URL): Promise<Response> {
  const name = url.searchParams.get('name')?.trim();
  const eco = (url.searchParams.get('eco') || 'js').trim();
  if (!name) return json({ error: 'missing name' }, 400);
  let license: string | undefined, version: string | undefined, repo: string | undefined;
  if (eco === 'js') {
    const d = await getJson(`https://registry.npmjs.org/${name.replace('/', '%2F')}`);
    if (d) { version = d['dist-tags']?.latest; license = typeof d.license === 'string' ? d.license : d.versions?.[version ?? '']?.license; repo = normalizeRepo(d.repository?.url ?? d.repository); }
  } else if (eco === 'py') {
    const d = await getJson(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`); const i = d?.info;
    if (i) { version = i.version; license = i.license_expression || (typeof i.license === 'string' && i.license.length < 40 ? i.license : undefined); const u = i.project_urls ?? {}; repo = normalizeRepo(u.Source ?? u.Repository ?? u.Homepage ?? i.home_page); }
  } else if (eco === 'rust') {
    const d = await getJson(`https://crates.io/api/v1/crates/${encodeURIComponent(name)}`);
    if (d?.versions?.[0]) { version = d.versions[0].num; license = d.versions[0].license; repo = normalizeRepo(d.crate?.repository); }
  } else if (eco === 'go') {
    if (name.startsWith('github.com/')) repo = `https://${name}`;
    const d = await getJson(`https://proxy.golang.org/${name.replace(/[A-Z]/g, (c) => `!${c.toLowerCase()}`)}/@latest`); version = d?.Version;
  } else if (eco === 'ruby') {
    const d = await getJson(`https://rubygems.org/api/v1/gems/${encodeURIComponent(name)}.json`);
    if (d) { version = d.version; license = d.licenses?.[0]; repo = normalizeRepo(d.source_code_uri ?? d.homepage_uri); }
  } else if (eco === 'elixir') {
    const d = await getJson(`https://hex.pm/api/packages/${encodeURIComponent(name)}`);
    if (d) { version = d.releases?.[0]?.version; license = d.meta?.licenses?.[0]; }
  }
  // License/version metadata changes slowly; cache it so repeat catalog lookups on
  // this now-live (run_worker_first) endpoint don't re-hit the upstream registry
  // every time — saves an outbound round-trip and eases third-party rate limits.
  return json({ name, eco, license: license ?? null, version: version ?? null, repo: repo ?? null }, 200, {
    'cache-control': 'public, max-age=3600',
  });
}

/** Path A for the Hosting Cost Estimator: compute pricing server-side at request
 *  time and return normalized results. Same deterministic estimator core + the
 *  same in-bounds adapters the browser uses (Path C) — only the fetch location
 *  differs. Stateless, thin, model-free. */
async function pricingHandler(request: Request): Promise<Response> {
  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'invalid JSON' }, 400); }
  if (!body?.usage || typeof body.usage !== 'object') return json({ error: 'missing usage profile' }, 400);
  // Untrusted, unauthenticated input — normalise every field before any arithmetic.
  const usage: UsageProfile = coerceUsageProfile(body.usage);
  const est = await estimate({ usage, adapters: ALL_ADAPTERS, fetcher: (u, init) => fetch(u, init), dataSource: 'pathA-function' });
  return json(est);
}

// ---- GitHub one-click ----
export function cookie(request: Request, name: string): string | undefined {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) { const [k, ...v] = part.trim().split('='); if (k === name) return decodeURIComponent(v.join('=')); }
  return undefined;
}

/** Same-origin path only — never an absolute, scheme, or protocol-relative URL.
 *  The post-OAuth redirect target is attacker-influenceable (?redirect= → cookie),
 *  so anything that isn't a single-slash local path is rejected to the fallback.
 *  This is what prevents the OAuth flow from becoming an open redirect. */
export function safeLocalPath(p: string | null | undefined, fallback = '/build/'): string {
  if (!p || !p.startsWith('/') || p.startsWith('//') || p.startsWith('/\\')) return fallback;
  return p;
}

function backTo(origin: string, back: string, params: string, extraHeaders: [string, string][] = []): Response {
  const path = safeLocalPath(back);
  const sep = path.includes('?') ? '&' : '?';
  return new Response(null, { status: 302, headers: [['location', `${origin}${path}${sep}${params}`], ...extraHeaders] as any });
}

function githubStart(url: URL, env: Env): Response {
  const redirectBack = safeLocalPath(url.searchParams.get('redirect'));
  // Not configured: bounce back to the Studio with a friendly flag instead of
  // dumping JSON, since this endpoint is reached by a full-page navigation.
  if (!env.GITHUB_OAUTH_CLIENT_ID) return backTo(url.origin, redirectBack, 'gh=unconfigured');
  const state = crypto.randomUUID();
  const cbUrl = `${url.origin}/api/github/callback`;
  const auth = new URL('https://github.com/login/oauth/authorize');
  auth.searchParams.set('client_id', env.GITHUB_OAUTH_CLIENT_ID);
  auth.searchParams.set('scope', 'public_repo');
  auth.searchParams.set('state', state);
  auth.searchParams.set('redirect_uri', cbUrl);
  const cookies = [
    `gh_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
    `gh_back=${encodeURIComponent(redirectBack)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
  ];
  return new Response(null, { status: 302, headers: [['location', auth.toString()], ['set-cookie', cookies[0]!], ['set-cookie', cookies[1]!]] as any });
}

async function githubCallback(request: Request, url: URL, env: Env): Promise<Response> {
  // Always return to the Studio (not raw JSON): the user lands here via a
  // browser redirect from GitHub, so failures should surface in the UI.
  const back = safeLocalPath(cookie(request, 'gh_back'));
  const fail = (reason: string) => backTo(url.origin, back, `gh=error&reason=${reason}`);
  if (!env.GITHUB_OAUTH_CLIENT_ID || !env.GITHUB_OAUTH_CLIENT_SECRET) return fail('unconfigured');
  if (url.searchParams.get('error')) return fail('denied'); // user declined authorization
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state || state !== cookie(request, 'gh_state')) return fail('state');
  // Guard the upstream token exchange: a GitHub outage or network error mid-OAuth
  // must surface as the friendly gh=error redirect, not an uncaught Worker 500.
  let tok: any;
  try {
    const tokRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: env.GITHUB_OAUTH_CLIENT_ID, client_secret: env.GITHUB_OAUTH_CLIENT_SECRET, code }),
    });
    tok = await tokRes.json().catch(() => null);
  } catch {
    return fail('token');
  }
  if (!tok?.access_token) return fail('token');
  const sep = back.includes('?') ? '&' : '?';
  return new Response(null, {
    status: 302,
    headers: [
      ['location', `${url.origin}${back}${sep}gh=connected`],
      ['set-cookie', `gh_token=${tok.access_token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=900`],
    ] as any,
  });
}

// Bounds for the scaffold push. The Studio ships ~a dozen small text files; these
// caps stop a hostile or buggy caller from turning one authenticated request into
// thousands of GitHub subrequests or a multi-megabyte push (CWE-770). One PUT is
// issued per file, so the file count directly bounds the outbound fan-out.
const GH_MAX_FILES = 100;
const GH_MAX_FILE_BYTES = 512 * 1024;       // 512 KB per file
const GH_MAX_TOTAL_BYTES = 5 * 1024 * 1024; // 5 MB total

async function githubCreate(request: Request): Promise<Response> {
  // Cookie-authenticated (gh_token): answer through authJson so the response carries
  // no wildcard CORS and no-store (CWE-942), matching the auth-response invariant.
  const token = cookie(request, 'gh_token');
  if (!token) return authJson({ error: 'not authenticated; connect GitHub first' }, 401);
  // Reject an over-large body before buffering it into memory.
  const declaredBytes = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredBytes) && declaredBytes > GH_MAX_TOTAL_BYTES) return authJson({ error: 'payload too large' }, 413);
  let body: any; try { body = await request.json(); } catch { return authJson({ error: 'invalid JSON' }, 400); }
  const repo = String(body.repo || '').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 90);
  const files = body.files;
  if (!repo || !files || typeof files !== 'object' || Array.isArray(files)) return authJson({ error: 'missing repo or files' }, 400);
  const entries = Object.entries(files as Record<string, unknown>);
  if (entries.length === 0) return authJson({ error: 'no files' }, 400);
  if (entries.length > GH_MAX_FILES) return authJson({ error: `too many files (max ${GH_MAX_FILES})` }, 413);
  let totalBytes = 0;
  for (const [path, content] of entries) {
    if (typeof content !== 'string') return authJson({ error: `file "${path}" is not text` }, 400);
    const bytes = new TextEncoder().encode(content).length;
    if (bytes > GH_MAX_FILE_BYTES) return authJson({ error: `file "${path}" exceeds ${GH_MAX_FILE_BYTES} bytes` }, 413);
    totalBytes += bytes;
    if (totalBytes > GH_MAX_TOTAL_BYTES) return authJson({ error: 'payload too large' }, 413);
  }
  const gh = (path: string, init: RequestInit = {}) =>
    fetch(`https://api.github.com${path}`, { ...init, headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': UA, ...(init.headers || {}) } });

  const created = await gh('/user/repos', { method: 'POST', body: JSON.stringify({ name: repo, private: false, auto_init: true, description: 'Scaffolded by wecanjustbuildthings.dev' }) });
  const repoJson = await created.json().catch(() => null) as any;
  if (!created.ok) return authJson({ error: 'repo creation failed', detail: repoJson?.message }, 502);
  const fullName = repoJson.full_name as string;
  const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));
  for (const [path, content] of entries) {
    await gh(`/repos/${fullName}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`, {
      method: 'PUT',
      body: JSON.stringify({ message: `add ${path}`, content: b64(content as string) }),
    });
  }
  return authJson({ url: repoJson.html_url });
}

/** Auth needs both its KV (sessions) and D1 (identities) bindings. When either is
 *  missing the feature is simply not provisioned — narrow Env to the satisfied
 *  AuthEnv so callers can use the bindings without `!`. */
function authConfigured(env: Env): env is Env & AuthEnv {
  return Boolean(env.SESSIONS && env.DB);
}

async function authSessionHandler(request: Request, env: Env): Promise<Response> {
  if (!authConfigured(env)) return authJson({ authenticated: false });
  const resolved = await resolveSession(request, env);
  if (!resolved) return authJson({ authenticated: false });
  // Expose only non-identifying, user-facing fields — never the pubkey/DID subject.
  return authJson({ authenticated: true, user: { id: resolved.user.id, displayName: resolved.user.displayName } });
}

async function authLogoutHandler(request: Request, env: Env): Promise<Response> {
  // Reject cross-site POSTs so a third-party page can't force a client-side logout
  // (cookie-clearing CSRF, CWE-352). Same-origin/direct requests proceed.
  if (crossSiteRequest(request, env.SITE_URL)) return authError(403, 'cross-site request rejected');
  // Always clear the cookie, even if storage is unconfigured or the id is stale.
  if (authConfigured(env)) {
    const id = readCookie(request, SESSION_COOKIE);
    if (id) await destroySession(env, id);
  }
  return authJson({ ok: true }, 200, { 'set-cookie': clearSessionCookie() });
}

/** Absolute URL the NIP-98 `u` tag must match. Pinned to SITE_URL (config), not
 *  the request Host header, so a spoofed Host can't change what we accept. */
function nostrVerifyUrl(request: Request, env: Env): string {
  const origin = env.SITE_URL ?? new URL(request.url).origin;
  return `${origin}/api/auth/nostr/verify`;
}

async function nostrChallengeHandler(request: Request, env: Env): Promise<Response> {
  if (!authConfigured(env)) return authError(503, 'auth not configured');
  // Unauthenticated + writes a KV challenge per call — rate-limit so a script can't
  // exhaust the KV write budget and take down all sign-in (CWE-770).
  if (await overRateLimit(env.AUTH_RATE_LIMITER, request, 'nostr-challenge')) return authError(429, 'too many requests');
  return authJson({ challenge: await issueChallenge(env) });
}

async function nostrVerifyHandler(request: Request, env: Env): Promise<Response> {
  if (!authConfigured(env)) return authError(503, 'auth not configured');
  if (await overRateLimit(env.AUTH_RATE_LIMITER, request, 'nostr-verify')) return authError(429, 'too many requests');
  const rawBody = await request.text();
  let parsed: { challenge?: string; displayName?: string };
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return authError();
  }
  const result = await verifyNostrAuth(
    env, request.headers.get('authorization'), rawBody, nostrVerifyUrl(request, env), parsed.challenge ?? '',
  );
  if (!result) return authError(); // one generic 401 for every failure mode
  const user = await getOrCreateUserByIdentity(env.DB, 'nostr', result.pubkey, sanitizeDisplayName(parsed.displayName));
  const sid = await createSession(env, user);
  return authJson(
    { authenticated: true, user: { id: user.id, displayName: user.displayName } },
    200,
    { 'set-cookie': sessionCookie(sid) },
  );
}

// ---- Sign in with Bluesky (AT Protocol OAuth) ----
/** Bluesky sign-in needs its KV store, the canonical origin, and the signing key.
 *  When any is missing the feature is simply not provisioned. */
function blueskyConfigured(env: Env): env is Env & BlueskyEnv {
  return Boolean(env.ATPROTO && env.SITE_URL && env.BLUESKY_PRIVATE_KEY_JWK);
}

/** Public OAuth client metadata, fetched by the authorization server. No auth; safe
 *  to cache briefly. 503 when not provisioned so the absence is explicit. */
async function blueskyMetadataHandler(env: Env): Promise<Response> {
  if (!blueskyConfigured(env)) return json({ error: 'bluesky sign-in not configured' }, 503);
  try {
    return json(await blueskyClientMetadata(env), 200, { 'cache-control': 'public, max-age=300' });
  } catch {
    return json({ error: 'failed to build client metadata' }, 500);
  }
}

/** Begin sign-in. Reached by a full-page navigation, so every outcome is a redirect
 *  back to the studio with a flag (never raw JSON). */
async function blueskyStartHandler(request: Request, url: URL, env: Env): Promise<Response> {
  const back = safeLocalPath(url.searchParams.get('redirect'));
  if (!blueskyConfigured(env)) return backTo(url.origin, back, 'bsky=unconfigured');
  // Unauthenticated + writes OAuth state to KV and resolves the handle upstream —
  // rate-limit to bound KV-write and outbound-resolution abuse (CWE-770).
  if (await overRateLimit(env.AUTH_RATE_LIMITER, request, 'bluesky-start')) return backTo(url.origin, back, 'bsky=error&reason=rate');
  const handle = url.searchParams.get('handle') || '';
  if (!isValidHandle(handle)) return backTo(url.origin, back, 'bsky=error&reason=handle');
  try {
    const { url: authUrl, state } = await blueskyAuthorizeUrl(env, handle);
    // Bind the OAuth `state` to THIS browser via an HttpOnly cookie so the callback
    // can verify the completing browser is the one that started (login-CSRF defense,
    // mirroring GitHub's gh_state). Remember the return path the same way.
    const stateCookie = `bsky_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`;
    const backCookie = `bsky_back=${encodeURIComponent(back)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`;
    return new Response(null, { status: 302, headers: [['location', authUrl.toString()], ['set-cookie', stateCookie], ['set-cookie', backCookie]] as any });
  } catch (err) {
    // Don't swallow the real failure: the previous bare `catch {}` hid a
    // deterministic runtime error (the atproto resolvers' `redirect: 'error'`
    // being rejected by workerd) behind a generic banner for anyone diagnosing
    // it. Log the error's name/message/cause so it lands in Workers Logs
    // (observability is on) — this pre-authorization path handles no token,
    // cookie, or key material, so there is nothing secret to redact; the user
    // still sees only the generic `bsky=error` banner. (See worker/auth/bluesky.ts
    // edgeFetch for the workerd redirect fix.)
    const e = err as { name?: string; message?: string; cause?: { message?: string } };
    console.error('[bsky] authorize failed:', e?.name, '|', e?.message, '| cause:', e?.cause?.message);
    return backTo(url.origin, back, 'bsky=error&reason=authorize');
  }
}

/** Finish sign-in: verify the redirect, turn the DID into our own session, drop the
 *  AT Proto tokens (identity only — see blueskyCallback), and bounce back to the studio. */
async function blueskyCallbackHandler(request: Request, url: URL, env: Env): Promise<Response> {
  const back = safeLocalPath(cookie(request, 'bsky_back'));
  const clearBack = 'bsky_back=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';
  const clearState = 'bsky_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';
  const fail = (reason: string) =>
    backTo(url.origin, back, `bsky=error&reason=${reason}`, [['set-cookie', clearBack], ['set-cookie', clearState]]);
  // Session creation needs SESSIONS + DB; the OAuth flow needs ATPROTO + key + origin.
  if (!blueskyConfigured(env) || !authConfigured(env)) return fail('unconfigured');
  if (url.searchParams.get('error')) return fail('denied'); // user declined authorization
  try {
    // The browser-bound state cookie set at start must round-trip and match.
    const expectedState = cookie(request, 'bsky_state');
    const { did, displayName } = await blueskyCallback(env, url.searchParams, expectedState);
    const user = await getOrCreateUserByIdentity(env.DB, 'bluesky', did, displayName);
    const sid = await createSession(env, user);
    const sep = back.includes('?') ? '&' : '?';
    return new Response(null, {
      status: 302,
      headers: [
        ['location', `${url.origin}${back}${sep}bsky=connected`],
        ['set-cookie', sessionCookie(sid)],
        ['set-cookie', clearBack],
        ['set-cookie', clearState],
      ] as any,
    });
  } catch {
    return fail('callback');
  }
}

/** Sink for CSP violation reports during the Report-Only soak. Parses each report into
 *  a compact, whitelisted summary and logs it as structured JSON (`[csp-report]`) so it
 *  persists in Workers Logs (observability, see wrangler.jsonc) and is reviewable for the
 *  whole soak — not only in an ephemeral `wrangler tail`. The endpoint is unauthenticated
 *  and same-origin: the body is size-bounded, fields are whitelisted/truncated, and it
 *  never throws (a malformed report must not surface to the reporter). */
async function cspReportHandler(request: Request): Promise<Response> {
  try {
    const declaredBytes = Number(request.headers.get('content-length') ?? '0');
    if (!Number.isFinite(declaredBytes) || declaredBytes > CSP_REPORT_MAX_BYTES) {
      return new Response(null, { status: 204 });
    }
    const raw = (await request.text()).slice(0, CSP_REPORT_MAX_BYTES);
    const summary = summariseCspReport(raw);
    if (summary) console.warn('[csp-report]', JSON.stringify(summary));
  } catch { /* ignore malformed reports */ }
  return new Response(null, { status: 204 });
}

/** Attach the always-on security headers to a Worker response. Rebuilds the
 *  response so the headers are mutable, preserving status and multi-value headers
 *  like Set-Cookie (the auth redirects set several). The hash-based CSP for HTML
 *  pages is delivered by the generated _headers file, not here. */
function withSecurityHeaders(response: Response): Response {
  const wrapped = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) wrapped.headers.set(name, value);
  return wrapped;
}

async function routeRequest(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === '/api/health') return json({ ok: true });
    if (path === CSP_REPORT_PATH && request.method === 'POST') return cspReportHandler(request);
    if (path === '/api/license') return licenseHandler(url);
    if (path === '/api/pricing' && request.method === 'POST') return pricingHandler(request);
    // Config-status booleans live in the auth namespace → answer through authJson
    // (no wildcard CORS, no-store), consistent with the auth-response invariant.
    if (path === '/api/github/status') return authJson({ configured: Boolean(env.GITHUB_OAUTH_CLIENT_ID) });
    if (path === '/api/github/start') return githubStart(url, env);
    if (path === '/api/github/callback') return githubCallback(request, url, env);
    if (path === '/api/github/create' && request.method === 'POST') return githubCreate(request);
    if (path === '/api/auth/session') return authSessionHandler(request, env);
    if (path === '/api/auth/logout' && request.method === 'POST') return authLogoutHandler(request, env);
    if (path === '/api/auth/nostr/challenge' && request.method === 'POST') return nostrChallengeHandler(request, env);
    if (path === '/api/auth/nostr/verify' && request.method === 'POST') return nostrVerifyHandler(request, env);
    if (path === '/api/auth/nostr/status') return authJson({ configured: authConfigured(env) });
    if (path === '/api/auth/bluesky/status') return authJson({ configured: blueskyConfigured(env) });
    if (path === '/api/auth/bluesky/client-metadata.json') return blueskyMetadataHandler(env);
    if (path === '/api/auth/bluesky/start') return blueskyStartHandler(request, url, env);
    if (path === '/api/auth/bluesky/callback') return blueskyCallbackHandler(request, url, env);
    // Admin panel sub-router (worker/admin/*). Fail-closed scaffold in Phase 1;
    // authenticated endpoints (whoami, login, elevation) land in Phase 2.
    if (path.startsWith('/api/admin/')) return routeAdmin(request, env);
    return env.ASSETS.fetch(request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // The Worker is authoritative for /api/* (run_worker_first), so there is no
    // asset-layer fallback on an unexpected throw. Convert one to a controlled,
    // security-headered 500 instead of Cloudflare's raw exception page.
    try {
      return withSecurityHeaders(await routeRequest(request, env));
    } catch {
      return withSecurityHeaders(json({ error: 'internal error' }, 500));
    }
  },
};

// Durable Object classes must be exported from the Worker's entry module so the
// runtime can bind them (wrangler.jsonc `durable_objects` → `ADMIN_COORD`).
export { AdminCoordinator };
