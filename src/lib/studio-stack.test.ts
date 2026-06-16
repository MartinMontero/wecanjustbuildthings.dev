import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eligibleForStack, autoPickable, advisoryRank } from './studio-stack.ts';

test('eligibleForStack admits verified AND under_review, excludes blocked + datasets (#4)', () => {
  assert.ok(eligibleForStack({ kind: 'tool', verification: 'verified' }));
  // under_review passed automated policy screening — eligible, labelled, not excluded
  assert.ok(eligibleForStack({ kind: 'tool', verification: 'under_review' }));
  // blocked failed — never recommended
  assert.ok(!eligibleForStack({ kind: 'tool', verification: 'blocked' }));
  // datasets are never part of a stack
  assert.ok(!eligibleForStack({ kind: 'dataset', verification: 'verified' }));
});

test('autoPickable forbids advisory tools as the default pick (react is never the default)', () => {
  assert.ok(autoPickable({ kind: 'tool', verification: 'verified', advisory: null }));
  assert.ok(autoPickable({ kind: 'tool', verification: 'under_review', advisory: null }));
  // Meta-origin (verified, advisory) — eligible but not auto-picked
  assert.ok(!autoPickable({ kind: 'tool', verification: 'verified', advisory: 'meta' }));
});

test('advisoryRank orders advisory tools last', () => {
  assert.equal(advisoryRank({ advisory: null }), 0);
  assert.equal(advisoryRank({ advisory: 'meta' }), 1);
});
