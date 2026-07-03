import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import worker from '../index.ts';
import { CSP_REPORT_PATH } from '../../src/lib/security-headers.ts';

// A fake env with an ASSETS binding that records whether the asset layer was hit,
// and (deliberately) NO AUTH_RATE_LIMITER / auth bindings — so this also exercises
// the graceful-degradation path where rate limiting no-ops and auth is unconfigured.
function fakeEnv(opts: { assetThrows?: boolean } = {}) {
  let assetCalls = 0;
  const env: any = {
    ASSETS: {
      async fetch() {
        assetCalls++;
        if (opts.assetThrows) throw new Error('boom');
        return new Response('static', { status: 200 });
      },
    },
    SITE_URL: 'https://wecanjustbuildthings.dev',
  };
  return { env, assetCalls: () => assetCalls };
}
const req = (path: string, init?: RequestInit) => new Request(`https://wecanjustbuildthings.dev${path}`, init);

test('/api/health is answered by the Worker (not assets) and carries security headers', async () => {
  const { env, assetCalls } = fakeEnv();
  const res = await worker.fetch(req('/api/health'), env);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(assetCalls(), 0);                                  // worker handled it
  assert.equal(res.headers.get('x-frame-options'), 'DENY');       // withSecurityHeaders ran
});

test('a non-API path and an unknown /api route both fall through to ASSETS', async () => {
  const page = fakeEnv();
  await worker.fetch(req('/some/page/'), page.env);
  assert.equal(page.assetCalls(), 1);                             // static page → assets
  const api = fakeEnv();
  const res = await worker.fetch(req('/api/does-not-exist'), api.env);
  assert.equal(api.assetCalls(), 1);                              // unknown /api → assets 404
  assert.equal(res.status, 200);
});

test('an unexpected throw becomes a controlled, security-headered 500 (no run_worker_first fallback)', async () => {
  const { env } = fakeEnv({ assetThrows: true });
  const res = await worker.fetch(req('/some/page/'), env);
  assert.equal(res.status, 500);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.deepEqual(await res.json(), { error: 'internal error' });
});

test('logout rejects a cross-site POST (cookie-clearing CSRF) but honors same-origin', async () => {
  const cross = fakeEnv();
  const bad = await worker.fetch(req('/api/auth/logout', { method: 'POST', headers: { 'sec-fetch-site': 'cross-site' } }), cross.env);
  assert.equal(bad.status, 403);
  const ok = fakeEnv();
  const good = await worker.fetch(req('/api/auth/logout', { method: 'POST', headers: { 'sec-fetch-site': 'same-origin' } }), ok.env);
  assert.equal(good.status, 200);
  assert.match(good.headers.get('set-cookie') ?? '', /__Host-wcjbt_session=;/); // cleared
});

test('github/create: 401 without token, and its response carries NO wildcard CORS (authJson)', async () => {
  const { env } = fakeEnv();
  const res = await worker.fetch(req('/api/github/create', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }), env);
  assert.equal(res.status, 401);
  assert.equal(res.headers.get('access-control-allow-origin'), null); // was '*' before the fix
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('github/create caps the file fan-out (too many files → 413)', async () => {
  const { env } = fakeEnv();
  const files: Record<string, string> = {};
  for (let i = 0; i < 101; i++) files[`f${i}.txt`] = 'x';
  const res = await worker.fetch(req('/api/github/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: 'gh_token=fake' },
    body: JSON.stringify({ repo: 'demo', files }),
  }), env);
  assert.equal(res.status, 413); // rejected before any GitHub subrequest
});

// ---- Config invariant: every Worker route must be under /api/* or run_worker_first
// won't send it to the Worker in production (the exact class of bug PR #32 fixed). ----
test('wrangler.jsonc routes /api/* to the Worker first, and every router path is under /api/*', () => {
  const cfg = readFileSync(fileURLToPath(new URL('../../wrangler.jsonc', import.meta.url)), 'utf8');
  assert.match(cfg, /"run_worker_first":\s*\[\s*"\/api\/\*"\s*\]/);
  assert.match(cfg, /"not_found_handling":\s*"404-page"/);

  const src = readFileSync(fileURLToPath(new URL('../index.ts', import.meta.url)), 'utf8');
  const literals = [...src.matchAll(/path === '([^']+)'/g)].map((m) => m[1]!);
  assert.ok(literals.length >= 10, 'expected the router to have several path literals');
  for (const p of literals) {
    assert.ok(p.startsWith('/api/'), `route "${p}" is not under /api/* — it would be unreachable in production`);
  }
  assert.ok(CSP_REPORT_PATH.startsWith('/api/'), 'CSP report path must be worker-routed');
});
