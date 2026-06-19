import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authJson, authError } from '../auth/respond.ts';
import {
  newSessionId, sessionCookie, clearSessionCookie, readCookie,
  createSession, destroySession, resolveSession, SESSION_COOKIE, type AuthEnv,
} from '../auth/session.ts';
import { getOrCreateUserByIdentity, getUserById } from '../auth/db.ts';
import type { KVNamespace, D1Database, D1PreparedStatement, D1Result } from '../auth/cf.ts';

// ---- in-memory fakes (only what the code calls) ----
function fakeKV(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(k) { return store.has(k) ? store.get(k)! : null; },
    async put(k, v) { store.set(k, v); },
    async delete(k) { store.delete(k); },
  };
}

interface UserRow { id: string; created_at: number; display_name: string | null }
function fakeD1(): D1Database {
  const users = new Map<string, UserRow>();
  const identities = new Map<string, { user_id: string }>(); // key: provider|subject
  const apply = (sql: string, a: unknown[]) => {
    if (sql.includes('INSERT INTO users')) users.set(a[0] as string, { id: a[0] as string, created_at: a[1] as number, display_name: (a[2] ?? null) as string | null });
    else if (sql.includes('INTO identities')) identities.set(`${a[0]}|${a[1]}`, { user_id: a[2] as string });
  };
  const make = (sql: string): D1PreparedStatement => {
    let args: unknown[] = [];
    const stmt: D1PreparedStatement = {
      bind(...a) { args = a; return stmt; },
      async first<T>() {
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

const envOf = (): AuthEnv => ({ SESSIONS: fakeKV(), DB: fakeD1() });
const withCookie = (id: string) => new Request('https://wecanjustbuildthings.dev/api/auth/session', { headers: { cookie: `${SESSION_COOKIE}=${id}` } });

test('authJson sets NO access-control-allow-origin and hardening headers', () => {
  const res = authJson({ ok: true });
  assert.equal(res.headers.get('access-control-allow-origin'), null); // never readable cross-origin
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
});

test('authError is a generic 401 that does not leak which check failed', () => {
  const res = authError();
  assert.equal(res.status, 401);
});

test('newSessionId is a unique 256-bit (64 hex) CSPRNG token', () => {
  const a = newSessionId(), b = newSessionId();
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, b);
});

test('sessionCookie is a __Host- HttpOnly/Secure/Lax cookie; clear expires it', () => {
  const c = sessionCookie('abc', 100);
  assert.ok(c.startsWith('__Host-wcjbt_session=abc'));
  for (const attr of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=100']) assert.ok(c.includes(attr), `missing ${attr}`);
  assert.ok(!/Domain=/i.test(c)); // __Host- forbids Domain
  assert.ok(clearSessionCookie().includes('Max-Age=0'));
});

test('readCookie extracts the named cookie value', () => {
  const req = new Request('https://x/', { headers: { cookie: 'a=1; __Host-wcjbt_session=tok; b=2' } });
  assert.equal(readCookie(req, SESSION_COOKIE), 'tok');
  assert.equal(readCookie(req, 'missing'), undefined);
});

test('createSession → resolveSession round-trips to the live user', async () => {
  const env = envOf();
  const user = await getOrCreateUserByIdentity(env.DB, 'nostr', 'pubkeyA', 'Alice');
  const id = await createSession(env, user.id);
  const resolved = await resolveSession(withCookie(id), env);
  assert.ok(resolved);
  assert.equal(resolved!.user.id, user.id);
  assert.equal(resolved!.user.displayName, 'Alice');
});

test('resolveSession returns null for no cookie, unknown id, and dangling user', async () => {
  const env = envOf();
  assert.equal(await resolveSession(new Request('https://x/'), env), null); // no cookie
  assert.equal(await resolveSession(withCookie('deadbeef'), env), null);    // unknown session
  // session pointing at a user that doesn't exist in D1
  await env.SESSIONS.put('sess:orphan', JSON.stringify({ userId: 'ghost', createdAt: Date.now() }));
  assert.equal(await resolveSession(withCookie('orphan'), env), null);
});

test('resolveSession rejects a tampered/corrupt session record (malformed JSON or no userId)', async () => {
  const env = envOf();
  await env.SESSIONS.put('sess:garbage', 'not json{');                        // unparseable
  assert.equal(await resolveSession(withCookie('garbage'), env), null);
  await env.SESSIONS.put('sess:nouser', JSON.stringify({ createdAt: 1 }));    // valid JSON, no userId
  assert.equal(await resolveSession(withCookie('nouser'), env), null);
});

test('destroySession invalidates the session', async () => {
  const env = envOf();
  const user = await getOrCreateUserByIdentity(env.DB, 'nostr', 'pubkeyB', null);
  const id = await createSession(env, user.id);
  assert.ok(await resolveSession(withCookie(id), env));
  await destroySession(env, id);
  assert.equal(await resolveSession(withCookie(id), env), null);
});

test('getOrCreateUserByIdentity is idempotent per (provider, subject) and isolates identities', async () => {
  const env = envOf();
  const first = await getOrCreateUserByIdentity(env.DB, 'nostr', 'samePubkey', 'Name');
  const again = await getOrCreateUserByIdentity(env.DB, 'nostr', 'samePubkey', 'Ignored');
  assert.equal(again.id, first.id); // same identity → same user, no duplicate
  const other = await getOrCreateUserByIdentity(env.DB, 'bluesky', 'did:plc:xyz', null);
  assert.notEqual(other.id, first.id); // different identity → different user (v1: no auto-link)
  assert.equal((await getUserById(env.DB, first.id))!.id, first.id);
});
