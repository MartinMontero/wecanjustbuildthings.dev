import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JoseKey } from '@atproto/jwk-jose';
import { isValidHandle, normalizeHandle, blueskyClientMetadata, type BlueskyEnv } from '../auth/bluesky.ts';
import type { KVNamespace } from '../auth/cf.ts';

function fakeKV(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(k) { return store.has(k) ? store.get(k)! : null; },
    async put(k, v) { store.set(k, v); },
    async delete(k) { store.delete(k); },
  };
}

const SITE = 'https://wecanjustbuildthings.dev';

async function envWithKey(): Promise<BlueskyEnv> {
  const key = await JoseKey.generate(['ES256'], 'test-signing-1');
  return { ATPROTO: fakeKV(), SITE_URL: SITE, BLUESKY_PRIVATE_KEY_JWK: JSON.stringify(key.privateJwk) };
}

test('normalizeHandle lowercases, trims, and strips a leading @', () => {
  assert.equal(normalizeHandle('  Alice.BSKY.Social '), 'alice.bsky.social');
  assert.equal(normalizeHandle('@Bob.example.com'), 'bob.example.com');
});

test('isValidHandle accepts real handles and supported DIDs', () => {
  for (const h of [
    'alice.bsky.social', 'example.com', 'a.bc', 'sub.domain.example.org',
    '@alice.bsky.social', 'did:plc:ewvi7nxzyoun6zhxrhs64oiz', 'did:web:example.com',
  ]) {
    assert.ok(isValidHandle(h), `should accept ${h}`);
  }
});

test('isValidHandle rejects garbage, bare words, schemes, and bad DIDs', () => {
  for (const h of [
    '', 'a', 'nodot', 'foo..bar', 'http://x.com', 'has space.com',
    'did:foo:bar', 'x'.repeat(254) + '.com',
  ]) {
    assert.ok(!isValidHandle(h), `should reject ${JSON.stringify(h)}`);
  }
});

test('blueskyClientMetadata: correct ids, least-privilege scope, and DPoP binding', async () => {
  const md = await blueskyClientMetadata(await envWithKey());
  assert.equal(md.client_id, `${SITE}/api/auth/bluesky/client-metadata.json`);
  assert.deepEqual(md.redirect_uris, [`${SITE}/api/auth/bluesky/callback`]);
  assert.equal(md.scope, 'atproto'); // identity only — never transition:generic
  assert.equal(md.token_endpoint_auth_method, 'private_key_jwt');
  assert.equal(md.token_endpoint_auth_signing_alg, 'ES256');
  assert.equal(md.dpop_bound_access_tokens, true);
  assert.deepEqual(md.response_types, ['code']);
  assert.ok(md.grant_types?.includes('authorization_code'));
  assert.ok(md.grant_types?.includes('refresh_token'));
});

test('blueskyClientMetadata publishes ONLY the public key (never the private "d")', async () => {
  const md = await blueskyClientMetadata(await envWithKey());
  const keys = md.jwks?.keys ?? [];
  assert.equal(keys.length, 1);
  const jwk = keys[0] as Record<string, unknown>;
  assert.equal(jwk.kty, 'EC');
  assert.equal(jwk.crv, 'P-256');
  assert.equal(jwk.kid, 'test-signing-1');
  assert.equal(jwk.d, undefined, 'private component "d" must NOT be published');
  assert.ok(jwk.x && jwk.y, 'public coordinates must be present');
});
