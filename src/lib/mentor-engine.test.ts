import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectSignals, pickQuestions, reflect } from './mentor-engine.ts';

test('detectSignals reads the curated lexicon', () => {
  const s = detectSignals('A private way for tenants to report evictions without exposing who they are.');
  assert.ok(s.includes('privacy'));
  assert.ok(s.includes('community')); // "tenants"
  assert.ok(s.includes('storage')); // "report"
});

test('detectSignals folds protocol selections into signals', () => {
  const s = detectSignals('a simple feed', ['lightning']);
  assert.ok(s.includes('payments'));
  assert.ok(s.includes('realtime')); // "feed"
});

test('detectSignals output is priority-ordered and de-duplicated', () => {
  const s = detectSignals('payments privacy payments', []);
  assert.deepEqual(s, [...new Set(s)]);
  assert.ok(s.indexOf('privacy') < s.indexOf('payments'));
});

test('pickQuestions returns only present, unanswered signals, capped', () => {
  const qs = pickQuestions(['privacy', 'payments', 'storage', 'identity'], { 'q-privacy-who': 'public' }, 2);
  assert.equal(qs.length, 2);
  assert.ok(!qs.some((q) => q.id === 'q-privacy-who')); // already answered
  assert.ok(qs.every((q) => ['payments', 'storage', 'identity'].includes(q.signal)));
});

test('reflect derives signal-level constraints even with no answers', () => {
  const r = reflect(['privacy', 'payments', 'community'], {});
  assert.ok(r.constraints.includes('anonymity-first'));
  assert.ok(r.constraints.includes('direct-payment'));
  assert.ok(r.constraints.includes('community-owned'));
});

test('reflect: a pseudonymous answer relaxes the hard anonymity default', () => {
  const r = reflect(['privacy', 'identity'], { 'q-privacy-who': 'pseudonymous' });
  assert.ok(!r.constraints.includes('anonymity-first'));
  assert.ok(r.constraints.includes('pseudonymous'));
});

test('reflect: org custody relaxes the direct-payment default', () => {
  const r = reflect(['payments'], { 'q-payments-flow': 'org' });
  assert.ok(!r.constraints.includes('direct-payment'));
  assert.ok(r.constraints.includes('org-custody'));
});
