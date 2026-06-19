import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeRecipeConfig,
  decodeRecipeConfig,
  recipeDeeplink,
  explainRecipe,
  DEEPLINK_MAX_BYTES,
} from './goose-deeplink.ts';
import { buildGooseRecipe, type ExtensionAllowlist, type RecipeInput } from './goose-recipe.ts';
import type { SessionExtension } from './build-session.ts';

const allow: ExtensionAllowlist = {
  byId: {
    'mcp-fs': { type: 'stdio', name: 'filesystem', cmd: 'npx', args: ['-y', 'srv'] },
    dev: { type: 'builtin', name: 'developer' },
  },
};
const ext = (catalogId: string): SessionExtension => ({ catalogId, name: 'x', kind: 'mcp_stdio' });
const mk = (over: Partial<RecipeInput> = {}) =>
  buildGooseRecipe({ title: 'T', slug: 't', prompt: 'P', extensions: [], ...over }, allow);

test('encode/decode round-trips a recipe, including non-ASCII (UTF-8-safe base64)', () => {
  const r = mk({
    title: 'Inquilinos مجهول 😀',
    prompt: 'Construye algo — سرّي\n— émoji 🚀',
    extensions: [ext('mcp-fs'), ext('dev')],
  });
  assert.deepEqual(decodeRecipeConfig(encodeRecipeConfig(r)), r);
});

test('recipeDeeplink builds a goose://recipe?config= URL within budget', () => {
  const dl = recipeDeeplink(mk());
  assert.ok(dl.url.startsWith('goose://recipe?config='));
  assert.ok(dl.withinBudget);
  assert.equal(dl.bytes, new TextEncoder().encode(dl.url).length);
});

test('recipeDeeplink flags an over-budget recipe so the UI falls back', () => {
  const dl = recipeDeeplink(mk({ prompt: 'x'.repeat(DEEPLINK_MAX_BYTES + 1000) }));
  assert.equal(dl.withinBudget, false);
  assert.ok(dl.bytes > DEEPLINK_MAX_BYTES);
});

test('explainRecipe lists every extension in plain language, never raw config', () => {
  const r = mk({ extensions: [ext('mcp-fs'), ext('dev')] });
  const x = explainRecipe(r);
  assert.equal(x.title, 'T');
  assert.equal(x.willDoNothingUntilUserConsents, true);
  assert.equal(x.extensions.length, r.extensions.length);
  for (const e of x.extensions) {
    assert.ok(e.why.length > 0, 'every extension has a plain-language reason');
    assert.ok(!e.why.includes('npx'), 'the vetted command is never surfaced to the builder');
  }
  assert.deepEqual(x.extensions.map((e) => e.name).sort(), ['developer', 'filesystem']);
});
