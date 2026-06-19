/**
 * Cloudflare Worker entry. Serves the static site (ASSETS binding) and the live
 * APIs the in-browser tools call:
 *
 *   GET  /api/health
 *   GET  /api/license?eco=&name=            → live registry license lookup
 *   POST /api/agent/kickoff                 → one-shot, BYOK agent kickoff (permitted providers only)
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
import type { KVNamespace, D1Database } from './auth/cf.ts';
import { authJson, authError } from './auth/respond.ts';
import {
  resolveSession, destroySession, createSession, sessionCookie, clearSessionCookie,
  readCookie, SESSION_COOKIE, type AuthEnv,
} from './auth/session.ts';
import { issueChallenge, verifyNostrAuth, sanitizeDisplayName } from './auth/nostr.ts';
import {
  blueskyClientMetadata, blueskyAuthorizeUrl, blueskyCallback, isValidHandle, type BlueskyEnv,
} from './auth/bluesky.ts';
import { getOrCreateUserByIdentity } from './auth/db.ts';
import { estimate } from '../src/modules/cost-estimator/core/estimator.ts';
import { ALL_ADAPTERS } from '../src/modules/cost-estimator/adapters/index.ts';
import type { UsageProfile } from '../src/modules/cost-estimator/core/types.ts';
import { SECURITY_HEADERS, CSP_REPORT_PATH } from '../src/lib/security-headers.ts';

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
}

const UA = 'wecanjustbuildthings/1.0 (+https://wecanjustbuildthings.dev)';

// Permitted model providers only — OpenAI/xAI are excluded by policy and are not
// reachable through this endpoint, even with a key.
export const PROVIDERS: Record<string, { url: string; build: (model: string, prompt: string, key: string) => RequestInit; pick: (j: any) => string; defaultModel: string }> = {
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-sonnet-4-6',
    build: (model, prompt, key) => ({
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }),
    }),
    pick: (j) => j?.content?.[0]?.text ?? '',
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'anthropic/claude-3.5-sonnet',
    build: (model, prompt, key) => ({
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, 'HTTP-Referer': 'https://wecanjustbuildthings.dev', 'X-Title': 'We Can Just Build Things' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }),
    }),
    pick: (j) => j?.choices?.[0]?.message?.content ?? '',
  },
  deepseek: {
    url: 'https://api.deepseek.com/chat/completions',
    defaultModel: 'deepseek-chat',
    build: (model, prompt, key) => ({
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }),
    }),
    pick: (j) => j?.choices?.[0]?.message?.content ?? '',
  },
};

// OpenRouter is a gateway to every vendor — including excluded ones — so a BYOK
// caller could otherwise route to a Meta/OpenAI/xAI model through it. Gate brokered
// models with a default-deny ALLOWLIST of permitted vendor families: stronger than
// a denylist, since a new excluded vendor, alias, or typo can't slip through. The
// list is curated and intentionally conservative — add vendors deliberately.
const PERMITTED_ROUTER_VENDORS = new Set([
  'anthropic', 'google', 'deepseek', 'mistralai', 'mistral', 'qwen', 'qwen2',
  'cohere', 'nousresearch', 'microsoft', 'nvidia', 'amazon', 'ai21', 'perplexity', 'liquid',
]);

/** Vendor segment of an OpenRouter model id ("anthropic/claude-3.5" → "anthropic"). */
function routerVendor(model: string): string {
  return model.trim().toLowerCase().split('/')[0] ?? '';
}

/** Owned by an excluded org (Meta/OpenAI/xAI) — a hard block, even if a vendor is
 *  mistakenly added to the allowlist. Belt-and-suspenders for the policy-critical case. */
export function isExcludedRouterModel(provider: string, model: string): boolean {
  if (provider !== 'openrouter') return false;
  return /^(openai|meta-llama|meta|x-ai|xai)$/i.test(routerVendor(model));
}

/** Default-deny: through the OpenRouter broker, only vetted non-excluded vendor
 *  families may be requested. Direct providers hit a hardcoded safe host, so they
 *  are already constrained and always pass. (Google is NOT excluded.) */
export function isPermittedRouterModel(provider: string, model: string): boolean {
  if (provider !== 'openrouter') return true;
  if (isExcludedRouterModel(provider, model)) return false;
  return PERMITTED_ROUTER_VENDORS.has(routerVendor(model));
}

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
  return json({ name, eco, license: license ?? null, version: version ?? null, repo: repo ?? null });
}

async function kickoffHandler(request: Request): Promise<Response> {
  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'invalid JSON' }, 400); }
  const provider = String(body.provider || '').toLowerCase();
  const apiKey = String(body.apiKey || '');
  const prompt = String(body.prompt || '');
  if (!provider || !PROVIDERS[provider]) {
    return json({ error: `Provider must be one of: ${Object.keys(PROVIDERS).join(', ')} (OpenAI/xAI are excluded by policy).` }, 400);
  }
  if (!apiKey) return json({ error: 'missing apiKey (bring your own key)' }, 400);
  if (!prompt) return json({ error: 'missing prompt' }, 400);
  const p = PROVIDERS[provider];
  const model = String(body.model || p.defaultModel);
  if (!isPermittedRouterModel(provider, model)) {
    return json({ error: `Model "${model}" is not on the permitted list for the OpenRouter broker — only vetted, non-excluded vendor families are allowed (Meta/OpenAI/xAI are blocked by policy). Pick a permitted model.` }, 400);
  }
  try {
    const res = await fetch(p.url, { ...p.build(model, prompt, apiKey), signal: AbortSignal.timeout(60000) });
    const text = await res.text();
    let parsed: any; try { parsed = JSON.parse(text); } catch { parsed = null; }
    if (!res.ok) return json({ error: `Provider returned ${res.status}`, detail: parsed?.error ?? text.slice(0, 300) }, 502);
    return json({ provider, model, output: p.pick(parsed) });
  } catch (e) {
    return json({ error: `Request to ${provider} failed`, detail: String(e) }, 502);
  }
}

/** Path A for the Hosting Cost Estimator: compute pricing server-side at request
 *  time and return normalized results. Same deterministic estimator core + the
 *  same in-bounds adapters the browser uses (Path C) — only the fetch location
 *  differs. Stateless, thin, model-free. */
async function pricingHandler(request: Request): Promise<Response> {
  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'invalid JSON' }, 400); }
  const usage = body?.usage as UsageProfile | undefined;
  if (!usage || typeof usage !== 'object') return json({ error: 'missing usage profile' }, 400);
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
  const tokRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: env.GITHUB_OAUTH_CLIENT_ID, client_secret: env.GITHUB_OAUTH_CLIENT_SECRET, code }),
  });
  const tok = await tokRes.json().catch(() => null) as any;
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

async function githubCreate(request: Request): Promise<Response> {
  const token = cookie(request, 'gh_token');
  if (!token) return json({ error: 'not authenticated; connect GitHub first' }, 401);
  let body: any; try { body = await request.json(); } catch { return json({ error: 'invalid JSON' }, 400); }
  const repo = String(body.repo || '').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 90);
  const files = body.files as Record<string, string>;
  if (!repo || !files) return json({ error: 'missing repo or files' }, 400);
  const gh = (path: string, init: RequestInit = {}) =>
    fetch(`https://api.github.com${path}`, { ...init, headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': UA, ...(init.headers || {}) } });

  const created = await gh('/user/repos', { method: 'POST', body: JSON.stringify({ name: repo, private: false, auto_init: true, description: 'Scaffolded by wecanjustbuildthings.dev' }) });
  const repoJson = await created.json().catch(() => null) as any;
  if (!created.ok) return json({ error: 'repo creation failed', detail: repoJson?.message }, 502);
  const fullName = repoJson.full_name as string;
  const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));
  for (const [path, content] of Object.entries(files)) {
    await gh(`/repos/${fullName}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`, {
      method: 'PUT',
      body: JSON.stringify({ message: `add ${path}`, content: b64(content) }),
    });
  }
  return json({ url: repoJson.html_url });
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

async function nostrChallengeHandler(env: Env): Promise<Response> {
  if (!authConfigured(env)) return authError(503, 'auth not configured');
  return authJson({ challenge: await issueChallenge(env) });
}

async function nostrVerifyHandler(request: Request, env: Env): Promise<Response> {
  if (!authConfigured(env)) return authError(503, 'auth not configured');
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
  const sid = await createSession(env, user.id);
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
async function blueskyStartHandler(url: URL, env: Env): Promise<Response> {
  const back = safeLocalPath(url.searchParams.get('redirect'));
  if (!blueskyConfigured(env)) return backTo(url.origin, back, 'bsky=unconfigured');
  const handle = url.searchParams.get('handle') || '';
  if (!isValidHandle(handle)) return backTo(url.origin, back, 'bsky=error&reason=handle');
  try {
    const authUrl = await blueskyAuthorizeUrl(env, handle);
    // Remember where to return after the PDS bounces back (same pattern as GitHub).
    const backCookie = `bsky_back=${encodeURIComponent(back)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`;
    return new Response(null, { status: 302, headers: [['location', authUrl.toString()], ['set-cookie', backCookie]] as any });
  } catch {
    return backTo(url.origin, back, 'bsky=error&reason=authorize');
  }
}

/** Finish sign-in: verify the redirect, turn the DID into our own session, drop the
 *  AT Proto tokens (identity only — see blueskyCallback), and bounce back to the studio. */
async function blueskyCallbackHandler(request: Request, url: URL, env: Env): Promise<Response> {
  const back = safeLocalPath(cookie(request, 'bsky_back'));
  const clearBack = 'bsky_back=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';
  const fail = (reason: string) =>
    backTo(url.origin, back, `bsky=error&reason=${reason}`, [['set-cookie', clearBack]]);
  // Session creation needs SESSIONS + DB; the OAuth flow needs ATPROTO + key + origin.
  if (!blueskyConfigured(env) || !authConfigured(env)) return fail('unconfigured');
  if (url.searchParams.get('error')) return fail('denied'); // user declined authorization
  try {
    const { did, displayName } = await blueskyCallback(env, url.searchParams);
    const user = await getOrCreateUserByIdentity(env.DB, 'bluesky', did, displayName);
    const sid = await createSession(env, user.id);
    const sep = back.includes('?') ? '&' : '?';
    return new Response(null, {
      status: 302,
      headers: [
        ['location', `${url.origin}${back}${sep}bsky=connected`],
        ['set-cookie', sessionCookie(sid)],
        ['set-cookie', clearBack],
      ] as any,
    });
  } catch {
    return fail('callback');
  }
}

/** Sink for CSP violation reports during the Report-Only soak. Logs them (visible
 *  via `wrangler tail`) so a missing directive surfaces before we flip to enforce.
 *  Same-origin only — the report-uri is a local path. */
async function cspReportHandler(request: Request): Promise<Response> {
  try {
    const report = await request.text();
    if (report) console.warn('[csp-report]', report.slice(0, 2000));
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
    if (path === '/api/agent/kickoff' && request.method === 'POST') return kickoffHandler(request);
    if (path === '/api/github/status') return json({ configured: Boolean(env.GITHUB_OAUTH_CLIENT_ID) });
    if (path === '/api/github/start') return githubStart(url, env);
    if (path === '/api/github/callback') return githubCallback(request, url, env);
    if (path === '/api/github/create' && request.method === 'POST') return githubCreate(request);
    if (path === '/api/auth/session') return authSessionHandler(request, env);
    if (path === '/api/auth/logout' && request.method === 'POST') return authLogoutHandler(request, env);
    if (path === '/api/auth/nostr/challenge' && request.method === 'POST') return nostrChallengeHandler(env);
    if (path === '/api/auth/nostr/verify' && request.method === 'POST') return nostrVerifyHandler(request, env);
    if (path === '/api/auth/nostr/status') return json({ configured: authConfigured(env) });
    if (path === '/api/auth/bluesky/status') return json({ configured: blueskyConfigured(env) });
    if (path === '/api/auth/bluesky/client-metadata.json') return blueskyMetadataHandler(env);
    if (path === '/api/auth/bluesky/start') return blueskyStartHandler(url, env);
    if (path === '/api/auth/bluesky/callback') return blueskyCallbackHandler(request, url, env);
    return env.ASSETS.fetch(request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return withSecurityHeaders(await routeRequest(request, env));
  },
};
