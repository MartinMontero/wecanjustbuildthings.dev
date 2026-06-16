import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRepo, safeLocalPath, cookie, PROVIDERS, isExcludedRouterModel, isPermittedRouterModel } from '../index.ts';

test('isExcludedRouterModel blocks Meta/OpenAI/xAI models via OpenRouter', () => {
  // Excluded vendors are unreachable through the router.
  assert.ok(isExcludedRouterModel('openrouter', 'openai/gpt-4o'));
  assert.ok(isExcludedRouterModel('openrouter', 'meta-llama/llama-3.1-70b-instruct'));
  assert.ok(isExcludedRouterModel('openrouter', 'x-ai/grok-2'));
  assert.ok(isExcludedRouterModel('openrouter', 'XAI/grok'));
  // Permitted models pass; Google is NOT excluded by policy.
  assert.ok(!isExcludedRouterModel('openrouter', 'anthropic/claude-sonnet-4.6'));
  assert.ok(!isExcludedRouterModel('openrouter', 'deepseek/deepseek-chat'));
  assert.ok(!isExcludedRouterModel('openrouter', 'google/gemini-2.0-flash'));
  // The guard only applies to the router; direct providers are already constrained.
  assert.ok(!isExcludedRouterModel('anthropic', 'openai/gpt-4o'));
});

test('isPermittedRouterModel is a default-deny allowlist for the OpenRouter broker (#2)', () => {
  // Excluded vendors are unreachable, regardless of alias/casing.
  assert.ok(!isPermittedRouterModel('openrouter', 'openai/gpt-4o'));
  assert.ok(!isPermittedRouterModel('openrouter', 'meta-llama/llama-3.1-70b-instruct'));
  assert.ok(!isPermittedRouterModel('openrouter', 'x-ai/grok-2'));
  assert.ok(!isPermittedRouterModel('openrouter', 'XAI/grok'));
  // Unknown/unlisted vendors are rejected by default — this is the point of an
  // allowlist over a denylist: nothing slips through just by not being named.
  assert.ok(!isPermittedRouterModel('openrouter', 'some-new-vendor/model'));
  assert.ok(!isPermittedRouterModel('openrouter', 'gpt-4o')); // no vendor segment
  // Vetted, non-excluded vendor families pass.
  assert.ok(isPermittedRouterModel('openrouter', 'anthropic/claude-3.5-sonnet'));
  assert.ok(isPermittedRouterModel('openrouter', 'deepseek/deepseek-chat'));
  assert.ok(isPermittedRouterModel('openrouter', 'google/gemini-2.0-flash'));
  assert.ok(isPermittedRouterModel('openrouter', 'mistralai/mistral-large'));
  // Direct providers hit a hardcoded safe host, so they always pass.
  assert.ok(isPermittedRouterModel('anthropic', 'anything'));
  // The endpoint's default OpenRouter model must itself be permitted.
  assert.ok(isPermittedRouterModel('openrouter', PROVIDERS.openrouter!.defaultModel));
});

test('PROVIDERS allowlist excludes Meta/OpenAI/xAI by policy', () => {
  const keys = Object.keys(PROVIDERS);
  // Only these three are reachable through the BYOK kickoff endpoint.
  assert.deepEqual(keys.sort(), ['anthropic', 'deepseek', 'openrouter']);
  assert.ok(!('openai' in PROVIDERS), 'OpenAI must never be a permitted provider');
  assert.ok(!('xai' in PROVIDERS), 'xAI must never be a permitted provider');
  assert.ok(!('grok' in PROVIDERS));
  // Every provider targets a hardcoded HTTPS host (no user-controlled host).
  for (const p of Object.values(PROVIDERS)) assert.match(p.url, /^https:\/\//);
});

test('safeLocalPath rejects open-redirect targets', () => {
  // Legitimate same-origin paths pass through unchanged.
  assert.equal(safeLocalPath('/build/'), '/build/');
  assert.equal(safeLocalPath('/build/?x=1'), '/build/?x=1');
  // Anything that could leave the origin falls back to the safe default.
  assert.equal(safeLocalPath('https://evil.com'), '/build/');
  assert.equal(safeLocalPath('//evil.com'), '/build/');
  assert.equal(safeLocalPath('/\\evil.com'), '/build/');
  assert.equal(safeLocalPath('javascript:alert(1)'), '/build/');
  assert.equal(safeLocalPath('build/'), '/build/'); // no leading slash
  assert.equal(safeLocalPath(null), '/build/');
  assert.equal(safeLocalPath(undefined), '/build/');
  assert.equal(safeLocalPath(''), '/build/');
  assert.equal(safeLocalPath('/x', '/y'), '/x');
  assert.equal(safeLocalPath('bad', '/y'), '/y'); // custom fallback honored
});

test('normalizeRepo canonicalizes git/shorthand forms to https URLs', () => {
  assert.equal(normalizeRepo('git+https://github.com/a/b.git'), 'https://github.com/a/b');
  assert.equal(normalizeRepo('git://github.com/a/b.git'), 'https://github.com/a/b');
  assert.equal(normalizeRepo('a/b'), 'https://github.com/a/b');
  assert.equal(normalizeRepo('https://github.com/a/b.git#main'), 'https://github.com/a/b#main');
  assert.equal(normalizeRepo(undefined), undefined);
  assert.equal(normalizeRepo('not a url'), undefined);
});

test('cookie parses a named value from the Cookie header', () => {
  const req = new Request('https://x/', { headers: { cookie: 'gh_state=abc; gh_back=%2Fbuild%2F; other=1' } });
  assert.equal(cookie(req, 'gh_state'), 'abc');
  assert.equal(cookie(req, 'gh_back'), '/build/'); // URL-decoded
  assert.equal(cookie(req, 'missing'), undefined);
  assert.equal(cookie(new Request('https://x/'), 'gh_state'), undefined);
});
