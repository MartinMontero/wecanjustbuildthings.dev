/**
 * Cloudflare Worker entry. Serves the static site (via the ASSETS binding) and
 * exposes a small live API the in-browser tools call:
 *   GET /api/license?eco=<ecosystem>&name=<package>  → { name, eco, license, version, repo }
 *   GET /api/health                                   → { ok: true }
 *
 * Static assets are served by the asset layer first; this Worker only runs for
 * routes that aren't a built file (i.e. /api/*), with env.ASSETS as the fallback.
 */
export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  GITHUB_TOKEN?: string;
}

const UA = 'wecanjustbuildthings/1.0 (+https://wecanjustbuildthings.dev)';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': 'public, max-age=3600',
    },
  });
}

async function getJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function normalizeRepo(url?: string): string | undefined {
  if (!url) return undefined;
  let u = String(url).replace(/^git\+/, '').replace(/^git:\/\//, 'https://').replace(/\.git($|[#?])/, '$1');
  if (/^[\w.-]+\/[\w.-]+$/.test(u)) u = `https://github.com/${u}`;
  return /^https?:\/\//.test(u) ? u : undefined;
}

async function licenseHandler(url: URL): Promise<Response> {
  const name = url.searchParams.get('name')?.trim();
  const eco = (url.searchParams.get('eco') || 'js').trim();
  if (!name) return json({ error: 'missing name' }, 400);

  let license: string | undefined;
  let version: string | undefined;
  let repo: string | undefined;

  if (eco === 'js') {
    const d = await getJson(`https://registry.npmjs.org/${name.replace('/', '%2F')}`);
    if (d) {
      version = d['dist-tags']?.latest;
      license = typeof d.license === 'string' ? d.license : d.versions?.[version ?? '']?.license;
      repo = normalizeRepo(d.repository?.url ?? d.repository);
    }
  } else if (eco === 'py') {
    const d = await getJson(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`);
    const info = d?.info;
    if (info) {
      version = info.version;
      license = info.license_expression || (typeof info.license === 'string' && info.license.length < 40 ? info.license : undefined);
      const urls = info.project_urls ?? {};
      repo = normalizeRepo(urls.Source ?? urls.Repository ?? urls.Homepage ?? info.home_page);
    }
  } else if (eco === 'rust') {
    const d = await getJson(`https://crates.io/api/v1/crates/${encodeURIComponent(name)}`);
    if (d?.versions?.[0]) {
      version = d.versions[0].num;
      license = d.versions[0].license;
      repo = normalizeRepo(d.crate?.repository);
    }
  } else if (eco === 'go') {
    if (name.startsWith('github.com/')) repo = `https://${name}`;
    const escaped = name.replace(/[A-Z]/g, (c) => `!${c.toLowerCase()}`);
    const d = await getJson(`https://proxy.golang.org/${escaped}/@latest`);
    version = d?.Version;
  } else if (eco === 'ruby') {
    const d = await getJson(`https://rubygems.org/api/v1/gems/${encodeURIComponent(name)}.json`);
    if (d) { version = d.version; license = d.licenses?.[0]; repo = normalizeRepo(d.source_code_uri ?? d.homepage_uri); }
  } else if (eco === 'elixir') {
    const d = await getJson(`https://hex.pm/api/packages/${encodeURIComponent(name)}`);
    if (d) { version = d.releases?.[0]?.version; license = d.meta?.licenses?.[0]; }
  }

  return json({ name, eco, license: license ?? null, version: version ?? null, repo: repo ?? null });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return json({ ok: true });
    if (url.pathname === '/api/license') return licenseHandler(url);
    return env.ASSETS.fetch(request);
  },
};
