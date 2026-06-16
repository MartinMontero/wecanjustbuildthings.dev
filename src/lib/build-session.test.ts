import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSession, migrate, updateSession, loadSession } from './build-session.ts';

test('defaultSession has the expected shape', () => {
  const s = defaultSession();
  assert.equal(s.v, 1);
  assert.equal(s.movement, 1);
  assert.deepEqual(s.intent.protocols, []);
  assert.deepEqual(s.intent.answers, {});
  assert.equal(s.converged, null);
  assert.deepEqual(s.adjustments, { swaps: {}, removed: [], extra: [] });
  assert.deepEqual(s.stack, []);
  assert.deepEqual(s.skills, []);
  assert.equal(s.seededTool, null);
  assert.equal(s.handoff, 'zip');
});

test('migrate fills missing keys and preserves provided ones', () => {
  const m = migrate({ v: 1, intent: { problem: 'help tenants report safely', protocols: ['nostr'] } });
  assert.equal(m.intent.problem, 'help tenants report safely');
  assert.deepEqual(m.intent.protocols, ['nostr']);
  assert.equal(m.intent.projectName, '');
  assert.deepEqual(m.intent.answers, {});
  assert.deepEqual(m.adjustments, { swaps: {}, removed: [], extra: [] });
});

test('migrate rejects non-v1 / garbage with a fresh default', () => {
  assert.equal(migrate(null).intent.problem, '');
  assert.equal(migrate({ v: 99 }).intent.problem, '');
  assert.equal(migrate('nope').intent.problem, '');
  assert.equal(migrate(undefined).movement, 1);
});

test('migrate deep-copies nested collections (no shared refs with source)', () => {
  const src = { v: 1 as const, adjustments: { swaps: { a: 'x' }, removed: ['r'], extra: [] } };
  const m = migrate(src);
  m.adjustments.removed.push('mutated');
  assert.deepEqual(src.adjustments.removed, ['r']);
});

test('updateSession merges and returns; does not persist without storage', () => {
  const next = updateSession((s) => ({ ...s, intent: { ...s.intent, problem: 'x' } }));
  assert.equal(next.intent.problem, 'x');
  assert.equal(next.v, 1);
  // No localStorage in node, so nothing is persisted — load still returns the default.
  assert.equal(loadSession().intent.problem, '');
});
