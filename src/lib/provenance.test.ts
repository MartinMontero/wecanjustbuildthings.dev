import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allUnconfirmed, needsProvenanceChip } from './provenance.ts';

// D8 — the provenance-chip derivation the estimator + compass islands share.
// A null/undefined figure is unconfirmed registry data and must surface as the
// "unverified — awaiting human check" chip; a real number never does.

test('needsProvenanceChip: null/undefined need the chip, numbers and strings do not', () => {
  assert.equal(needsProvenanceChip(null), true);
  assert.equal(needsProvenanceChip(undefined), true);
  assert.equal(needsProvenanceChip(0), false); // a confirmed FREE tier is data, not a gap
  assert.equal(needsProvenanceChip(4.99), false);
  assert.equal(needsProvenanceChip('2026-08-01'), false); // an ISO lastVerified date
  assert.equal(needsProvenanceChip(''), false); // present-but-empty is not "unconfirmed"
});

test('allUnconfirmed: only an every-null set carries the chip', () => {
  assert.equal(allUnconfirmed([null, null]), true);
  assert.equal(allUnconfirmed([]), true); // vacuous — pre-D8 .every() semantics preserved
  assert.equal(allUnconfirmed([null, 3.5]), false); // one confirmed line ⇒ partial total shows
  assert.equal(allUnconfirmed([0, null]), false); // 0 is confirmed, not a gap
  assert.equal(allUnconfirmed([1.2, 3.4]), false);
});
