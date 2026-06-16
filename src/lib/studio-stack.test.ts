import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eligibleForStack, autoPickable, advisoryRank, pinnedDependencies } from './studio-stack.ts';

test('pinnedDependencies pins to each entry\'s recorded version, not "latest" (#3)', () => {
  const deps = [
    { name: 'nostr-tools', version: '2.23.5' },
    { name: '@noble/hashes', version: '1.4.0' },
    { name: 'v-prefixed', version: 'v1.0.1' }, // leading v stripped
    { name: 'no-version-pkg', version: null },
  ];
  const out = pinnedDependencies(deps);
  assert.equal(out['nostr-tools'], '^2.23.5'); // pinned, not "latest"
  assert.equal(out['@noble/hashes'], '^1.4.0');
  assert.equal(out['v-prefixed'], '^1.0.1'); // not ^v1.0.1
  // only entries with no recorded version fall back
  assert.equal(out['no-version-pkg'], 'latest');
  // when every entry has a version, no "latest" is emitted at all
  const all = pinnedDependencies([{ name: 'a', version: '1.0.0' }]);
  assert.ok(!Object.values(all).includes('latest'));
});

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
