import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS, normalizeLang, type Lang } from './i18n.ts';

const LANGS: Lang[] = ['en', 'es', 'ar'];
// Arabic-script codepoints — a real translation must actually be Arabic.
const ARABIC = /[\u0600-\u06FF]/;

test('en/es/ar string tables are key-aligned (same key set in every locale)', () => {
  const enKeys = Object.keys(STRINGS.en).sort();
  for (const lang of LANGS) {
    assert.deepEqual(Object.keys(STRINGS[lang]).sort(), enKeys, `${lang} keys diverge from en`);
  }
});

test('every locale carries a non-empty value for every key', () => {
  for (const lang of LANGS) {
    for (const [k, v] of Object.entries(STRINGS[lang])) {
      assert.ok(v.trim().length > 0, `${lang}.${k} is empty`);
    }
  }
});

test('no user-visible string contains a "TODO" work note (D8)', () => {
  for (const lang of LANGS) {
    for (const [k, v] of Object.entries(STRINGS[lang])) {
      assert.ok(!/\btodo\b/i.test(v), `${lang}.${k} still carries a TODO: "${v}"`);
    }
  }
});

test('the provenance chip is localized, not copied across locales (D8)', () => {
  const { en, es, ar } = STRINGS;
  assert.notEqual(en.unverifiedChip, es.unverifiedChip);
  assert.notEqual(en.unverifiedChip, ar.unverifiedChip);
  assert.notEqual(es.unverifiedChip, ar.unverifiedChip);
  assert.ok(en.unverifiedChip.includes('awaiting human check'), 'en chip lost the honesty wording');
  assert.ok(ARABIC.test(ar.unverifiedChip), 'ar chip must be a real Arabic translation');
});

test('Arabic table is genuinely translated, not placeholder English', () => {
  for (const [k, v] of Object.entries(STRINGS.ar)) {
    assert.ok(ARABIC.test(v), `ar.${k} contains no Arabic script: "${v}"`);
  }
});

test('normalizeLang maps raw locale hints to en/es/ar, defaulting to en', () => {
  assert.equal(normalizeLang('es'), 'es');
  assert.equal(normalizeLang('AR'), 'ar');
  assert.equal(normalizeLang('es-MX'), 'es');
  assert.equal(normalizeLang(undefined), 'en');
  assert.equal(normalizeLang('fr'), 'en');
});
