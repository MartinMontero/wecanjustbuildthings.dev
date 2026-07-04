/**
 * Phase 2 admin-auth contract. Same harness discipline as the other worker tests:
 * plain in-memory fakes + node:test, real schnorr signatures, and the REAL
 * AdminCoordinator class behind a hand-fake DurableObjectNamespace — no miniflare,
 * no new dependencies.
 *
 * The allowlist used here is injected through routeAdmin's compile-time deps seam.
 * Fails-closed is proven against an EMPTY FIXTURE (EMPTY_ALLOWLIST below) so the
 * proof is invariant to whichever identities the operator has constituted in the
 * committed list; the committed list itself is validated for well-formedness.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure';
import { routeAdmin } from '../admin/router.ts';
import { AdminCoordinator } from '../admin/coordinator.ts';
import {
  ADMIN_ALLOWLIST, isAllowedNostrPubkey, isAllowedBlueskyDid, adminRoleFor,
  isWellFormedNostrEntry, isWellFormedBlueskyEntry, type AdminAllowlist,
} from '../admin/allowlist.ts';
import {
  ADMIN_SESSION_COOKIE, ADMIN_IDLE_SECONDS, ADMIN_ABSOLUTE_SECONDS,
  putAdminSession, resolveAdminSessionId, adminSessionCookie, newAdminSessionId,
} from '../admin/session.ts';
import { sha256Hex } from '../auth/nostr.ts';
import { SESSION_COOKIE, createSession } from '../auth/session.ts';
import { getOrCreateUserByIdentity } from '../auth/db.ts';
import type {
  KVNamespace, D1Database, D1PreparedStatement, D1Result,
  DurableObjectNamespace, DurableObjectState, RateLimit,
} from '../auth/cf.ts';
import type { AdminEnv } from '../admin/types.ts';

const ORIGIN = 'https://wecanjustbuildthings.dev';

// ---- fakes ----

interface RecordedPut { key: string; value: string; options?: { expirationTtl?: number; expiration?: number } }
function fakeKV(): KVNamespace & { puts: RecordedPut[] } {
  const store = new Map<string, string>();
  const puts: RecordedPut[] = [];
  return {
    puts,
    async get(k) { return store.has(k) ? store.get(k)! : null; },
    async put(k, v, options) { store.set(k, v); puts.push({ key: k, value: v, options }); },
    async delete(k) { store.delete(k); },
  };
}

interface UserRow { id: string; created_at: number; display_name: string | null }
function fakeD1(): D1Database {
  const users = new Map<string, UserRow>();
  // key: provider|subject → user_id; the reverse read below scans it.
  const identities = new Map<string, { user_id: string }>();
  const apply = (sql: string, a: unknown[]) => {
    if (sql.includes('DELETE FROM users')) { users.delete(a[0] as string); return; }
    if (sql.includes('INTO users')) {
      const id = a[0] as string;
      if (sql.includes('OR IGNORE') && users.has(id)) return;
      users.set(id, { id, created_at: a[1] as number, display_name: (a[2] ?? null) as string | null });
      return;
    }
    if (sql.includes('INTO identities')) {
      const key = `${a[0]}|${a[1]}`;
      if (sql.includes('OR IGNORE') && identities.has(key)) return;
      identities.set(key, { user_id: a[2] as string });
    }
  };
  const make = (sql: string): D1PreparedStatement => {
    let args: unknown[] = [];
    const stmt: D1PreparedStatement = {
      bind(...a) { args = a; return stmt; },
      async first<T>() {
        if (sql.includes('SELECT subject FROM identities')) {
          for (const [key, v] of identities) {
            const [provider, ...rest] = key.split('|');
            if (v.user_id === args[0] && provider === args[1]) return ({ subject: rest.join('|') } as T);
          }
          return null;
        }
        if (sql.includes('JOIN users')) {
          const idn = identities.get(`${args[0]}|${args[1]}`);
          return (((idn && users.get(idn.user_id)) ?? null) as T | null);
        }
        if (sql.includes('FROM users WHERE id')) return ((users.get(args[0] as string) ?? null) as T | null);
        if (sql.includes('FROM identities WHERE provider')) { const r = identities.get(`${args[0]}|${args[1]}`); return ((r ?? null) as T | null); }
        return null;
      },
      async run(): Promise<D1Result> { apply(sql, args); return { results: [], success: true }; },
      async all<T>(): Promise<D1Result<T>> { return { results: [], success: true }; },
    };
    return stmt;
  };
  return { prepare: make, async batch(stmts) { for (const s of stmts) await s.run(); return []; } };
}

/** The REAL AdminCoordinator running behind a hand-fake namespace: one instance +
 *  in-memory storage per idFromName() name, faithfully per-identity. */
function fakeCoordNamespace(): DurableObjectNamespace {
  const instances = new Map<string, AdminCoordinator>();
  const instanceFor = (name: string) => {
    let inst = instances.get(name);
    if (!inst) {
      const map = new Map<string, unknown>();
      const state: DurableObjectState = {
        storage: {
          async get<T>(key: string) { return map.get(key) as T | undefined; },
          async put<T>(key: string, value: T) { map.set(key, value); },
          async delete(key: string) { return map.delete(key); },
        },
        async blockConcurrencyWhile<T>(fn: () => Promise<T>) { return fn(); },
      };
      inst = new AdminCoordinator(state, {});
      instances.set(name, inst);
    }
    return inst;
  };
  return {
    idFromName: (name: string) => ({ toString: () => name }),
    get: (id) => ({ fetch: (request: Request) => instanceFor(id.toString()).fetch(request) }),
  };
}

const allowAllLimiter: RateLimit = { async limit() { return { success: true }; } };
const denyAllLimiter: RateLimit = { async limit() { return { success: false }; } };

function fakeEnv(overrides: Partial<AdminEnv> = {}): AdminEnv & { ADMIN_SESSIONS: ReturnType<typeof fakeKV> } {
  return {
    ADMIN_SESSIONS: fakeKV(),
    ADMIN_COORD: fakeCoordNamespace(),
    SESSIONS: fakeKV(),
    DB: fakeD1(),
    SITE_URL: ORIGIN,
    AUTH_RATE_LIMITER: allowAllLimiter,
    ...overrides,
  } as AdminEnv & { ADMIN_SESSIONS: ReturnType<typeof fakeKV> };
}

const req = (path: string, init?: RequestInit) => new Request(`${ORIGIN}${path}`, init);
const nowS = () => Math.floor(Date.now() / 1000);

/** Real-schnorr NIP-98 token (same shape as the auth-nostr tests). */
function tokenFor(
  sk: Uint8Array,
  o: { kind?: number; url: string; method?: string; payload?: string; createdAt?: number },
): string {
  const tags: string[][] = [['u', o.url], ['method', o.method ?? 'POST']];
  if (o.payload !== undefined) tags.push(['payload', o.payload]);
  const event = finalizeEvent({ kind: o.kind ?? 27235, created_at: o.createdAt ?? nowS(), content: '', tags }, sk);
  return 'Nostr ' + Buffer.from(JSON.stringify(event), 'utf8').toString('base64');
}

/** Full challenge → sign → verify round-trip against the admin router. */
async function nostrLogin(env: AdminEnv, sk: Uint8Array, deps?: Parameters<typeof routeAdmin>[2]) {
  const cRes = await routeAdmin(req('/api/admin/login/nostr/challenge', { method: 'POST' }), env, deps);
  assert.equal(cRes.status, 200);
  const { challenge } = (await cRes.json()) as { challenge: string };
  const body = JSON.stringify({ challenge });
  const token = tokenFor(sk, { url: `${ORIGIN}/api/admin/login/nostr/verify`, payload: await sha256Hex(body) });
  return routeAdmin(req('/api/admin/login/nostr/verify', {
    method: 'POST', body, headers: { authorization: token, 'content-type': 'application/json' },
  }), env, deps);
}

const cookieOf = (res: Response) => res.headers.get('set-cookie') ?? '';
const sessionIdOf = (res: Response) => /__Host-wcjbt_admin=([0-9a-f]{64})/.exec(cookieOf(res))?.[1] ?? '';
const withAdminCookie = (path: string, id: string, init?: RequestInit) =>
  req(path, { ...init, headers: { ...(init?.headers as Record<string, string> ?? {}), cookie: `${ADMIN_SESSION_COOKIE}=${id}` } });

// ---- fails-closed, proven against an EMPTY FIXTURE ----
// The fixture — not the committed list — carries the fails-closed proof, so these
// tests stay valid regardless of which identities the operator has constituted.

const EMPTY_ALLOWLIST: AdminAllowlist = { nostr: [], bluesky: [] };

test('an EMPTY allowlist rejects a perfectly VALID signature (fail closed, generic 401)', async () => {
  const env = fakeEnv();
  const res = await nostrLogin(env, generateSecretKey(), { allowlist: EMPTY_ALLOWLIST });
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'authentication failed' }); // no oracle
  assert.equal(cookieOf(res), ''); // and no cookie
});

test('routeAdmin DEFAULTS to the committed allowlist: an uncommitted key is rejected', async () => {
  // No deps passed → the committed ADMIN_ALLOWLIST is in force. A fresh random key
  // is (probabilistically) never a member, so this pins the default wiring without
  // depending on whether the operator has constituted identities yet.
  const env = fakeEnv();
  const res = await nostrLogin(env, generateSecretKey());
  assert.equal(res.status, 401);
});

test('every COMMITTED allowlist entry is well-formed with a valid role', () => {
  for (const entry of ADMIN_ALLOWLIST.nostr) {
    assert.ok(isWellFormedNostrEntry(entry), `malformed nostr entry: ${entry.pubkey}`);
  }
  for (const entry of ADMIN_ALLOWLIST.bluesky) {
    assert.ok(isWellFormedBlueskyEntry(entry), `malformed bluesky entry: ${entry.did}`);
  }
});

test('a NON-allowlisted pubkey is rejected exactly like a bad signature', async () => {
  const env = fakeEnv();
  const admin = generateSecretKey();
  const intruder = generateSecretKey();
  const deps = { allowlist: { nostr: [{ pubkey: getPublicKey(admin), role: 'admin' }], bluesky: [] } };
  const res = await nostrLogin(env, intruder, deps);
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'authentication failed' });
});

test('allowlist matchers reject malformed subjects and malformed ENTRIES', () => {
  const list: AdminAllowlist = {
    nostr: [{ pubkey: 'ABC', role: 'admin' }, { pubkey: 'f'.repeat(64), role: 'admin' }],
    bluesky: [{ did: 'not-a-did', role: 'admin' }, { did: 'did:plc:ok123', role: 'admin' }],
  };
  assert.equal(isAllowedNostrPubkey(list, 'F'.repeat(64)), true); // hex case-insensitive
  assert.equal(isAllowedNostrPubkey(list, 'abc'), false);         // malformed subject
  assert.equal(isAllowedNostrPubkey({ nostr: [{ pubkey: 'ABC', role: 'admin' }], bluesky: [] }, 'abc'), false); // malformed entry never matches
  assert.equal(isAllowedBlueskyDid(list, 'did:plc:ok123'), true);
  assert.equal(isAllowedBlueskyDid(list, 'not-a-did'), false);
});

test('adminRoleFor returns the recorded role for members, null otherwise (role is genesis DATA)', () => {
  const pk = 'a'.repeat(64);
  const list: AdminAllowlist = {
    nostr: [{ pubkey: pk, role: 'superadmin' }],
    bluesky: [{ did: 'did:plc:member1', role: 'admin' }],
  };
  assert.equal(adminRoleFor(list, 'nostr', pk), 'superadmin');
  assert.equal(adminRoleFor(list, 'nostr', pk.toUpperCase()), 'superadmin'); // hex case-insensitive
  assert.equal(adminRoleFor(list, 'bluesky', 'did:plc:member1'), 'admin');
  assert.equal(adminRoleFor(list, 'nostr', 'b'.repeat(64)), null);
  assert.equal(adminRoleFor(list, 'bluesky', 'did:plc:stranger'), null);
});

// ---- Nostr login happy path + session cookie contract ----

test('allowlisted NIP-98 login mints a Strict __Host- admin session + csrf', async () => {
  const env = fakeEnv();
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const deps = { allowlist: { nostr: [{ pubkey: pk, role: 'admin' }], bluesky: [] } };
  const res = await nostrLogin(env, sk, deps);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { identity: string; method: string; csrf: string };
  assert.equal(body.identity, pk);
  assert.equal(body.method, 'nostr');
  assert.match(body.csrf, /^[0-9a-f]{64}$/);
  const cookie = cookieOf(res);
  assert.ok(cookie.startsWith(`${ADMIN_SESSION_COOKIE}=`));
  for (const attr of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/', `Max-Age=${ADMIN_ABSOLUTE_SECONDS}`]) {
    assert.ok(cookie.includes(attr), `missing ${attr}`);
  }
  assert.ok(!/Domain=/i.test(cookie)); // __Host- forbids Domain

  // whoami rides the cookie and reports the SAME identity + csrf for the tab
  const who = await routeAdmin(withAdminCookie('/api/admin/whoami', sessionIdOf(res)), env, deps);
  assert.equal(who.status, 200);
  const whoBody = (await who.json()) as { identity: string; method: string; csrf?: string };
  assert.equal(whoBody.identity, pk);
  assert.equal(whoBody.method, 'nostr');
  assert.equal(whoBody.csrf, body.csrf);
});

test('mid-session REVOCATION (Nostr): de-listing an identity kills its live cookie session on the next request', async () => {
  const env = fakeEnv();
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const allowed = { allowlist: { nostr: [{ pubkey: pk, role: 'admin' }], bluesky: [] } };
  const id = sessionIdOf(await nostrLogin(env, sk, allowed));
  // While the session is still well within its idle+absolute bounds, the identity
  // is removed from the allowlist (simulating a revocation commit+deploy).
  const revoked = { allowlist: EMPTY_ALLOWLIST };
  assert.equal((await routeAdmin(withAdminCookie('/api/admin/whoami', id), env, revoked)).status, 401);
  // …and the session is destroyed, not merely rejected: even the ORIGINAL (still-
  // allowlisted) deps can't resurrect it.
  assert.equal((await routeAdmin(withAdminCookie('/api/admin/whoami', id), env, allowed)).status, 401);
});

test('mid-session REVOCATION (Bluesky): de-listing a DID kills its elevated cookie session next request', async () => {
  const env = fakeEnv();
  const did = 'did:plc:revokeme';
  const allowed = { allowlist: { nostr: [], bluesky: [{ did: did, role: 'admin' }] } };
  const sid = await blueskyUserSession(env, did);
  const elevated = await routeAdmin(req('/api/admin/elevate/bluesky', {
    method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${sid}` },
  }), env, allowed);
  const id = sessionIdOf(elevated);
  assert.equal((await routeAdmin(withAdminCookie('/api/admin/whoami', id), env, allowed)).status, 200);
  const revoked = { allowlist: EMPTY_ALLOWLIST };
  assert.equal((await routeAdmin(withAdminCookie('/api/admin/whoami', id), env, revoked)).status, 401);
  assert.equal((await routeAdmin(withAdminCookie('/api/admin/whoami', id), env, allowed)).status, 401); // destroyed
});

test('a replayed login (same challenge + token) fails: challenges are single-use', async () => {
  const env = fakeEnv();
  const sk = generateSecretKey();
  const deps = { allowlist: { nostr: [{ pubkey: getPublicKey(sk), role: 'admin' }], bluesky: [] } };
  const cRes = await routeAdmin(req('/api/admin/login/nostr/challenge', { method: 'POST' }), env, deps);
  const { challenge } = (await cRes.json()) as { challenge: string };
  const body = JSON.stringify({ challenge });
  const token = tokenFor(sk, { url: `${ORIGIN}/api/admin/login/nostr/verify`, payload: await sha256Hex(body) });
  const send = () => routeAdmin(req('/api/admin/login/nostr/verify', {
    method: 'POST', body, headers: { authorization: token },
  }), env, deps);
  assert.equal((await send()).status, 200);
  assert.equal((await send()).status, 401); // burned
});

// ---- sessions: missing/invalid/expired + the TTL model ----

test('whoami rejects: no credentials, unknown cookie, malformed record', async () => {
  const env = fakeEnv();
  assert.equal((await routeAdmin(req('/api/admin/whoami'), env)).status, 401);
  assert.equal((await routeAdmin(withAdminCookie('/api/admin/whoami', 'a'.repeat(64)), env)).status, 401);
  await env.ADMIN_SESSIONS.put('adm:corrupt', 'not json{');
  assert.equal((await routeAdmin(withAdminCookie('/api/admin/whoami', 'corrupt'), env)).status, 401);
});

test('IDLE bound: a session unused for 15 min is rejected and deleted', async () => {
  const kv = fakeKV();
  const id = newAdminSessionId();
  const t0 = Date.now();
  await putAdminSession(kv, id, 'f'.repeat(64), 'nostr', t0);
  const late = t0 + (ADMIN_IDLE_SECONDS * 1000 + 1);
  assert.equal(await resolveAdminSessionId(kv, id, late), null);
  assert.equal(await kv.get(`adm:${id}`), null); // proactively deleted
});

test('ABSOLUTE bound does NOT slide: constant activity still dies at 8 h', async () => {
  const kv = fakeKV();
  const id = newAdminSessionId();
  const t0 = Date.now();
  await putAdminSession(kv, id, 'f'.repeat(64), 'nostr', t0);
  // Touch the session every 10 minutes for 8 hours — always inside the idle bound.
  for (let m = 10; m <= 8 * 60 - 10; m += 10) {
    assert.ok(await resolveAdminSessionId(kv, id, t0 + m * 60_000), `alive at +${m}min`);
  }
  // One millisecond past the absolute bound: dead, no matter how recent lastSeen is.
  assert.equal(await resolveAdminSessionId(kv, id, t0 + ADMIN_ABSOLUTE_SECONDS * 1000), null);
});

test('NO-SLIDE property: every refresh rewrite pins the ABSOLUTE expiration epoch', async () => {
  const kv = fakeKV();
  const id = newAdminSessionId();
  const t0 = Date.now();
  await putAdminSession(kv, id, 'f'.repeat(64), 'nostr', t0);
  const absolute = Math.floor(t0 / 1000) + ADMIN_ABSOLUTE_SECONDS;
  await resolveAdminSessionId(kv, id, t0 + 5 * 60_000);  // refresh #1 (lastSeen 5 min stale)
  await resolveAdminSessionId(kv, id, t0 + 12 * 60_000); // refresh #2 (7 min after #1)
  const sessionPuts = kv.puts.filter((p) => p.key === `adm:${id}`);
  assert.equal(sessionPuts.length, 3, 'initial put + two refreshes');
  for (const p of sessionPuts) {
    assert.equal(p.options?.expiration, absolute, 'rewrite must pin createdAt+8h');
    assert.equal(p.options?.expirationTtl, undefined, 'never a sliding relative TTL');
  }
});

test('COALESCED writes: a second touch within 60 s does not rewrite the record', async () => {
  const kv = fakeKV();
  const id = newAdminSessionId();
  const t0 = Date.now();
  await putAdminSession(kv, id, 'f'.repeat(64), 'nostr', t0);
  await resolveAdminSessionId(kv, id, t0 + 5 * 60_000);      // stale ≥60s → rewrite
  const after = kv.puts.filter((p) => p.key === `adm:${id}`).length;
  await resolveAdminSessionId(kv, id, t0 + 5 * 60_000 + 30_000); // 30s later → coalesced
  assert.equal(kv.puts.filter((p) => p.key === `adm:${id}`).length, after);
});

test('the final <60 s before the absolute bound skips the rewrite (KV min window) but still serves', async () => {
  const kv = fakeKV();
  const id = newAdminSessionId();
  const now = Date.now();
  const createdAt = now - (ADMIN_ABSOLUTE_SECONDS * 1000 - 30_000); // 30s of absolute life left
  const record = { subject: 'f'.repeat(64), method: 'nostr', createdAt, lastSeen: now - 2 * 60_000 };
  await kv.put(`adm:${id}`, JSON.stringify(record));
  const before = kv.puts.length;
  const resolved = await resolveAdminSessionId(kv, id, now);
  assert.ok(resolved, 'still valid inside the tail');
  assert.equal(kv.puts.length, before, 'no rewrite inside the KV minimum-expiration window');
});

// ---- CSRF + logout ----

test('logout demands the coordinator-held CSRF token and a same-site request', async () => {
  const env = fakeEnv();
  const sk = generateSecretKey();
  const deps = { allowlist: { nostr: [{ pubkey: getPublicKey(sk), role: 'admin' }], bluesky: [] } };
  const login = await nostrLogin(env, sk, deps);
  const id = sessionIdOf(login);
  const { csrf } = (await login.json()) as { csrf: string };

  // cross-site → rejected before anything else
  const xsite = await routeAdmin(withAdminCookie('/api/admin/logout', id, {
    method: 'POST', headers: { 'sec-fetch-site': 'cross-site' },
  }), env, deps);
  assert.equal(xsite.status, 403);

  // missing token → 403; wrong token → 403; session survives both
  assert.equal((await routeAdmin(withAdminCookie('/api/admin/logout', id, { method: 'POST' }), env, deps)).status, 403);
  assert.equal((await routeAdmin(withAdminCookie('/api/admin/logout', id, {
    method: 'POST', headers: { 'x-admin-csrf': 'f'.repeat(64) },
  }), env, deps)).status, 403);
  assert.equal((await routeAdmin(withAdminCookie('/api/admin/whoami', id), env, deps)).status, 200);

  // right token → session destroyed + cookie cleared
  const out = await routeAdmin(withAdminCookie('/api/admin/logout', id, {
    method: 'POST', headers: { 'x-admin-csrf': csrf },
  }), env, deps);
  assert.equal(out.status, 200);
  assert.ok(cookieOf(out).includes('Max-Age=0'));
  assert.equal((await routeAdmin(withAdminCookie('/api/admin/whoami', id), env, deps)).status, 401);
});

// ---- rate limiting (pre-auth, native limiter buckets) ----

test('admin-login and admin-elevate buckets return 429 when the limiter trips', async () => {
  const env = fakeEnv({ AUTH_RATE_LIMITER: denyAllLimiter });
  assert.equal((await routeAdmin(req('/api/admin/login/nostr/challenge', { method: 'POST' }), env)).status, 429);
  assert.equal((await routeAdmin(req('/api/admin/login/nostr/verify', { method: 'POST', body: '{}' }), env)).status, 429);
  assert.equal((await routeAdmin(req('/api/admin/elevate/bluesky', { method: 'POST' }), env)).status, 429);
});

// ---- per-request NIP-98 (API clients) ----

test('per-request NIP-98 whoami: allowlisted GET signature works once, replay dies', async () => {
  const env = fakeEnv();
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const deps = { allowlist: { nostr: [{ pubkey: pk, role: 'admin' }], bluesky: [] } };
  const token = tokenFor(sk, { url: `${ORIGIN}/api/admin/whoami`, method: 'GET' }); // bodyless: no payload tag
  const call = () => routeAdmin(req('/api/admin/whoami', { headers: { authorization: token } }), env, deps);
  const first = await call();
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { identity: pk, method: 'nostr' });
  assert.equal((await call()).status, 401); // single-use event id → replay rejected
});

test('per-request NIP-98 negatives: bad sig, wrong url, wrong method, stale, future, empty allowlist', async () => {
  const env = fakeEnv();
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const deps = { allowlist: { nostr: [{ pubkey: pk, role: 'admin' }], bluesky: [] } };
  const url = `${ORIGIN}/api/admin/whoami`;
  const call = (authorization: string, d = deps) =>
    routeAdmin(req('/api/admin/whoami', { headers: { authorization } }), env, d);

  // tampered signature
  const raw = tokenFor(sk, { url, method: 'GET' }).replace('Nostr ', '');
  const ev = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  ev.sig = (ev.sig[0] === 'a' ? 'b' : 'a') + ev.sig.slice(1);
  assert.equal((await call('Nostr ' + Buffer.from(JSON.stringify(ev)).toString('base64'))).status, 401);
  // wrong url / wrong method tag
  assert.equal((await call(tokenFor(sk, { url: `${ORIGIN}/api/admin/other`, method: 'GET' }))).status, 401);
  assert.equal((await call(tokenFor(sk, { url, method: 'POST' }))).status, 401);
  // outside the ±60s window, both directions
  assert.equal((await call(tokenFor(sk, { url, method: 'GET', createdAt: nowS() - 120 }))).status, 401);
  assert.equal((await call(tokenFor(sk, { url, method: 'GET', createdAt: nowS() + 120 }))).status, 401);
  // valid signature, EMPTY (committed) allowlist → still rejected
  assert.equal((await routeAdmin(req('/api/admin/whoami', {
    headers: { authorization: tokenFor(sk, { url, method: 'GET' }) },
  }), env)).status, 401);
});

// ---- Bluesky reuse-then-elevate ----

async function blueskyUserSession(env: ReturnType<typeof fakeEnv>, did: string) {
  const user = await getOrCreateUserByIdentity(env.DB!, 'bluesky', did, 'Admin Person');
  return createSession({ SESSIONS: env.SESSIONS!, DB: env.DB! }, user);
}

test('an allowlisted DID elevates its user session into an admin session', async () => {
  const env = fakeEnv();
  const did = 'did:plc:adminxyz';
  const deps = { allowlist: { nostr: [], bluesky: [{ did: did, role: 'admin' }] } };
  const sid = await blueskyUserSession(env, did);
  const res = await routeAdmin(req('/api/admin/elevate/bluesky', {
    method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${sid}` },
  }), env, deps);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { identity: string; method: string; csrf: string };
  assert.equal(body.identity, did);
  assert.equal(body.method, 'bluesky');
  assert.ok(cookieOf(res).includes('SameSite=Strict'));
  // whoami on the new admin session reports the DID
  const who = await routeAdmin(withAdminCookie('/api/admin/whoami', sessionIdOf(res)), env, deps);
  assert.deepEqual(((await who.json()) as { identity: string }).identity, did);
});

test('elevation rejects: no user session, non-allowlisted DID, nostr-only user, cross-site', async () => {
  const env = fakeEnv();
  const deps = { allowlist: { nostr: [], bluesky: [{ did: 'did:plc:someoneelse', role: 'admin' }] } };
  // no session cookie
  assert.equal((await routeAdmin(req('/api/admin/elevate/bluesky', { method: 'POST' }), env, deps)).status, 401);
  // session exists but the DID is not allowlisted → same generic 401
  const sid = await blueskyUserSession(env, 'did:plc:notadmin');
  const res = await routeAdmin(req('/api/admin/elevate/bluesky', {
    method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${sid}` },
  }), env, deps);
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'authentication failed' });
  // a nostr-only user has no bluesky identity to elevate
  const user = await getOrCreateUserByIdentity(env.DB!, 'nostr', 'e'.repeat(64), null);
  const nostrSid = await createSession({ SESSIONS: env.SESSIONS!, DB: env.DB! }, user);
  assert.equal((await routeAdmin(req('/api/admin/elevate/bluesky', {
    method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${nostrSid}` },
  }), env, deps)).status, 401);
  // cross-site POST is rejected regardless of session state
  assert.equal((await routeAdmin(req('/api/admin/elevate/bluesky', {
    method: 'POST', headers: { 'sec-fetch-site': 'cross-site' },
  }), env, deps)).status, 403);
});

// ---- fail-closed configuration + deny-by-default routing ----

test('missing admin bindings fail closed with 503 on every auth route', async () => {
  for (const missing of [{ ADMIN_SESSIONS: undefined }, { ADMIN_COORD: undefined }] as Partial<AdminEnv>[]) {
    const env = fakeEnv(missing);
    for (const [path, method] of [
      ['/api/admin/login/nostr/challenge', 'POST'], ['/api/admin/login/nostr/verify', 'POST'],
      ['/api/admin/elevate/bluesky', 'POST'], ['/api/admin/whoami', 'GET'], ['/api/admin/logout', 'POST'],
    ] as const) {
      const res = await routeAdmin(req(path, { method }), env);
      assert.equal(res.status, 503, `${method} ${path} with missing binding`);
    }
  }
});

test('unknown admin paths and wrong methods stay deny-by-default 404', async () => {
  const env = fakeEnv();
  assert.equal((await routeAdmin(req('/api/admin/anything/else'), env)).status, 404);
  assert.equal((await routeAdmin(req('/api/admin/whoami', { method: 'POST' }), env)).status, 404);
  assert.equal((await routeAdmin(req('/api/admin/logout', { method: 'GET' }), env)).status, 404);
});

// ---- the coordinator itself ----

function bareCoordinator() {
  const map = new Map<string, unknown>();
  const state: DurableObjectState = {
    storage: {
      async get<T>(key: string) { return map.get(key) as T | undefined; },
      async put<T>(key: string, value: T) { map.set(key, value); },
      async delete(key: string) { return map.delete(key); },
    },
    async blockConcurrencyWhile<T>(fn: () => Promise<T>) { return fn(); },
  };
  return new AdminCoordinator(state, {});
}
const coordReq = (path: string, body: unknown) =>
  new Request(`https://admin-coord${path}`, { method: 'POST', body: JSON.stringify(body) });

test('AdminCoordinator: velocity gate caps logins per identity per hour', async () => {
  const coord = bareCoordinator();
  for (let i = 0; i < 12; i++) {
    const res = await coord.fetch(coordReq('/open', { sessionId: newAdminSessionId() }));
    assert.equal(res.status, 200, `login ${i + 1} within the cap`);
  }
  assert.equal((await coord.fetch(coordReq('/open', { sessionId: newAdminSessionId() }))).status, 429);
});

test('AdminCoordinator: csrf mint → check → close lifecycle; garbage fails closed', async () => {
  const coord = bareCoordinator();
  const sessionId = newAdminSessionId();
  const opened = await coord.fetch(coordReq('/open', { sessionId }));
  const { csrf } = (await opened.json()) as { csrf: string };
  assert.match(csrf, /^[0-9a-f]{64}$/);
  const check = async (token: string) =>
    ((await (await coord.fetch(coordReq('/check', { sessionId, token }))).json()) as { ok: boolean }).ok;
  assert.equal(await check(csrf), true);
  assert.equal(await check('f'.repeat(64)), false);
  assert.equal(await check(''), false);
  await coord.fetch(coordReq('/close', { sessionId }));
  assert.equal(await check(csrf), false); // token gone after close
  // malformed inputs
  assert.equal((await coord.fetch(coordReq('/open', { sessionId: 'short' }))).status, 400);
  assert.equal((await coord.fetch(new Request('https://admin-coord/open', { method: 'GET' }))).status, 404);
  assert.equal((await coord.fetch(coordReq('/nope', { sessionId }))).status, 404);
});

// ---- response invariants ----

test('admin auth responses carry the no-store/no-CORS invariant and cookie helper is __Host- Strict', async () => {
  const env = fakeEnv();
  const res = await routeAdmin(req('/api/admin/whoami'), env);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  const c = adminSessionCookie('abc');
  for (const attr of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) assert.ok(c.includes(attr), `missing ${attr}`);
});
