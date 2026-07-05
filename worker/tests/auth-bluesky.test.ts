import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JoseKey } from '@atproto/jwk-jose';
import {
  isValidHandle, normalizeHandle, blueskyClientMetadata, newOAuthState,
  sanitizeEdgeRequestInit, installEdgeRequestShim, edgeFetch, type BlueskyEnv,
} from '../auth/bluesky.ts';
import type { KVNamespace } from '../auth/cf.ts';

function fakeKV(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(k) { return store.has(k) ? store.get(k)! : null; },
    async put(k, v) { store.set(k, v); },
    async delete(k) { store.delete(k); },
    async list(options) {
      const prefix = options?.prefix ?? '';
      return { keys: [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true };
    },
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

test('newOAuthState is a unique 256-bit (64 hex) CSPRNG token for browser-bound state', () => {
  // The login-CSRF defense: this token is set as the bsky_state cookie at sign-in
  // start AND passed as the OAuth app-level `state`, so the callback can prove the
  // completing browser is the one that started. It must be unguessable + unique.
  const a = newOAuthState(), b = newOAuthState();
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, b);
});

// NOTE: the end-to-end callback state-match rejection (blueskyCallback throwing on a
// missing/mismatched cookie) needs a live PDS OAuth response to reach the check, so it
// is covered by integration testing, not this offline unit suite. The token generator
// above and the handler wiring (worker/tests/routing.test.ts) are what's unit-tested.

// --- Workers edge-runtime redirect:'error' handling (bluesky-social/atproto#3292) ---
// @atproto's resolvers issue fetch/Request with redirect:'error', which workerd
// rejects at Request CONSTRUCTION. The fix is one sanitizer wired into two seams:
// a Request-constructor shim (for `new Request` sites — DID/metadata resolvers) and
// an injected fetch (for direct fetch(url,init) sites — the XRPC handle resolver).
// The runtime's construction-time REJECTION isn't reproducible here (Node's fetch
// accepts 'error'), so we unit-test the sanitizer/shim/fetch mapping logic; the
// live authorize() round-trip on the Workers runtime is the operator's prod re-test.

test('sanitizeEdgeRequestInit maps redirect:"error"→"manual", preserves everything else, no mutation', () => {
  assert.deepEqual(
    sanitizeEdgeRequestInit({ redirect: 'error', headers: { a: '1' }, cache: 'no-cache' }),
    { redirect: 'manual', headers: { a: '1' }, cache: 'no-cache' },
  );
  assert.deepEqual(sanitizeEdgeRequestInit({ redirect: 'follow' }), { redirect: 'follow' });
  assert.equal(sanitizeEdgeRequestInit(undefined), undefined);
  const orig: RequestInit = { redirect: 'error' };
  sanitizeEdgeRequestInit(orig);
  assert.equal(orig.redirect, 'error', 'input is not mutated (returns a copy)');
});

test('installEdgeRequestShim routes new Request(...) construction through the sanitizer (idempotent)', () => {
  const Native = globalThis.Request;
  try {
    installEdgeRequestShim();
    const Wrapped = globalThis.Request;
    assert.notEqual(Wrapped, Native, 'Request constructor is wrapped');
    installEdgeRequestShim();
    assert.equal(globalThis.Request, Wrapped, 'idempotent — never double-wrapped');
    // The load-bearing behavior: a redirect:"error" construction yields manual mode
    // (on workerd this is what averts the construction-time TypeError).
    assert.equal(new Request('https://x/', { redirect: 'error' }).redirect, 'manual');
    assert.equal(new Request('https://x/', { redirect: 'follow' }).redirect, 'follow');
    assert.equal(new Request('https://x/').redirect, 'follow'); // default untouched
  } finally {
    globalThis.Request = Native; // restore native for the rest of the suite
  }
});

test('edgeFetch routes direct fetch(url, init) calls through the sanitizer', async () => {
  const seen: Array<{ init?: RequestInit }> = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    seen.push({ init });
    return new Response('ok');
  }) as typeof fetch;
  try {
    await edgeFetch('https://x/', { redirect: 'error', headers: { accept: 'application/json' } });
    assert.equal(seen[0]!.init!.redirect, 'manual');
    assert.deepEqual(seen[0]!.init!.headers, { accept: 'application/json' });
    await edgeFetch('https://x/'); // no init → passes through untouched
    assert.equal(seen[1]!.init, undefined);
  } finally {
    globalThis.fetch = realFetch;
  }
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
