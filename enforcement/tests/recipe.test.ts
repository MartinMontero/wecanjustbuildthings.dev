import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadExcludedOrgs, loadProviderSignals } from '../config.ts';
import { validateRecipe, type RecipeValidationContext } from '../layer3-provider-strings/recipe-validator.ts';
import type { DocEntry } from '../frontmatter.ts';

const ctx: RecipeValidationContext = {
  orgs: loadExcludedOrgs(),
  signals: loadProviderSignals(),
  catalog: [
    {
      slug: 'shakespeare',
      file: 'catalog/shakespeare.mdx',
      frontmatter: { entry_type: 'service', provider_agnostic: true, dependency_name: 'shakespeare' },
    },
    {
      slug: 'nostr-tools',
      file: 'catalog/nostr-tools.mdx',
      frontmatter: { entry_type: 'library', provider_agnostic: false },
    },
  ],
};

function recipe(frontmatter: Record<string, unknown>): DocEntry {
  return { slug: 'r', file: 'recipes/r.mdx', frontmatter };
}

const validFrontmatter = {
  entry_type: 'recipe',
  recipe_type: 'configuration',
  target_entry_slug: 'shakespeare',
  excluded_providers_unreachable_when: [
    {
      description: 'Provider picker set to a permitted provider',
      config_surface: 'ui_setting',
      setting_path: 'Settings → AI Provider',
      must_be_one_of: ['anthropic', 'deepseek', 'ollama-local'],
      must_not_be_one_of: ['openai', 'xai', 'google'],
    },
  ],
  verification_steps: [
    {
      description: 'Observe no traffic to excluded hosts',
      method: 'network_observation',
      duration_minutes: 5,
      blocked_hosts: ['api.openai.com', 'api.x.ai'],
    },
  ],
};

test('accepts a valid Shakespeare-style recipe', () => {
  const result = validateRecipe(recipe(validFrontmatter), ctx);
  assert.equal(result.status, 'pass', result.errors.join('; '));
});

test('rejects a recipe that forgets to exclude an LLM provider', () => {
  const fm = structuredClone(validFrontmatter);
  fm.excluded_providers_unreachable_when[0]!.must_not_be_one_of = ['xai']; // missing openai
  const result = validateRecipe(recipe(fm), ctx);
  assert.equal(result.status, 'block');
  assert.ok(result.errors.some((e) => e.includes('openai')));
});

test('rejects a recipe targeting a non-provider-agnostic entry', () => {
  const fm = structuredClone(validFrontmatter);
  fm.target_entry_slug = 'nostr-tools';
  const result = validateRecipe(recipe(fm), ctx);
  assert.equal(result.status, 'block');
  assert.ok(result.errors.some((e) => e.includes('provider_agnostic')));
});

test('rejects a recipe whose target does not exist', () => {
  const fm = structuredClone(validFrontmatter);
  fm.target_entry_slug = 'does-not-exist';
  const result = validateRecipe(recipe(fm), ctx);
  assert.equal(result.status, 'block');
});

test('rejects a permitted provider that is itself excluded', () => {
  const fm = structuredClone(validFrontmatter);
  fm.excluded_providers_unreachable_when[0]!.must_be_one_of = ['anthropic', 'openai'];
  const result = validateRecipe(recipe(fm), ctx);
  assert.equal(result.status, 'block');
});

test('rejects a recipe whose verification steps block no excluded endpoint', () => {
  const fm = structuredClone(validFrontmatter);
  fm.verification_steps[0]!.blocked_hosts = [];
  const result = validateRecipe(recipe(fm), ctx);
  assert.equal(result.status, 'block');
  assert.ok(result.errors.some((e) => e.includes('endpoint')));
});
