import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNT_STRINGS } from './account-widget-strings.ts';

const LANGS = ['en', 'es', 'ar'] as const;
// Arabic-script codepoints — a real translation must actually be Arabic.
const ARABIC = /[\u0600-\u06FF]/;

test('en/es/ar tables are key-aligned (same key set in every locale)', () => {
  const enKeys = Object.keys(ACCOUNT_STRINGS.en).sort();
  for (const lang of LANGS) {
    assert.deepEqual(Object.keys(ACCOUNT_STRINGS[lang]).sort(), enKeys, `${lang} keys diverge from en`);
  }
});

test('every locale carries a non-empty value for every key', () => {
  for (const lang of LANGS) {
    for (const [k, v] of Object.entries(ACCOUNT_STRINGS[lang])) {
      assert.ok(v.trim().length > 0, `${lang}.${k} is empty`);
    }
  }
});

test('no user-visible string contains a "TODO" work note', () => {
  for (const lang of LANGS) {
    for (const [k, v] of Object.entries(ACCOUNT_STRINGS[lang])) {
      assert.ok(!/\btodo\b/i.test(v), `${lang}.${k} still carries a TODO: "${v}"`);
    }
  }
});

test('Arabic strings are real translations, not placeholders copied from en', () => {
  for (const [k, v] of Object.entries(ACCOUNT_STRINGS.ar)) {
    // `placeholder` is exempt: a Bluesky handle is ASCII-only by protocol, so
    // the example handle is transliterated ("anta") rather than written in
    // Arabic script — but it must still differ from the en example.
    if (k === 'placeholder') continue;
    assert.notEqual(v, ACCOUNT_STRINGS.en[k], `ar.${k} copies the English value`);
    assert.ok(ARABIC.test(v), `ar.${k} contains no Arabic script: "${v}"`);
  }
});

test('the ar input placeholder is localized (not the English "you.bsky.social")', () => {
  assert.notEqual(ACCOUNT_STRINGS.ar.placeholder, ACCOUNT_STRINGS.en.placeholder);
  // Still a plausible, ASCII, handle-shaped example.
  assert.match(ACCOUNT_STRINGS.ar.placeholder, /^[a-z0-9.-]+\.bsky\.social$/);
});
