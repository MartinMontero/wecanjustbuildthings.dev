import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadExcludedOrgs } from '../config.ts';
import { matchDependency, isExcluded, matchGitHubOwner } from '../matcher.ts';
import type { Ecosystem } from '../types.ts';

const orgs = loadExcludedOrgs();
const ref = (name: string, ecosystem: Ecosystem) => ({ name, ecosystem, source_file: 'test' });

test('matcher flags excluded packages per ecosystem', () => {
  const cases: Array<[string, Ecosystem, string]> = [
    ['openai', 'js', 'openai'],
    ['@openai/agents', 'js', 'openai'],
    ['openai', 'py', 'openai'],
    ['OpenAI', 'py', 'openai'], // PyPI normalization is case-insensitive
    ['async-openai', 'rust', 'openai'],
    ['github.com/openai/openai-go', 'go', 'openai'],
    ['ruby-openai', 'ruby', 'openai'],
    ['openai_ex', 'elixir', 'openai'],
    ['dart_openai', 'dart', 'openai'],
    ['com.openai:openai-java', 'kotlin', 'openai'],
    ['grok-sdk', 'js', 'xai'],
    ['github.com/xai-org/grok', 'go', 'xai'],
    ['facebook-nodejs-business-sdk', 'js', 'meta'],
    ['com.facebook.react:react-native', 'kotlin', 'meta'],
  ];
  for (const [name, ecosystem, expectedOrg] of cases) {
    const matches = matchDependency(ref(name, ecosystem), orgs);
    assert.ok(matches.length > 0, `${name} (${ecosystem}) should match`);
    assert.equal(matches[0]!.org_key, expectedOrg, `${name} should map to ${expectedOrg}`);
  }
});

test('matcher does not flag clean packages', () => {
  const clean: Array<[string, Ecosystem]> = [
    ['nostr-tools', 'js'],
    ['@nostrify/nostrify', 'js'],
    ['@atproto/api', 'js'],
    ['anthropic', 'py'],
    ['serde', 'rust'],
    ['github.com/nbd-wtf/go-nostr', 'go'],
    ['phoenix', 'elixir'],
    ['com.squareup.okhttp3:okhttp', 'kotlin'],
  ];
  for (const [name, ecosystem] of clean) {
    assert.equal(isExcluded(ref(name, ecosystem), orgs), false, `${name} (${ecosystem}) should be clean`);
  }
});

test('npm scope match is distinct from unrelated scopes', () => {
  assert.equal(isExcluded(ref('@nostr-dev-kit/ndk', 'js'), orgs), false);
  assert.equal(isExcluded(ref('@openai/whatever', 'js'), orgs), true);
});

test('matchGitHubOwner screens excluded repo owners (used for the agentic list)', () => {
  assert.equal(matchGitHubOwner('openai', orgs)?.org_key, 'openai');
  assert.equal(matchGitHubOwner('OpenAI', orgs)?.org_key, 'openai'); // case-insensitive
  assert.equal(matchGitHubOwner('facebookresearch', orgs)?.org_key, 'meta');
  assert.equal(matchGitHubOwner('xai-org', orgs)?.org_key, 'xai');
  assert.equal(matchGitHubOwner('langchain-ai', orgs), null);
  assert.equal(matchGitHubOwner('microsoft', orgs), null); // not excluded
});

test('matching is case-insensitive (registries treat names case-insensitively)', () => {
  // Exact-match ecosystems must not be bypassable by capitalization.
  assert.equal(isExcluded(ref('OpenAI', 'js'), orgs), true);
  assert.equal(isExcluded(ref('@OpenAI/agents', 'js'), orgs), true);
  assert.equal(isExcluded(ref('Ruby-OpenAI', 'ruby'), orgs), true);
  assert.equal(isExcluded(ref('GitHub.com/OpenAI/openai-go', 'go'), orgs), true);
  // crates canonicalizes - and _ AND case:
  assert.equal(isExcluded(ref('Async_OpenAI', 'rust'), orgs), true);
});
