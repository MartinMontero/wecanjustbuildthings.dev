/**
 * Two-tier role model contract (P2B): file-rooted superadmins + runtime-managed
 * roster admins. Same harness discipline as the other admin tests — plain
 * in-memory fakes + node:test, real schnorr signatures, the REAL
 * AdminCoordinator behind a hand-fake namespace, and the compile-time deps seam
 * for non-empty file fixtures. Every INVARIANT of the P2B block is pinned here
 * by name:
 *   I1 — runtime can NEVER grant or revoke superadmin; file principals cannot
 *        be added to or removed from the roster (4xx, and no audit row).
 *   I2 — fails closed: empty file ⇒ every admin route rejects, management
 *        included; DB absent/unreachable ⇒ roster treated as EMPTY (superadmins
 *        work, roster admins don't) — management surfaces an explicit 5xx.
 *   I3 — every authenticated request (cookie path INCLUDED) re-derives the role
 *        from the current effective set; removal is effective next request.
 *   I4 — no self-registration; admin_audit is insert-only (no UPDATE/DELETE in
 *        code — pinned statically below).
 *   I5 — allowlist parsing/validation reused verbatim: ONE normalizer/validator
 *        (allowlist.ts), Cf-stripping included.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure';
import { npubEncode } from 'nostr-tools/nip19';
import { routeAdmin } from '../admin/router.ts';
import { AdminCoordinator } from '../admin/coordinator.ts';
import { normalizeSubject, isValidSubject, type AdminAllowlist } from '../admin/allowlist.ts';
import { resolveAdminRole } from '../admin/roles.ts';
import { removeRosterEntry } from '../admin/roster.ts';
import { ADMIN_SESSION_COOKIE, purgeAdminSessions, putAdminSession, newAdminSessionId } from '../admin/session.ts';
import { sha256Hex } from '../auth/nostr.ts';
import { SESSION_COOKIE, createSession } from '../auth/session.ts';
import { getOrCreateUserByIdentity } from '../auth/db.ts';
import type {
  KVNamespace, D1Database, D1PreparedStatement, D1Result,
  DurableObjectNamespace, DurableObjectState, RateLimit,
} from '../auth/cf.ts';
import type { AdminEnv } from '../admin/types.ts';

const ORIGIN = 'https://wecanjustbuildthings.dev';

// ---- fakes (same shapes as admin-auth.test.ts, plus roster/audit SQL) ----

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

interface RosterRow { provider: string; subject: string; added_by: string; added_at: number; note: string | null }
interface AuditRow {
  id: string; at: number; actor: string; action: string;
  provider: string; subject: string; method: string; note: string | null;
}

/** In-memory D1 covering BOTH the identity model (for Bluesky elevation) and
 *  the roster/audit tables of migrations/0002. `audit` is exposed so tests can
 *  assert exact rows. */
function fakeD1(): D1Database & { audit: AuditRow[]; roster: Map<string, RosterRow> } {
  const users = new Map<string, { id: string; created_at: number; display_name: string | null }>();
  const identities = new Map<string, { user_id: string }>(); // key: provider|subject
  const roster = new Map<string, RosterRow>();               // key: provider|subject
  const audit: AuditRow[] = [];
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
      return;
    }
    if (sql.includes('INTO admin_roster')) {
      const key = `${a[0]}|${a[1]}`;
      if (roster.has(key)) throw new Error('UNIQUE constraint failed: admin_roster');
      roster.set(key, {
        provider: a[0] as string, subject: a[1] as string,
        added_by: a[2] as string, added_at: a[3] as number, note: (a[4] ?? null) as string | null,
      });
      return;
    }
    if (sql.includes('DELETE FROM admin_roster')) { roster.delete(`${a[0]}|${a[1]}`); return; }
    if (sql.includes('INTO admin_audit')) {
      audit.push({
        id: a[0] as string, at: a[1] as number, actor: a[2] as string, action: a[3] as string,
        provider: a[4] as string, subject: a[5] as string, method: a[6] as string, note: (a[7] ?? null) as string | null,
      });
    }
  };
  const make = (sql: string): D1PreparedStatement => {
    let args: unknown[] = [];
    const stmt: D1PreparedStatement = {
      bind(...a) { args = a; return stmt; },
      async first<T>() {
        if (sql.includes('FROM admin_roster WHERE provider')) {
          return ((roster.get(`${args[0]}|${args[1]}`) ?? null) as T | null);
        }
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
      async all<T>(): Promise<D1Result<T>> {
        if (sql.includes('FROM admin_roster')) {
          const results = [...roster.values()].sort((x, y) => x.added_at - y.added_at) as T[];
          return { results, success: true };
        }
        return { results: [], success: true };
      },
    };
    return stmt;
  };
  return { prepare: make, async batch(stmts) { for (const s of stmts) await s.run(); return []; }, audit, roster };
}

/** Every call fails — the "D1 unreachable" fixture. */
function throwingD1(): D1Database {
  const stmt: D1PreparedStatement = {
    bind() { return stmt; },
    async first() { throw new Error('D1 unreachable'); },
    async run(): Promise<D1Result> { throw new Error('D1 unreachable'); },
    async all(): Promise<D1Result<never>> { throw new Error('D1 unreachable'); },
  };
  return { prepare: () => stmt, async batch() { throw new Error('D1 unreachable'); } };
}

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

type Env = AdminEnv & { ADMIN_SESSIONS: KVNamespace; DB: ReturnType<typeof fakeD1> };
function fakeEnv(overrides: Partial<AdminEnv> = {}): Env {
  return {
    ADMIN_SESSIONS: fakeKV(),
    ADMIN_COORD: fakeCoordNamespace(),
    SESSIONS: fakeKV(),
    DB: fakeD1(),
    SITE_URL: ORIGIN,
    AUTH_RATE_LIMITER: allowAllLimiter,
    ...overrides,
  } as Env;
}

const req = (path: string, init?: RequestInit) => new Request(`${ORIGIN}${path}`, init);
const nowS = () => Math.floor(Date.now() / 1000);
const EMPTY: AdminAllowlist = { nostr: [], bluesky: [] };

function tokenFor(
  sk: Uint8Array,
  o: { kind?: number; url: string; method?: string; payload?: string; createdAt?: number },
): string {
  const tags: string[][] = [['u', o.url], ['method', o.method ?? 'POST']];
  if (o.payload !== undefined) tags.push(['payload', o.payload]);
  const event = finalizeEvent({ kind: o.kind ?? 27235, created_at: o.createdAt ?? nowS(), content: '', tags }, sk);
  return 'Nostr ' + Buffer.from(JSON.stringify(event), 'utf8').toString('base64');
}

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

/** A logged-in principal ready to call routes on both auth paths. */
interface Session { id: string; csrf: string; sk: Uint8Array; pk: string }
async function loginAs(env: AdminEnv, sk: Uint8Array, deps: Parameters<typeof routeAdmin>[2]): Promise<Session> {
  const res = await nostrLogin(env, sk, deps);
  assert.equal(res.status, 200);
  const { csrf } = (await res.json()) as { csrf: string };
  return { id: sessionIdOf(res), csrf, sk, pk: getPublicKey(sk) };
}

/** Cookie-path mutation call (same-site, CSRF header riding along). */
const mutate = (path: string, s: Session, body: unknown, env: AdminEnv, deps: Parameters<typeof routeAdmin>[2]) =>
  routeAdmin(withAdminCookie(path, s.id, {
    method: 'POST', body: JSON.stringify(body), headers: { 'x-admin-csrf': s.csrf },
  }), env, deps);

/** File fixture: one superadmin + one file-resident 'admin' (Ruling 1). */
function fileFixture(superPk: string, fileAdminPk: string): { allowlist: AdminAllowlist } {
  return {
    allowlist: {
      nostr: [
        { pubkey: superPk, role: 'superadmin' },
        { pubkey: fileAdminPk, role: 'admin' },
      ],
      bluesky: [{ did: 'did:plc:filesuper1', role: 'superadmin' }],
    },
  };
}

// ---- I5: the ONE shared normalizer/validator ----

test('I5 normalizeSubject strips ALL Cf format chars (U+202A bidi included), Unicode-trims, lowercases hex', () => {
  const pk = 'A'.repeat(64);
  assert.equal(normalizeSubject('nostr', `‪${pk}‬`), 'a'.repeat(64)); // bidi override wrap
  assert.equal(normalizeSubject('nostr', `​ ${pk}⁠ `), 'a'.repeat(64)); // zero-width + word joiner
  assert.equal(normalizeSubject('nostr', ` ${pk}　`), 'a'.repeat(64)); // Unicode whitespace trim
  assert.equal(normalizeSubject('bluesky', ' ‪did:plc:MiXeD‬ '), 'did:plc:MiXeD'); // DIDs exact after strip
});

test('I5 isValidSubject enforces the SAME rules as the file matchers (hex64 / did:plc|web)', () => {
  assert.equal(isValidSubject('nostr', 'f'.repeat(64)), true);
  assert.equal(isValidSubject('nostr', 'F'.repeat(64)), false); // validate AFTER normalize — uppercase is not normalized input
  assert.equal(isValidSubject('nostr', 'f'.repeat(63)), false);
  assert.equal(isValidSubject('nostr', `npub1${'q'.repeat(58)}`), false); // npub is input sugar, never a stored subject
  assert.equal(isValidSubject('bluesky', 'did:plc:ok123'), true);
  assert.equal(isValidSubject('bluesky', 'did:key:z6Mk'), false);
  assert.equal(isValidSubject('bluesky', 'alice.bsky.social'), false); // handles are mutable pointers, never subjects
});

// ---- I1: runtime can NEVER grant or revoke superadmin ----

test('I1 file principals cannot be ADDED to the roster (409) and nothing lands in the audit', async () => {
  const env = fakeEnv();
  const superSk = generateSecretKey();
  const fileAdminSk = generateSecretKey();
  const deps = fileFixture(getPublicKey(superSk), getPublicKey(fileAdminSk));
  const s = await loginAs(env, superSk, deps);
  for (const subject of [getPublicKey(superSk), getPublicKey(fileAdminSk)]) {
    const res = await mutate('/api/admin/admins/add', s, { provider: 'nostr', subject }, env, deps);
    assert.equal(res.status, 409, 'file-resident add must conflict');
  }
  const resDid = await mutate('/api/admin/admins/add', s, { provider: 'bluesky', subject: 'did:plc:filesuper1' }, env, deps);
  assert.equal(resDid.status, 409);
  assert.equal(env.DB.audit.length, 0, 'refused mutations must not be audited as roster changes');
  assert.equal(env.DB.roster.size, 0);
});

test('I1 file principals cannot be REMOVED at runtime (403, no audit) — superadmin and file admin alike', async () => {
  const env = fakeEnv();
  const superSk = generateSecretKey();
  const fileAdminSk = generateSecretKey();
  const deps = fileFixture(getPublicKey(superSk), getPublicKey(fileAdminSk));
  const s = await loginAs(env, superSk, deps);
  for (const [provider, subject] of [
    ['nostr', getPublicKey(superSk)], ['nostr', getPublicKey(fileAdminSk)], ['bluesky', 'did:plc:filesuper1'],
  ] as const) {
    const res = await mutate('/api/admin/admins/remove', s, { provider, subject }, env, deps);
    assert.equal(res.status, 403, `${provider} file principal must be immutable`);
  }
  assert.equal(env.DB.audit.length, 0);
});

test('I1 the roster can only ever yield role admin — a roster add never grants superadmin', async () => {
  const env = fakeEnv();
  const superSk = generateSecretKey();
  const deps = fileFixture(getPublicKey(superSk), 'e'.repeat(64));
  const s = await loginAs(env, superSk, deps);
  const newPk = getPublicKey(generateSecretKey());
  assert.equal((await mutate('/api/admin/admins/add', s, { provider: 'nostr', subject: newPk }, env, deps)).status, 200);
  assert.equal(await resolveAdminRole('nostr', newPk, env, deps), 'admin');
  // …and the file always wins: the file superadmin resolves from the file even
  // with a roster present.
  assert.equal(await resolveAdminRole('nostr', getPublicKey(superSk), env, deps), 'superadmin');
});

test('I1 (Ruling 1) a FILE admin holds no roster-mutation rights: management routes reject it like any non-superadmin', async () => {
  const env = fakeEnv();
  const superSk = generateSecretKey();
  const fileAdminSk = generateSecretKey();
  const deps = fileFixture(getPublicKey(superSk), getPublicKey(fileAdminSk));
  const s = await loginAs(env, fileAdminSk, deps); // file admin CAN log in…
  assert.equal((await routeAdmin(withAdminCookie('/api/admin/whoami', s.id), env, deps)).status, 200);
  // …but sees the same generic 401 on every management route (no role oracle).
  const list = await routeAdmin(withAdminCookie('/api/admin/admins', s.id), env, deps);
  assert.equal(list.status, 401);
  assert.deepEqual(await list.json(), { error: 'authentication failed' });
  assert.equal((await mutate('/api/admin/admins/add', s, { provider: 'nostr', subject: 'a'.repeat(64) }, env, deps)).status, 401);
  assert.equal((await mutate('/api/admin/admins/remove', s, { provider: 'nostr', subject: 'a'.repeat(64) }, env, deps)).status, 401);
});

// ---- I2: fails closed ----

test('I2 EMPTY file ⇒ management endpoints reject even a valid signature: no superadmin, no roster mutations, ever', async () => {
  const env = fakeEnv();
  const sk = generateSecretKey();
  const deps = { allowlist: EMPTY };
  // Login is impossible (allowlist reject)…
  assert.equal((await nostrLogin(env, sk, deps)).status, 401);
  // …and so is per-request NIP-98 management with a perfectly valid signature.
  const url = `${ORIGIN}/api/admin/admins`;
  const res = await routeAdmin(req('/api/admin/admins', {
    headers: { authorization: tokenFor(sk, { url, method: 'GET' }) },
  }), env, deps);
  assert.equal(res.status, 401);
  const body = JSON.stringify({ provider: 'nostr', subject: 'a'.repeat(64) });
  const add = await routeAdmin(req('/api/admin/admins/add', {
    method: 'POST', body,
    headers: { authorization: tokenFor(sk, { url: `${ORIGIN}/api/admin/admins/add`, payload: await sha256Hex(body) }) },
  }), env, deps);
  assert.equal(add.status, 401);
  assert.equal(env.DB.roster.size, 0);
});

test('I2 DB binding ABSENT: file superadmin logs in and works; roster admin is denied; management is an explicit 503', async () => {
  const superSk = generateSecretKey();
  const rosterSk = generateSecretKey();
  const deps = fileFixture(getPublicKey(superSk), 'e'.repeat(64));
  // Seed a roster admin while the DB is up, and keep their live session.
  const envUp = fakeEnv();
  const superSession = await loginAs(envUp, superSk, deps);
  assert.equal((await mutate('/api/admin/admins/add', superSession, { provider: 'nostr', subject: getPublicKey(rosterSk) }, envUp, deps)).status, 200);
  const rosterSession = await loginAs(envUp, rosterSk, deps);

  // Same stores, DB gone.
  const envDown = { ...envUp, DB: undefined } as AdminEnv;
  assert.equal((await routeAdmin(withAdminCookie('/api/admin/whoami', superSession.id), envDown, deps)).status, 200, 'file superadmin unaffected');
  assert.equal((await routeAdmin(withAdminCookie('/api/admin/whoami', rosterSession.id), envDown, deps)).status, 401, 'roster admin fails closed');
  assert.equal((await nostrLogin(envDown, rosterSk, deps)).status, 401, 'roster login fails closed');
  assert.equal((await routeAdmin(withAdminCookie('/api/admin/admins', superSession.id), envDown, deps)).status, 503, 'management surfaces missing DB');
});

test('I2 DB UNREACHABLE (throws): roster treated as empty on auth; management list is an explicit 503, never file-only', async () => {
  const superSk = generateSecretKey();
  const rosterSk = generateSecretKey();
  const deps = fileFixture(getPublicKey(superSk), 'e'.repeat(64));
  const envUp = fakeEnv();
  const superSession = await loginAs(envUp, superSk, deps);
  assert.equal((await mutate('/api/admin/admins/add', superSession, { provider: 'nostr', subject: getPublicKey(rosterSk) }, envUp, deps)).status, 200);
  const rosterSession = await loginAs(envUp, rosterSk, deps);

  const envDown = { ...envUp, DB: throwingD1() } as AdminEnv;
  assert.equal((await routeAdmin(withAdminCookie('/api/admin/whoami', superSession.id), envDown, deps)).status, 200);
  assert.equal((await routeAdmin(withAdminCookie('/api/admin/whoami', rosterSession.id), envDown, deps)).status, 401);
  const list = await routeAdmin(withAdminCookie('/api/admin/admins', superSession.id), envDown, deps);
  assert.equal(list.status, 503, 'a file-only list must never be served as complete');
  assert.deepEqual(await list.json(), { error: 'roster unavailable' });
  // Mutations against an unreachable roster are 5xx too — never silently dropped.
  const add = await mutate('/api/admin/admins/add', superSession, { provider: 'nostr', subject: 'b'.repeat(64) }, envDown, deps);
  assert.equal(add.status, 503);
});

// ---- I3: per-request re-derivation, cookie path included ----

test('I3 a roster admin can log in and use whoami; REMOVAL (data layer, no purge) kills the live cookie session on its next request', async () => {
  const env = fakeEnv();
  const superSk = generateSecretKey();
  const rosterSk = generateSecretKey();
  const deps = fileFixture(getPublicKey(superSk), 'e'.repeat(64));
  const superSession = await loginAs(env, superSk, deps);
  const rosterPk = getPublicKey(rosterSk);
  assert.equal((await mutate('/api/admin/admins/add', superSession, { provider: 'nostr', subject: rosterPk }, env, deps)).status, 200);

  const rosterSession = await loginAs(env, rosterSk, deps);
  assert.equal((await routeAdmin(withAdminCookie('/api/admin/whoami', rosterSession.id), env, deps)).status, 200);

  // Remove straight at the data layer — deliberately bypassing the route and its
  // best-effort purge — so what this proves is the PER-REQUEST role re-check.
  await removeRosterEntry(env.DB, { provider: 'nostr', subject: rosterPk, actor: 'test', method: 'nip98', now: Date.now() });
  assert.equal((await routeAdmin(withAdminCookie('/api/admin/whoami', rosterSession.id), env, deps)).status, 401);
  // …and the session was destroyed, not merely rejected.
  assert.equal(await env.ADMIN_SESSIONS.get(`adm:${rosterSession.id}`), null);
});

test('I3 removal via the ROUTE additionally purges the removed admin\'s live sessions from KV (best-effort hygiene)', async () => {
  const env = fakeEnv();
  const superSk = generateSecretKey();
  const rosterSk = generateSecretKey();
  const deps = fileFixture(getPublicKey(superSk), 'e'.repeat(64));
  const superSession = await loginAs(env, superSk, deps);
  const rosterPk = getPublicKey(rosterSk);
  assert.equal((await mutate('/api/admin/admins/add', superSession, { provider: 'nostr', subject: rosterPk }, env, deps)).status, 200);
  const rosterSession = await loginAs(env, rosterSk, deps);
  assert.ok(await env.ADMIN_SESSIONS.get(`adm:${rosterSession.id}`), 'live before removal');

  assert.equal((await mutate('/api/admin/admins/remove', superSession, { provider: 'nostr', subject: rosterPk }, env, deps)).status, 200);
  // The record is gone from KV immediately — no next-request round-trip needed…
  assert.equal(await env.ADMIN_SESSIONS.get(`adm:${rosterSession.id}`), null);
  // …and the superadmin's own session survived the purge untouched.
  assert.equal((await routeAdmin(withAdminCookie('/api/admin/whoami', superSession.id), env, deps)).status, 200);
});

test('I3 purge is BEST-EFFORT: a KV that cannot list() never fails the removal (the guard stays authoritative)', async () => {
  const kv = fakeKV();
  const id = newAdminSessionId();
  await putAdminSession(kv, id, 'f'.repeat(64), 'nostr');
  const broken: KVNamespace = { ...kv, async list() { throw new Error('KV list unavailable'); } };
  await purgeAdminSessions(broken, 'nostr', 'f'.repeat(64)); // must not throw
  assert.ok(await kv.get(`adm:${id}`), 'record intact — next-request re-check owns revocation');
  // …and a working purge only deletes the matching principal.
  const other = newAdminSessionId();
  await putAdminSession(kv, other, 'a'.repeat(64), 'nostr');
  await purgeAdminSessions(kv, 'nostr', 'f'.repeat(64));
  assert.equal(await kv.get(`adm:${id}`), null);
  assert.ok(await kv.get(`adm:${other}`));
});

test('I3 LOGOUT destroy-on-null: a de-listed principal\'s logout destroys the record and 401s — never leaves it alive', async () => {
  const env = fakeEnv();
  const superSk = generateSecretKey();
  const rosterSk = generateSecretKey();
  const deps = fileFixture(getPublicKey(superSk), 'e'.repeat(64));
  const superSession = await loginAs(env, superSk, deps);
  const rosterPk = getPublicKey(rosterSk);
  assert.equal((await mutate('/api/admin/admins/add', superSession, { provider: 'nostr', subject: rosterPk }, env, deps)).status, 200);
  const rosterSession = await loginAs(env, rosterSk, deps);
  await removeRosterEntry(env.DB, { provider: 'nostr', subject: rosterPk, actor: 'test', method: 'nip98', now: Date.now() });

  // No CSRF header at all: membership fails first, the record must still die.
  const out = await routeAdmin(withAdminCookie('/api/admin/logout', rosterSession.id, { method: 'POST' }), env, deps);
  assert.equal(out.status, 401);
  assert.equal(await env.ADMIN_SESSIONS.get(`adm:${rosterSession.id}`), null, 'destroyed, not merely rejected');
});

// ---- role rides the auth responses (drives console panel routing) ----

test('login + whoami report role: file superadmin ⇒ superadmin, roster member ⇒ admin', async () => {
  const env = fakeEnv();
  const superSk = generateSecretKey();
  const deps = fileFixture(getPublicKey(superSk), 'e'.repeat(64));

  const login = await nostrLogin(env, superSk, deps);
  assert.equal(((await login.clone().json()) as { role: string }).role, 'superadmin');
  const superId = sessionIdOf(login);
  const who = await routeAdmin(withAdminCookie('/api/admin/whoami', superId), env, deps);
  assert.equal(((await who.json()) as { role: string }).role, 'superadmin');

  // Seed a roster admin and confirm THEIR responses carry role admin, not superadmin.
  const { csrf } = (await login.json()) as { csrf: string };
  const rosterSk = generateSecretKey();
  const rosterPk = getPublicKey(rosterSk);
  await mutate('/api/admin/admins/add', { id: superId, csrf, sk: superSk, pk: getPublicKey(superSk) }, { provider: 'nostr', subject: rosterPk }, env, deps);
  const rosterLogin = await nostrLogin(env, rosterSk, deps);
  assert.equal(((await rosterLogin.json()) as { role: string }).role, 'admin');
});

// ---- management API surface ----

test('list returns file principals marked immutable ∪ roster entries with provenance', async () => {
  const env = fakeEnv();
  const superSk = generateSecretKey();
  const fileAdminSk = generateSecretKey();
  const deps = fileFixture(getPublicKey(superSk), getPublicKey(fileAdminSk));
  const s = await loginAs(env, superSk, deps);
  const rosterPk = getPublicKey(generateSecretKey());
  assert.equal((await mutate('/api/admin/admins/add', s, { provider: 'nostr', subject: rosterPk, note: 'Ops teammate' }, env, deps)).status, 200);

  const res = await routeAdmin(withAdminCookie('/api/admin/admins', s.id), env, deps);
  assert.equal(res.status, 200);
  const { admins } = (await res.json()) as { admins: Record<string, unknown>[] };
  const file = admins.filter((a) => a.source === 'file');
  const roster = admins.filter((a) => a.source === 'roster');
  assert.equal(file.length, 3); // two nostr file entries + one bluesky
  assert.ok(file.every((a) => a.immutable === true));
  assert.equal(file.filter((a) => a.role === 'superadmin').length, 2);
  assert.equal(file.filter((a) => a.role === 'admin').length, 1); // Ruling 1: recorded role honored
  assert.equal(roster.length, 1);
  assert.deepEqual(
    { provider: roster[0].provider, subject: roster[0].subject, role: roster[0].role, note: roster[0].note, added_by: roster[0].added_by },
    { provider: 'nostr', subject: rosterPk, role: 'admin', note: 'Ops teammate', added_by: `nostr:${s.pk}` },
  );
  assert.equal(typeof roster[0].added_at, 'number');
});

test('audit rows are EXACT: add + remove, actor provider:subject, method recorded per auth path', async () => {
  const env = fakeEnv();
  const superSk = generateSecretKey();
  const deps = fileFixture(getPublicKey(superSk), 'e'.repeat(64));
  const s = await loginAs(env, superSk, deps);
  const target = getPublicKey(generateSecretKey());
  assert.equal((await mutate('/api/admin/admins/add', s, { provider: 'nostr', subject: target, note: 'Temp' }, env, deps)).status, 200);
  assert.equal((await mutate('/api/admin/admins/remove', s, { provider: 'nostr', subject: target }, env, deps)).status, 200);

  assert.equal(env.DB.audit.length, 2);
  const [add, remove] = env.DB.audit;
  assert.deepEqual(
    { action: add.action, actor: add.actor, provider: add.provider, subject: add.subject, method: add.method, note: add.note },
    { action: 'admin.add', actor: `nostr:${s.pk}`, provider: 'nostr', subject: target, method: 'cookie', note: 'Temp' },
  );
  assert.deepEqual(
    { action: remove.action, actor: remove.actor, provider: remove.provider, subject: remove.subject, method: remove.method, note: remove.note },
    { action: 'admin.remove', actor: `nostr:${s.pk}`, provider: 'nostr', subject: target, method: 'cookie', note: null },
  ); // the nip98 method value is pinned by the NIP-98 management test below
  assert.ok(add.id && remove.id && add.id !== remove.id);
  assert.equal(typeof add.at, 'number');
});

test('duplicate add → 409; remove of a non-member → 404 (Ruling 4)', async () => {
  const env = fakeEnv();
  const superSk = generateSecretKey();
  const deps = fileFixture(getPublicKey(superSk), 'e'.repeat(64));
  const s = await loginAs(env, superSk, deps);
  const target = getPublicKey(generateSecretKey());
  assert.equal((await mutate('/api/admin/admins/add', s, { provider: 'nostr', subject: target }, env, deps)).status, 200);
  assert.equal((await mutate('/api/admin/admins/add', s, { provider: 'nostr', subject: target }, env, deps)).status, 409);
  assert.equal((await mutate('/api/admin/admins/remove', s, { provider: 'nostr', subject: 'c'.repeat(64) }, env, deps)).status, 404);
  assert.equal(env.DB.audit.length, 1, 'only the successful add is audited');
});

test('npub input is accepted (Ruling 2, in-tree nip19) and the success response echoes HEX', async () => {
  const env = fakeEnv();
  const superSk = generateSecretKey();
  const deps = fileFixture(getPublicKey(superSk), 'e'.repeat(64));
  const s = await loginAs(env, superSk, deps);
  const targetPk = getPublicKey(generateSecretKey());
  const res = await mutate('/api/admin/admins/add', s, { provider: 'nostr', subject: ` ‪${npubEncode(targetPk)}‬ ` }, env, deps);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { subject: string };
  assert.equal(body.subject, targetPk); // hex echoed, invisibles stripped
  assert.ok(env.DB.roster.has(`nostr|${targetPk}`), 'stored as hex, never bech32');
});

test('validation errors surface only AFTER superadmin auth (no pre-auth format oracle); garbage is 400 post-auth', async () => {
  const env = fakeEnv();
  const superSk = generateSecretKey();
  const deps = fileFixture(getPublicKey(superSk), 'e'.repeat(64));
  // Unauthenticated malformed body: generic 401, never a validation message.
  const anon = await routeAdmin(req('/api/admin/admins/add', { method: 'POST', body: 'not json{' }), env, deps);
  assert.equal(anon.status, 401);
  assert.deepEqual(await anon.json(), { error: 'authentication failed' });
  // Authenticated superadmin: malformed body / bad provider / bad subject → 400.
  const s = await loginAs(env, superSk, deps);
  assert.equal((await routeAdmin(withAdminCookie('/api/admin/admins/add', s.id, {
    method: 'POST', body: 'not json{', headers: { 'x-admin-csrf': s.csrf },
  }), env, deps)).status, 400);
  assert.equal((await mutate('/api/admin/admins/add', s, { provider: 'github', subject: 'x' }, env, deps)).status, 400);
  assert.equal((await mutate('/api/admin/admins/add', s, { provider: 'nostr', subject: 'not-hex' }, env, deps)).status, 400);
  assert.equal((await mutate('/api/admin/admins/add', s, { provider: 'bluesky', subject: 'alice.bsky.social' }, env, deps)).status, 400);
});

test('cookie mutations demand the coordinator CSRF token and a same-site request', async () => {
  const env = fakeEnv();
  const superSk = generateSecretKey();
  const deps = fileFixture(getPublicKey(superSk), 'e'.repeat(64));
  const s = await loginAs(env, superSk, deps);
  const body = JSON.stringify({ provider: 'nostr', subject: 'a'.repeat(64) });
  // cross-site → 403 before anything else
  assert.equal((await routeAdmin(withAdminCookie('/api/admin/admins/add', s.id, {
    method: 'POST', body, headers: { 'sec-fetch-site': 'cross-site', 'x-admin-csrf': s.csrf },
  }), env, deps)).status, 403);
  // missing / wrong token → 403, nothing written
  assert.equal((await routeAdmin(withAdminCookie('/api/admin/admins/add', s.id, { method: 'POST', body }), env, deps)).status, 403);
  assert.equal((await routeAdmin(withAdminCookie('/api/admin/admins/add', s.id, {
    method: 'POST', body, headers: { 'x-admin-csrf': 'f'.repeat(64) },
  }), env, deps)).status, 403);
  assert.equal(env.DB.roster.size, 0);
});

test('per-request NIP-98 management: payload-tag bound to the exact body, single-use event id (burned)', async () => {
  const env = fakeEnv();
  const superSk = generateSecretKey();
  const deps = fileFixture(getPublicKey(superSk), 'e'.repeat(64));
  const target = getPublicKey(generateSecretKey());
  const body = JSON.stringify({ provider: 'nostr', subject: target });
  const url = `${ORIGIN}/api/admin/admins/add`;
  const token = tokenFor(superSk, { url, payload: await sha256Hex(body) });
  // A TAMPERED body under the same signature dies on the payload tag…
  const tampered = JSON.stringify({ provider: 'nostr', subject: 'd'.repeat(64) });
  assert.equal((await routeAdmin(req('/api/admin/admins/add', {
    method: 'POST', body: tampered, headers: { authorization: token },
  }), env, deps)).status, 401);
  // …the honest body succeeds and audits method nip98…
  const ok = await routeAdmin(req('/api/admin/admins/add', {
    method: 'POST', body, headers: { authorization: token },
  }), env, deps);
  assert.equal(ok.status, 200);
  assert.equal(env.DB.audit[0].method, 'nip98');
  assert.equal(env.DB.audit[0].actor, `nostr:${getPublicKey(superSk)}`);
  // …and an exact replay of the same event id is burned (409 dup would leak
  // state through a replayed credential — it must die at auth, as 401).
  assert.equal((await routeAdmin(req('/api/admin/admins/add', {
    method: 'POST', body, headers: { authorization: token },
  }), env, deps)).status, 401);
  // GET list via NIP-98: works once, replay dies.
  const listToken = tokenFor(superSk, { url: `${ORIGIN}/api/admin/admins`, method: 'GET' });
  const call = () => routeAdmin(req('/api/admin/admins', { headers: { authorization: listToken } }), env, deps);
  assert.equal((await call()).status, 200);
  assert.equal((await call()).status, 401);
});

test('a Bluesky file superadmin manages via cookie+CSRF (elevate path); roster Bluesky admins resolve via elevate too', async () => {
  const env = fakeEnv();
  const deps = fileFixture('f'.repeat(64), 'e'.repeat(64)); // bluesky superadmin: did:plc:filesuper1
  const user = await getOrCreateUserByIdentity(env.DB, 'bluesky', 'did:plc:filesuper1', 'Owner');
  const sid = await createSession({ SESSIONS: env.SESSIONS!, DB: env.DB }, user);
  const elevated = await routeAdmin(req('/api/admin/elevate/bluesky', {
    method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${sid}` },
  }), env, deps);
  assert.equal(elevated.status, 200);
  const { csrf } = (await elevated.json()) as { csrf: string };
  const adminId = sessionIdOf(elevated);
  const res = await routeAdmin(withAdminCookie('/api/admin/admins/add', adminId, {
    method: 'POST', body: JSON.stringify({ provider: 'bluesky', subject: 'did:plc:teammate9' }),
    headers: { 'x-admin-csrf': csrf },
  }), env, deps);
  assert.equal(res.status, 200);
  assert.equal(env.DB.audit[0].actor, 'bluesky:did:plc:filesuper1');
  // The roster DID elevates like any admin: proven user session + roster membership.
  const tUser = await getOrCreateUserByIdentity(env.DB, 'bluesky', 'did:plc:teammate9', null);
  const tSid = await createSession({ SESSIONS: env.SESSIONS!, DB: env.DB }, tUser);
  const tElevated = await routeAdmin(req('/api/admin/elevate/bluesky', {
    method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${tSid}` },
  }), env, deps);
  assert.equal(tElevated.status, 200);
  // …and, as a plain admin, is refused management (same generic 401).
  assert.equal((await routeAdmin(withAdminCookie('/api/admin/admins', sessionIdOf(tElevated)), env, deps)).status, 401);
});

test('admin-manage bucket: all three management routes 429 when the limiter trips', async () => {
  const env = fakeEnv({ AUTH_RATE_LIMITER: denyAllLimiter });
  for (const [path, method] of [
    ['/api/admin/admins', 'GET'], ['/api/admin/admins/add', 'POST'], ['/api/admin/admins/remove', 'POST'],
  ] as const) {
    assert.equal((await routeAdmin(req(path, { method }), env)).status, 429, `${method} ${path}`);
  }
});

test('deny-by-default holds around the new surface: wrong verbs and near-miss paths are 404', async () => {
  const env = fakeEnv();
  assert.equal((await routeAdmin(req('/api/admin/admins', { method: 'POST' }), env)).status, 404);
  assert.equal((await routeAdmin(req('/api/admin/admins', { method: 'DELETE' }), env)).status, 404);
  assert.equal((await routeAdmin(req('/api/admin/admins/add', { method: 'GET' }), env)).status, 404);
  assert.equal((await routeAdmin(req('/api/admin/admins/remove', { method: 'GET' }), env)).status, 404);
  assert.equal((await routeAdmin(req('/api/admin/admins/anything'), env)).status, 404);
});

// ---- I4: insert-only audit, pinned statically ----

test('I4 admin_audit is INSERT-only in code: no UPDATE or DELETE against it exists anywhere in the worker', () => {
  for (const rel of ['../admin/roster.ts', '../admin/router.ts', '../admin/roles.ts', '../admin/session.ts']) {
    const source = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
    assert.doesNotMatch(source, /UPDATE\s+admin_audit/i, `${rel} must never UPDATE admin_audit`);
    assert.doesNotMatch(source, /DELETE\s+FROM\s+admin_audit/i, `${rel} must never DELETE from admin_audit`);
  }
  const roster = readFileSync(fileURLToPath(new URL('../admin/roster.ts', import.meta.url)), 'utf8');
  assert.match(roster, /INSERT INTO admin_audit/, 'the audit is written by INSERT alone');
});
