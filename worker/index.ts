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
 *
 * Static assets are served by the asset layer first; this Worker only runs for
 * /api/* routes, with env.ASSETS as the fallback for anything else.
 */
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
}

const UA = 'wecanjustbuildthings/1.0 (+https://wecanjustbuildthings.dev)';

// Permitted model providers only — OpenAI/xAI are excluded by policy and are not
// reachable through this endpoint, even with a key.
export const PROVIDERS: Record<string, { url: string; build: (model: string, prompt: string, key: string) => RequestInit; pick: (j: any) => string; defaultModel: string }> = {
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-3-5-sonnet-latest',
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

function backTo(origin: string, back: string, params: string): Response {
  const path = safeLocalPath(back);
  const sep = path.includes('?') ? '&' : '?';
  return new Response(null, { status: 302, headers: [['location', `${origin}${path}${sep}${params}`]] as any });
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === '/api/health') return json({ ok: true });
    if (path === '/api/license') return licenseHandler(url);
    if (path === '/api/agent/kickoff' && request.method === 'POST') return kickoffHandler(request);
    if (path === '/api/github/status') return json({ configured: Boolean(env.GITHUB_OAUTH_CLIENT_ID) });
    if (path === '/api/github/start') return githubStart(url, env);
    if (path === '/api/github/callback') return githubCallback(request, url, env);
    if (path === '/api/github/create' && request.method === 'POST') return githubCreate(request);
    return env.ASSETS.fetch(request);
  },
};
