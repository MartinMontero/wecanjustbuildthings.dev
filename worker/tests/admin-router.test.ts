import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../index.ts';
import { routeAdmin } from '../admin/router.ts';

// Phase 1 scaffold contract: /api/admin/* must be OWNED by the Worker's admin
// sub-router — dispatched there (not falling through to the static asset layer) and
// failing closed until Phase 2 wires authenticated endpoints. Uses the same
// fake-binding pattern as the other worker tests (no miniflare, no new deps).
function fakeEnv() {
  let assetCalls = 0;
  const env: any = {
    ASSETS: { async fetch() { assetCalls++; return new Response('static', { status: 200 }); } },
  };
  return { env, assetCalls: () => assetCalls };
}
const req = (p: string, init?: RequestInit) => new Request(`https://wecanjustbuildthings.dev${p}`, init);

test('/api/admin/* dispatches to the admin router (fail-closed 404), never to ASSETS', async () => {
  const { env, assetCalls } = fakeEnv();
  const res = await worker.fetch(req('/api/admin/whoami'), env);
  assert.equal(res.status, 404);                         // no admin routes exist yet → deny
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(assetCalls(), 0);                         // the Worker owned it, no static fallthrough
  assert.equal(res.headers.get('x-frame-options'), 'DENY'); // security headers still wrap it
});

test('a non-admin /api path is unaffected by the admin dispatch', async () => {
  const { env, assetCalls } = fakeEnv();
  const res = await worker.fetch(req('/api/health'), env);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(assetCalls(), 0);
});

test('routeAdmin denies every path by default (deny-by-default scaffold)', async () => {
  for (const p of ['/api/admin/whoami', '/api/admin/', '/api/admin/anything/else']) {
    const res = await routeAdmin(req(p), {} as never);
    assert.equal(res.status, 404, `expected 404 for ${p}`);
  }
});
