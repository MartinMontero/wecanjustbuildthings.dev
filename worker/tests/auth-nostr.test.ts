import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure';
import {
  issueChallenge, consumeChallenge, verifyNostrAuth, sha256Hex, sanitizeDisplayName,
} from '../auth/nostr.ts';
import type { KVNamespace } from '../auth/cf.ts';

function fakeKV(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(k) { return store.has(k) ? store.get(k)! : null; },
    async put(k, v) { store.set(k, v); },
    async delete(k) { store.delete(k); },
  };
}
const storeOf = () => ({ SESSIONS: fakeKV() });
const URL_OK = 'https://wecanjustbuildthings.dev/api/auth/nostr/verify';
const nowS = () => Math.floor(Date.now() / 1000);

/** Build a `Nostr <base64>` NIP-98 token, signing real schnorr. */
function tokenFor(
  sk: Uint8Array,
  o: { kind?: number; url?: string; method?: string; payload?: string; createdAt?: number },
): string {
  const tags: string[][] = [['u', o.url ?? URL_OK], ['method', o.method ?? 'POST']];
  if (o.payload !== undefined) tags.push(['payload', o.payload]);
  const event = finalizeEvent({ kind: o.kind ?? 27235, created_at: o.createdAt ?? nowS(), content: '', tags }, sk);
  return 'Nostr ' + Buffer.from(JSON.stringify(event), 'utf8').toString('base64');
}

/** A token whose signature has been corrupted after signing. */
function tamperedToken(sk: Uint8Array, payload: string): string {
  const raw = tokenFor(sk, { url: URL_OK, payload }).replace('Nostr ', '');
  const event = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  event.sig = (event.sig[0] === 'a' ? 'b' : 'a') + event.sig.slice(1); // flip one hex char
  return 'Nostr ' + Buffer.from(JSON.stringify(event), 'utf8').toString('base64');
}

test('issueChallenge + consumeChallenge is single-use', async () => {
  const s = storeOf();
  const c = await issueChallenge(s);
  assert.match(c, /^[0-9a-f]{64}$/);
  assert.equal(await consumeChallenge(s, c), true);
  assert.equal(await consumeChallenge(s, c), false); // burned
  assert.equal(await consumeChallenge(s, 'never-issued'), false);
});

test('verifyNostrAuth accepts a valid signed event, returns the pubkey, and is replay-proof', async () => {
  const s = storeOf();
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const challenge = await issueChallenge(s);
  const body = JSON.stringify({ challenge });
  const token = tokenFor(sk, { url: URL_OK, payload: await sha256Hex(body) });

  const res = await verifyNostrAuth(s, token, body, URL_OK, challenge);
  assert.ok(res);
  assert.equal(res!.pubkey, pk);
  // challenge is now burned → an exact replay fails
  assert.equal(await verifyNostrAuth(s, token, body, URL_OK, challenge), null);
});

test('verifyNostrAuth rejects each of the seven failure modes', async () => {
  const sk = generateSecretKey();
  const fresh = async () => {
    const s = storeOf();
    const challenge = await issueChallenge(s);
    const body = JSON.stringify({ challenge });
    return { s, challenge, body, payload: await sha256Hex(body) };
  };

  // (0) no Authorization header
  {
    const { s, challenge, body } = await fresh();
    assert.equal(await verifyNostrAuth(s, null, body, URL_OK, challenge), null);
  }
  // malformed token
  {
    const { s, challenge, body } = await fresh();
    assert.equal(await verifyNostrAuth(s, 'Nostr not-valid-base64!!', body, URL_OK, challenge), null);
  }
  // 1. wrong kind
  {
    const { s, challenge, body, payload } = await fresh();
    assert.equal(await verifyNostrAuth(s, tokenFor(sk, { kind: 1, payload }), body, URL_OK, challenge), null);
  }
  // 2. wrong `u` tag
  {
    const { s, challenge, body, payload } = await fresh();
    const t = tokenFor(sk, { url: 'https://evil.example/api/auth/nostr/verify', payload });
    assert.equal(await verifyNostrAuth(s, t, body, URL_OK, challenge), null);
  }
  // 3. wrong method
  {
    const { s, challenge, body, payload } = await fresh();
    assert.equal(await verifyNostrAuth(s, tokenFor(sk, { method: 'GET', payload }), body, URL_OK, challenge), null);
  }
  // 4. timestamp outside ±60s — BOTH stale and future-dated (the lib misses future)
  {
    const { s, challenge, body, payload } = await fresh();
    assert.equal(await verifyNostrAuth(s, tokenFor(sk, { payload, createdAt: nowS() - 120 }), body, URL_OK, challenge), null);
    assert.equal(await verifyNostrAuth(s, tokenFor(sk, { payload, createdAt: nowS() + 120 }), body, URL_OK, challenge), null);
  }
  // 5. payload tag doesn't match the body
  {
    const { s, challenge, body } = await fresh();
    const wrong = tokenFor(sk, { payload: await sha256Hex('a different body') });
    assert.equal(await verifyNostrAuth(s, wrong, body, URL_OK, challenge), null);
  }
  // 6. bad signature — and the challenge must NOT be burned by a failed attempt
  {
    const { s, challenge, body, payload } = await fresh();
    assert.equal(await verifyNostrAuth(s, tamperedToken(sk, payload), body, URL_OK, challenge), null);
    assert.equal(await consumeChallenge(s, challenge), true); // still live
  }
  // 7. unknown / already-used challenge
  {
    const { s, body, payload } = await fresh();
    const t = tokenFor(sk, { payload });
    assert.equal(await verifyNostrAuth(s, t, body, URL_OK, 'never-issued'), null);
  }
});

test('sanitizeDisplayName drops control chars, trims, caps length, and nulls empties', () => {
  assert.equal(sanitizeDisplayName('  Alice  '), 'Alice');
  assert.equal(sanitizeDisplayName('Bad\tName '), 'BadName'); // tab + trailing space removed
  assert.equal(sanitizeDisplayName('Inner Space'), 'Inner Space'); // legit inner spaces preserved
  assert.equal(sanitizeDisplayName('x'.repeat(200))!.length, 64);
  assert.equal(sanitizeDisplayName('   '), null);
  assert.equal(sanitizeDisplayName(null), null);
  assert.equal(sanitizeDisplayName(undefined), null);
});
