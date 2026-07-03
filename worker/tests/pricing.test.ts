import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../index.ts';

// The /api/pricing handler validates untrusted, unauthenticated input, then runs the
// deterministic estimator core (Path A). Exercised through the real router so the
// route wiring + input validation are covered, not just the estimator in isolation.
const post = (body: BodyInit | null) =>
  worker.fetch(
    new Request('https://wecanjustbuildthings.dev/api/pricing', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    }),
    {} as any,
  );

test('/api/pricing rejects non-JSON and a missing/invalid usage profile with 400', async () => {
  assert.equal((await post('not json')).status, 400);
  assert.equal((await post(JSON.stringify({}))).status, 400);
  assert.equal((await post(JSON.stringify({ usage: 'nope' }))).status, 400);
});

test('/api/pricing returns three tiers with finite totals for a valid usage profile', async () => {
  const res = await post(JSON.stringify({ usage: { monthlyActiveUsers: 1000, bandwidthGB: 50, storageGB: 5 } }));
  assert.equal(res.status, 200);
  const est = await res.json();
  assert.equal(est.tiers.length, 3);
  for (const tier of est.tiers) {
    for (const q of tier.quotes) assert.ok(Number.isFinite(q.confirmedTotal), 'confirmedTotal must be finite');
  }
});

test('/api/pricing coerces a hostile huge/negative input to a finite estimate (no Infinity)', async () => {
  const res = await post(JSON.stringify({ usage: { monthlyActiveUsers: 1e309, bandwidthGB: 1e300, storageGB: -5 } }));
  assert.equal(res.status, 200);
  const est = await res.json();
  for (const tier of est.tiers) {
    assert.ok(Number.isFinite(tier.resolvedUsage.monthlyActiveUsers));
    assert.ok(Number.isFinite(tier.resolvedUsage.bandwidthGB));
    for (const q of tier.quotes) assert.ok(Number.isFinite(q.confirmedTotal));
  }
});
