/**
 * catalog-cta tests — the locale-aware CTA (M3). The P1-8 regression this pins:
 * the explorer CTA hardlinked `/build/` from es/ar pages; these tests fire if
 * the base ever stops following the lang, if the seed escapes encoding, or if
 * the tray stops pointing at a staged tool.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogBuildBase, catalogBuildHref } from './catalog-cta.ts';

test('CTA base follows the island lang (es/ar readers land on their own Studio)', () => {
  assert.equal(catalogBuildBase('en'), '/build/');
  assert.equal(catalogBuildBase('es'), '/es/build/');
  assert.equal(catalogBuildBase('ar'), '/ar/build/');
  assert.equal(catalogBuildBase('ES'), '/es/build/'); // case-insensitive
});

test('unknown / missing langs fall back to the English Studio', () => {
  assert.equal(catalogBuildBase('fr'), '/build/');
  assert.equal(catalogBuildBase(''), '/build/');
  assert.equal(catalogBuildBase(undefined as unknown as string), '/build/');
});

test('href prefers the live seed, then the first staged tool, then the bare Studio', () => {
  assert.equal(catalogBuildHref('es', 'marmot', new Set(['ndk'])), '/es/build/?seed=marmot');
  assert.equal(catalogBuildHref('ar', null, new Set(['ndk'])), '/ar/build/?seed=ndk');
  assert.equal(catalogBuildHref('en', null, new Set()), '/build/');
});

test('seed values are URL-encoded (a hostile slug cannot break out of the param)', () => {
  assert.equal(
    catalogBuildHref('en', 'x y?z=1&w=2', new Set()),
    '/build/?seed=x%20y%3Fz%3D1%26w%3D2',
  );
});
