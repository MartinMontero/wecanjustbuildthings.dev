import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  withTimeout, TimeoutError, safeApprovalUrl, bunkerReason, looksLikeKeyMaterial,
  BUNKER_CONNECT_TIMEOUT_MS, BUNKER_SIGN_TIMEOUT_MS,
} from './bunker-login.ts';

// ---- withTimeout: every remote-signer await is bounded ----

test('withTimeout passes through a value that settles in time', async () => {
  assert.equal(await withTimeout(Promise.resolve('ok'), 1000, 'op'), 'ok');
});

test('withTimeout propagates the underlying rejection unchanged', async () => {
  const boom = new Error('relay closed');
  await assert.rejects(withTimeout(Promise.reject(boom), 1000, 'op'), (e) => e === boom);
});

test('withTimeout rejects with TimeoutError when the promise never settles', async () => {
  const never = new Promise<string>(() => { /* a bunker that never answers */ });
  await assert.rejects(withTimeout(never, 10, 'bunker connect'), (e: unknown) => {
    assert.ok(e instanceof TimeoutError);
    assert.equal((e as TimeoutError).name, 'TimeoutError');
    assert.match((e as Error).message, /bunker connect/);
    return true;
  });
});

test('withTimeout swallows a LATE rejection after timing out (no unhandled rejection)', async () => {
  let rejectLate!: (e: Error) => void;
  const late = new Promise<string>((_, rej) => { rejectLate = rej; });
  await assert.rejects(withTimeout(late, 5, 'op'), TimeoutError);
  rejectLate(new Error('late relay error'));
  // Give the microtask queue a turn — an unhandled rejection here would fail the run.
  await new Promise((r) => setTimeout(r, 10));
});

test('timeout budgets are sane: bounded, and generous enough for a human approval tap', () => {
  for (const ms of [BUNKER_CONNECT_TIMEOUT_MS, BUNKER_SIGN_TIMEOUT_MS]) {
    assert.ok(ms >= 15_000 && ms <= 120_000, `budget ${ms} out of range`);
  }
});

// ---- safeApprovalUrl: signer-provided auth_url is untrusted input ----

test('safeApprovalUrl accepts http(s) and returns the normalized href', () => {
  assert.equal(safeApprovalUrl('https://nsec.app/approve?id=1'), 'https://nsec.app/approve?id=1');
  assert.equal(safeApprovalUrl('http://localhost:8080/ok'), 'http://localhost:8080/ok');
});

test('safeApprovalUrl drops executable and non-web schemes', () => {
  for (const bad of [
    // eslint-disable-next-line no-script-url
    'javascript:alert(1)',
    'data:text/html,<script>1</script>',
    'blob:https://x/abc',
    'goose://recipe?config=x',
    'file:///etc/passwd',
    'vbscript:x',
  ]) {
    assert.equal(safeApprovalUrl(bad), null, `should drop ${bad}`);
  }
});

test('safeApprovalUrl drops non-strings, unparseable strings, and oversized URLs', () => {
  assert.equal(safeApprovalUrl(undefined), null);
  assert.equal(safeApprovalUrl(42 as unknown), null);
  assert.equal(safeApprovalUrl(''), null);
  assert.equal(safeApprovalUrl('not a url'), null);
  assert.equal(safeApprovalUrl('https://x.example/' + 'a'.repeat(2048)), null);
});

// ---- bunkerReason: static strings only, never echoing signer text ----

test('bunkerReason explains a timeout and the single-use secret rule', () => {
  const m = bunkerReason(new TimeoutError('bunker connect', 60_000));
  assert.match(m, /didn’t answer in time/i);
  assert.match(m, /single-use/i);
});

test('bunkerReason maps challenge/verify round-trip failures to their own lines', () => {
  assert.match(bunkerReason(new Error('challenge')), /login challenge/i);
  assert.match(bunkerReason(new Error('verify')), /allowlisted admin keys/i);
});

test('bunkerReason maps bunker rejections (incl. string rejections) to the fresh-string hint', () => {
  // nostr-tools rejects with the bunker's error STRING verbatim — not an Error.
  assert.match(bunkerReason('invalid secret'), /single-use/i);
  assert.match(bunkerReason(new Error('already connected')), /fresh/i);
  assert.match(bunkerReason('unauthorized'), /single-use/i);
});

test('bunkerReason NEVER echoes attacker-influenceable error text', () => {
  const hostile = '<img src=x onerror=alert(1)> secret';
  for (const e of [new Error(hostile), hostile]) {
    const m = bunkerReason(e);
    assert.ok(!m.includes('<'), 'message must not contain markup from the error');
    assert.ok(!m.includes('img'), 'message must not echo error content');
  }
});

test('bunkerReason falls back to the generic explanation for unknown failures', () => {
  assert.match(bunkerReason(new Error('ECONNRESET')), /didn’t complete/i);
  assert.match(bunkerReason(null), /didn’t complete/i);
});

// ---- looksLikeKeyMaterial: the nsec refusal gate (unchanged behavior, now pinned) ----

test('looksLikeKeyMaterial refuses nsec, ncryptsec, and raw 64-hex', () => {
  assert.ok(looksLikeKeyMaterial('nsec1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq'));
  assert.ok(looksLikeKeyMaterial('  NSEC1ABC  '), 'case- and whitespace-insensitive');
  assert.ok(looksLikeKeyMaterial('ncryptsec1xyz'));
  assert.ok(looksLikeKeyMaterial('a'.repeat(64)));
  assert.ok(looksLikeKeyMaterial('0123456789abcdef'.repeat(4)));
});

test('looksLikeKeyMaterial allows bunker strings and NIP-05 names', () => {
  assert.ok(!looksLikeKeyMaterial('bunker://abc123?relay=wss://relay.example&secret=s'));
  assert.ok(!looksLikeKeyMaterial('admin@example.com'));
  assert.ok(!looksLikeKeyMaterial('npub1kdve3xh5l4xnuwx87zff9pyrq044kx9pd6lsxwdfgpy0xklhv5qs96rgqv'), 'npub is PUBLIC — not key material');
});
