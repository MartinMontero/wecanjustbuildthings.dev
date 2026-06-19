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

test('skills folded inline can push the deeplink over budget (Option 2 → copy/download fallback)', () => {
  const longStep = 'Document every step the organizer takes, in plain language, verbatim. '.repeat(6);
  const skills = Array.from({ length: 12 }, (_, i) => ({
    name: `Captured Method ${i}`,
    description: 'A field method the agent must follow verbatim',
    method: [longStep, longStep, longStep],
  }));
  const input: RecipeInput = { title: 'T', slug: 't', prompt: 'P', extensions: [], skills };

  // Inline (the deeplink transport): the methods travel in the URL and blow the budget.
  const inline = recipeDeeplink(buildGooseRecipe(input, allow, { skills: 'inline' }));
  assert.equal(inline.withinBudget, false, `expected over budget, got ${inline.bytes} bytes`);
  assert.ok(inline.bytes > DEEPLINK_MAX_BYTES);

  // Subrecipes (the zip transport): only short path references travel, so it stays far
  // smaller — which is exactly why the deeplink can't carry skills as files.
  const lean = recipeDeeplink(buildGooseRecipe(input, allow, { skills: 'subrecipes' }));
  assert.ok(lean.bytes < inline.bytes, 'path-based sub_recipes are smaller than inlined methods');
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
