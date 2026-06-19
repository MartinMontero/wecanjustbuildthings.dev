import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectSignals, pickQuestions, reflect, reflectFromResponse, QUESTIONS, type SignalId, type ConstraintId } from './mentor-engine.ts';

test('detectSignals reads the curated lexicon', () => {
  const s = detectSignals('A private way for tenants to report evictions without exposing who they are.');
  assert.ok(s.includes('privacy'));
  assert.ok(s.includes('community')); // "tenants"
  assert.ok(s.includes('storage')); // "report"
});

test('detectSignals works in Spanish (multilingual lexicon)', () => {
  const s = detectSignals('Una forma privada para que los inquilinos denuncien desalojos y reciban donaciones sin exponer quiénes son.');
  assert.ok(s.includes('privacy'));   // privada / exponer
  assert.ok(s.includes('community')); // inquilinos
  assert.ok(s.includes('payments'));  // donaciones
});

test('detectSignals works in Arabic (multilingual lexicon)', () => {
  const s = detectSignals('طريقة خاصة للمستأجرين للإبلاغ عن الإخلاء وجمع التبرعات دون كشف هويتهم.');
  assert.ok(s.includes('privacy'));   // خاصة / كشف
  assert.ok(s.includes('community')); // المستأجرين
  assert.ok(s.includes('payments'));  // التبرعات
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

test('reflect: on-device storage relaxes the durable-data default', () => {
  const r = reflect(['storage'], { 'q-storage-survive': 'on-device' });
  assert.ok(!r.constraints.includes('durable-data'));
  assert.ok(r.constraints.includes('local-first'));
});

test('reflect output is priority-ordered and de-duplicated', () => {
  // moderation + privacy: privacy's constraint must precede moderation's per ORDER.
  const r = reflect(['moderation', 'privacy'], {});
  assert.deepEqual(r.constraints, [...new Set(r.constraints)]); // no dupes
  assert.ok(r.constraints.indexOf('anonymity-first') < r.constraints.indexOf('safety-tooling'));
  // A signal default + an answer implying the SAME constraint yields one entry, not two.
  const dup = reflect(['privacy'], { 'q-privacy-who': 'public' }); // both → anonymity-first
  assert.equal(dup.constraints.filter((c) => c === 'anonymity-first').length, 1);
});

// ---- structural invariants: guard against lexicon / question-bank drift ----

test('detectSignals can surface every signal (its ORDER covers the whole lexicon)', () => {
  const all = detectSignals('private login store pay server community chat moderate');
  const expected: SignalId[] = ['privacy', 'identity', 'payments', 'storage', 'community', 'realtime', 'moderation', 'hosting'];
  for (const s of expected) assert.ok(all.includes(s), `signal ${s} was not surfaced`);
  assert.equal(all.length, expected.length); // includes-all + same length ⇒ exactly the set
});

test('every constraint a question option can imply survives reflect (no ORDER drift)', () => {
  // If a constraint is added to an option but missing from reflect's ordering array,
  // the final ORDER.filter would silently drop it — this catches that.
  for (const q of QUESTIONS) {
    for (const opt of q.options) {
      if (!opt.constraint) continue;
      const r = reflect([q.signal], { [q.id]: opt.id });
      assert.ok(
        r.constraints.includes(opt.constraint),
        `reflect dropped ${opt.constraint} (from ${q.id}/${opt.id}) — missing from the ordering?`,
      );
    }
  }
});

test('every signal-level default constraint survives reflect', () => {
  const defaults: [SignalId, ConstraintId][] = [
    ['privacy', 'anonymity-first'], ['payments', 'direct-payment'], ['storage', 'durable-data'],
    ['identity', 'self-sovereign-identity'], ['community', 'community-owned'], ['moderation', 'safety-tooling'],
  ];
  for (const [signal, constraint] of defaults) {
    assert.ok(reflect([signal], {}).constraints.includes(constraint), `${signal} should imply ${constraint}`);
  }
});

test('detectSignals ignores unknown protocols and surfaces known ones', () => {
  assert.deepEqual(detectSignals('a plain note', ['totally-made-up']), []);
  assert.deepEqual(detectSignals('a plain note', ['nostr']), ['identity']);
});

test('pickQuestions never exceeds the default cap of three', () => {
  const qs = pickQuestions(['privacy', 'payments', 'storage', 'identity', 'community'], {});
  assert.ok(qs.length <= 3);
});

// ---- reflectFromResponse: the deterministic structured-reflection step (no model) ----

test('reflectFromResponse normalises a well-formed Goose response', () => {
  const r = reflectFromResponse({
    constraints: ['anonymity-first', 'durable-data'],
    proposals: [
      { action: 'add', name: 'ndk', why: 'Nostr connectivity' },
      { action: 'remove', name: 'pouchdb', why: 'replace with local-first storage' },
    ],
  });
  assert.deepEqual(r, {
    schemaVersion: 1,
    constraints: ['anonymity-first', 'durable-data'],
    proposals: [
      { action: 'add', name: 'ndk', why: 'Nostr connectivity' },
      { action: 'remove', name: 'pouchdb', why: 'replace with local-first storage' },
    ],
  });
});

test('reflectFromResponse drops malformed entries and never throws (untrusted paste)', () => {
  const r = reflectFromResponse({
    constraints: ['ok', 5, null, 'fine'], // non-strings dropped
    proposals: [
      { action: 'add', name: 'good', why: 'yes' },
      { action: 'swap', name: 'bad-action', why: 'no' },     // 'swap' no longer accepted → dropped
      { action: 'remove', name: 'no-why' },                  // missing why → dropped
      'not-an-object',                                        // dropped
    ],
  });
  assert.deepEqual(r.constraints, ['ok', 'fine']);
  assert.deepEqual(r.proposals, [{ action: 'add', name: 'good', why: 'yes' }]);
  assert.equal(r.schemaVersion, 1);
});

test('reflectFromResponse returns an empty reflection for garbage input', () => {
  for (const bad of [null, undefined, 'string', 42, [], {}]) {
    const r = reflectFromResponse(bad);
    assert.deepEqual(r, { schemaVersion: 1, constraints: [], proposals: [] });
  }
});
