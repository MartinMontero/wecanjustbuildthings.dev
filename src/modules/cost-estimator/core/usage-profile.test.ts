import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSession } from '../../../lib/build-session.ts';
import type { BuildSession } from '../../../lib/build-session.ts';
import { deriveUsageFromSession, missingUsageFields, applyOverride } from './usage-profile.ts';
import type { UsageProfile } from './types.ts';

/** A session carrying just the converged constraints/signals the deriver reads. */
function sessionWith(constraints: string[], signals: string[]): BuildSession {
  const s = defaultSession();
  s.converged = { statement: 'x', constraints, signals };
  return s;
}

test('deriveUsageFromSession derives compute posture from signals/constraints', () => {
  assert.equal(deriveUsageFromSession(sessionWith([], ['realtime'])).compute, 'always-on'); // persistent
  assert.equal(deriveUsageFromSession(sessionWith(['local-first'], [])).compute, 'edge');    // client-side
  assert.equal(deriveUsageFromSession(sessionWith(['durable-data'], [])).compute, 'serverless');
  assert.equal(deriveUsageFromSession(sessionWith([], [])).compute, 'edge');                 // default
});

test('deriveUsageFromSession flags a database only when data must be durable', () => {
  assert.equal(deriveUsageFromSession(sessionWith(['durable-data'], [])).database?.needed, true);
  // storage signal but local-first → explicitly not needed
  assert.equal(deriveUsageFromSession(sessionWith(['local-first'], ['storage'])).database?.needed, false);
});

test('deriveUsageFromSession leaves the numeric fields null for the UI to prompt', () => {
  const u = deriveUsageFromSession(sessionWith([], []));
  assert.equal(u.monthlyActiveUsers, null);
  assert.equal(u.bandwidthGB, null);
  assert.equal(u.storageGB, null);
  // compute resolved (edge), database resolved (not needed) ⇒ only the three numerics are missing
  assert.deepEqual(missingUsageFields(u).sort(), ['bandwidthGB', 'monthlyActiveUsers', 'storageGB']);
});

test('a manual override survives re-derivation; non-manual fields stay derived', () => {
  const s = sessionWith([], []);
  let u = deriveUsageFromSession(s);
  u = applyOverride(u, 'monthlyActiveUsers', 5000);
  assert.equal(u.monthlyActiveUsers, 5000);
  assert.equal(u.source.monthlyActiveUsers, 'manual');
  s.usage = u; // persist the override back into the session
  const merged = deriveUsageFromSession(s);
  assert.equal(merged.monthlyActiveUsers, 5000); // manual value preserved
  assert.equal(merged.bandwidthGB, null);        // untouched field re-derived to null
});

test('applyOverride sets the field and marks its source manual', () => {
  const base = deriveUsageFromSession(sessionWith([], []));
  const withDb = applyOverride(base, 'database', { needed: true, sizeGB: 8 });
  assert.deepEqual(withDb.database, { needed: true, sizeGB: 8 });
  assert.equal(withDb.source.database, 'manual');
  const withCompute = applyOverride(base, 'compute', 'always-on');
  assert.equal(withCompute.compute, 'always-on');
  assert.equal(withCompute.source.compute, 'manual');
});

test('deriveUsageFromSession sanitizes a tampered session.usage (defense in depth)', () => {
  const s = sessionWith([], []);
  // Simulate corrupt / hostile localStorage: negatives + wrong types, all marked manual.
  s.usage = {
    monthlyActiveUsers: -9, bandwidthGB: 'x', storageGB: 3, compute: 'serverless',
    database: null,
    source: { monthlyActiveUsers: 'manual', bandwidthGB: 'manual', storageGB: 'manual', compute: 'manual' },
  } as unknown as UsageProfile;
  const u = deriveUsageFromSession(s);
  assert.equal(u.monthlyActiveUsers, null); // -9 sanitized away despite the 'manual' marker
  assert.equal(u.bandwidthGB, null);        // 'x' sanitized
  assert.equal(u.storageGB, 3);             // a valid manual value still survives
});
