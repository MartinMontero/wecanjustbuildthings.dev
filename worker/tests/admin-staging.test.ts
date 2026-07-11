/**
 * Phase-3 staged-edits contract (/api/admin/staging*). Same harness discipline
 * as the other admin tests — plain in-memory fakes + node:test, real schnorr
 * signatures, the REAL AdminCoordinator behind a hand-fake namespace, and the
 * compile-time deps seam for non-empty file fixtures. Journeys pinned by name
 * (LOOP.md):
 *   J1 — cookie happy path: create → list → get → update → ready.
 *   J2 — fails closed: no auth 401; non-member 401; ADMIN_DB missing 503 /
 *        unreachable 503; CSRF 403; cross-site 403; rate-limited 429;
 *        wrong-method 404.
 *   J3 — scoping: an admin sees/touches only their OWN drafts (cross-author →
 *        404, no existence oracle); a superadmin lists/reads/abandons any but
 *        NEVER updates another author's words (explicit 403).
 *   J4 — validation + lifecycle: bad kind/slug/content/JSON 400; unknown id
 *        404; expired rows invisible; closed drafts reject mutation 409.
 *   J5 — audit: each mutation appends EXACTLY one admin_action_audit row,
 *        atomically; admin_action_audit is insert-only (pinned statically).
 *   J6 — per-request NIP-98: signed create works; exact replay is burned.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure';
import { routeAdmin } from '../admin/router.ts';
import { AdminCoordinator } from '../admin/coordinator.ts';
import type { AdminAllowlist } from '../admin/allowlist.ts';
import { MAX_CONTENT_BYTES } from '../admin/staging.ts';
import { ADMIN_SESSION_COOKIE } from '../admin/session.ts';
import { sha256Hex } from '../auth/nostr.ts';
import type {
  KVNamespace, D1Database, D1PreparedStatement, D1Result,
  DurableObjectNamespace, DurableObjectState, RateLimit,
} from '../auth/cf.ts';
import type { AdminEnv } from '../admin/types.ts';

const ORIGIN = 'https://wecanjustbuildthings.dev';

// ---- fakes (same shapes as admin-roster.test.ts, plus the staging SQL) ----

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

interface DraftRow {
  id: string; created_at: number; updated_at: number; author: string;
  kind: string; slug: string; content: string;
  enforcement_status: string; enforcement_report: string | null;
  state: string; pr_url: string | null; expires_at: number;
}
interface ActionAuditRow { id: string; at: number; actor: string; action: string; target: string; detail: string | null }

/** In-memory ADMIN_DB covering the staged_edits + admin_action_audit surface
 *  staging.ts uses. `drafts`/`audit` are exposed so tests can assert exact rows
 *  (and force expiry by editing expires_at directly). */
function fakeStagingD1(): D1Database & { drafts: Map<string, DraftRow>; audit: ActionAuditRow[] } {
  const drafts = new Map<string, DraftRow>();
  const audit: ActionAuditRow[] = [];
  const metaOf = (r: DraftRow) => ({
    id: r.id, created_at: r.created_at, updated_at: r.updated_at, author: r.author,
    kind: r.kind, slug: r.slug, enforcement_status: r.enforcement_status, state: r.state, expires_at: r.expires_at,
  });
  const apply = (sql: string, a: unknown[]) => {
    if (sql.includes('INTO staged_edits')) {
      drafts.set(a[0] as string, {
        id: a[0] as string, created_at: a[1] as number, updated_at: a[2] as number, author: a[3] as string,
        kind: a[4] as string, slug: a[5] as string, content: a[6] as string,
        enforcement_status: 'pending', enforcement_report: null, state: 'draft', pr_url: null,
        expires_at: a[7] as number,
      });
      return;
    }
    if (sql.includes("SET state = 'abandoned'")) {
      const row = drafts.get(a[1] as string);
      if (row) { row.state = 'abandoned'; row.updated_at = a[0] as number; }
      return;
    }
    if (sql.includes('UPDATE staged_edits SET slug')) {
      const row = drafts.get(a[5] as string);
      if (row) {
        row.slug = a[0] as string; row.content = a[1] as string; row.state = a[2] as string;
        row.updated_at = a[3] as number; row.expires_at = a[4] as number;
      }
      return;
    }
    if (sql.includes('INTO admin_action_audit')) {
      audit.push({
        id: a[0] as string, at: a[1] as number, actor: a[2] as string,
        action: a[3] as string, target: a[4] as string, detail: (a[5] ?? null) as string | null,
      });
    }
  };
  const make = (sql: string): D1PreparedStatement => {
    let args: unknown[] = [];
    const stmt: D1PreparedStatement = {
      bind(...a) { args = a; return stmt; },
      async first<T>() {
        if (sql.includes('FROM staged_edits WHERE id')) {
          const row = drafts.get(args[0] as string);
          return ((row && row.expires_at > (args[1] as number) ? row : null) as T | null);
        }
        return null;
      },
      async run(): Promise<D1Result> { apply(sql, args); return { results: [], success: true }; },
      async all<T>(): Promise<D1Result<T>> {
        if (sql.includes('FROM staged_edits WHERE expires_at')) {
          let rows = [...drafts.values()].filter((r) => r.expires_at > (args[0] as number));
          if (sql.includes('AND author')) rows = rows.filter((r) => r.author === (args[1] as string));
          rows.sort((x, y) => y.updated_at - x.updated_at);
          return { results: rows.map(metaOf) as T[], success: true };
        }
        return { results: [], success: true };
      },
    };
    return stmt;
  };
  return { prepare: make, async batch(stmts) { for (const s of stmts) await s.run(); return []; }, drafts, audit };
}

/** Every call fails — the "ADMIN_DB unreachable" fixture. */
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

type Env = AdminEnv & { ADMIN_SESSIONS: KVNamespace; ADMIN_DB: ReturnType<typeof fakeStagingD1> };
function fakeEnv(overrides: Partial<AdminEnv> = {}): Env {
  return {
    ADMIN_SESSIONS: fakeKV(),
    ADMIN_COORD: fakeCoordNamespace(),
    ADMIN_DB: fakeStagingD1(),
    SITE_URL: ORIGIN,
    AUTH_RATE_LIMITER: allowAllLimiter,
    ...overrides,
  } as Env;
}

const req = (path: string, init?: RequestInit) => new Request(`${ORIGIN}${path}`, init);
const nowS = () => Math.floor(Date.now() / 1000);

function tokenFor(
  sk: Uint8Array,
  o: { url: string; method?: string; payload?: string; createdAt?: number },
): string {
  const tags: string[][] = [['u', o.url], ['method', o.method ?? 'POST']];
  if (o.payload !== undefined) tags.push(['payload', o.payload]);
  const event = finalizeEvent({ kind: 27235, created_at: o.createdAt ?? nowS(), content: '', tags }, sk);
  return 'Nostr ' + Buffer.from(JSON.stringify(event), 'utf8').toString('base64');
}

async function nostrLogin(env: AdminEnv, sk: Uint8Array, deps: Parameters<typeof routeAdmin>[2]) {
  const cRes = await routeAdmin(req('/api/admin/login/nostr/challenge', { method: 'POST' }), env, deps);
  assert.equal(cRes.status, 200);
  const { challenge } = (await cRes.json()) as { challenge: string };
  const body = JSON.stringify({ challenge });
  const token = tokenFor(sk, { url: `${ORIGIN}/api/admin/login/nostr/verify`, payload: await sha256Hex(body) });
  return routeAdmin(req('/api/admin/login/nostr/verify', {
    method: 'POST', body, headers: { authorization: token, 'content-type': 'application/json' },
  }), env, deps);
}

const sessionIdOf = (res: Response) => /__Host-wcjbt_admin=([0-9a-f]{64})/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? '';
const withAdminCookie = (path: string, id: string, init?: RequestInit) =>
  req(path, { ...init, headers: { ...(init?.headers as Record<string, string> ?? {}), cookie: `${ADMIN_SESSION_COOKIE}=${id}` } });

interface Session { id: string; csrf: string; sk: Uint8Array; pk: string }
async function loginAs(env: AdminEnv, sk: Uint8Array, deps: Parameters<typeof routeAdmin>[2]): Promise<Session> {
  const res = await nostrLogin(env, sk, deps);
  assert.equal(res.status, 200);
  const { csrf } = (await res.json()) as { csrf: string };
  return { id: sessionIdOf(res), csrf, sk, pk: getPublicKey(sk) };
}

const mutate = (path: string, s: Session, body: unknown, env: AdminEnv, deps: Parameters<typeof routeAdmin>[2]) =>
  routeAdmin(withAdminCookie(path, s.id, {
    method: 'POST', body: JSON.stringify(body), headers: { 'x-admin-csrf': s.csrf },
  }), env, deps);
const listVia = (s: Session, env: AdminEnv, deps: Parameters<typeof routeAdmin>[2]) =>
  routeAdmin(withAdminCookie('/api/admin/staging', s.id), env, deps);
const getVia = (id: string, s: Session, env: AdminEnv, deps: Parameters<typeof routeAdmin>[2]) =>
  routeAdmin(withAdminCookie(`/api/admin/staging/get?id=${encodeURIComponent(id)}`, s.id), env, deps);

/** File fixture: one superadmin + two file admins (A authors, B is the other author). */
const SK_SUPER = generateSecretKey();
const SK_A = generateSecretKey();
const SK_B = generateSecretKey();
const SK_OUTSIDER = generateSecretKey();
const DEPS = {
  allowlist: {
    nostr: [
      { pubkey: getPublicKey(SK_SUPER), role: 'superadmin' },
      { pubkey: getPublicKey(SK_A), role: 'admin' },
      { pubkey: getPublicKey(SK_B), role: 'admin' },
    ],
    bluesky: [],
  } as AdminAllowlist,
};

const DRAFT = { kind: 'skill', slug: 'my-method', content: '# My method\n\nStep one.' };

async function createDraft(s: Session, env: Env, body: unknown = DRAFT): Promise<string> {
  const res = await mutate('/api/admin/staging/create', s, body, env, DEPS);
  assert.equal(res.status, 200);
  const { id } = (await res.json()) as { id: string };
  assert.ok(id);
  return id;
}

// ---- J1: cookie happy path ----

test('J1 cookie happy path: create → list → get → update → ready', async () => {
  const env = fakeEnv();
  const a = await loginAs(env, SK_A, DEPS);
  const id = await createDraft(a, env);

  const list = await listVia(a, env, DEPS);
  assert.equal(list.status, 200);
  const { drafts } = (await list.json()) as { drafts: Array<Record<string, unknown>> };
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0]!.id, id);
  assert.equal(drafts[0]!.state, 'draft');
  assert.equal(drafts[0]!.enforcement_status, 'pending');
  assert.equal('content' in drafts[0]!, false, 'list rows must not carry draft bodies');

  const got = await getVia(id, a, env, DEPS);
  assert.equal(got.status, 200);
  const { draft } = (await got.json()) as { draft: Record<string, unknown> };
  assert.equal(draft.content, DRAFT.content);
  assert.equal(draft.author, `nostr:${a.pk}`);

  const upd = await mutate('/api/admin/staging/update', a, { id, content: '# v2', state: 'ready' }, env, DEPS);
  assert.equal(upd.status, 200);
  const after = (await (await getVia(id, a, env, DEPS)).json()) as { draft: Record<string, unknown> };
  assert.equal(after.draft.state, 'ready');
  assert.equal(after.draft.content, '# v2');
});

// ---- J2: fails closed ----

test('J2 unauthenticated and non-member requests are the same generic 401', async () => {
  const env = fakeEnv();
  assert.equal((await routeAdmin(req('/api/admin/staging'), env, DEPS)).status, 401);
  // valid signature, key not in the allowlist → same 401 (fails closed, no oracle)
  const body = JSON.stringify(DRAFT);
  const token = tokenFor(SK_OUTSIDER, { url: `${ORIGIN}/api/admin/staging/create`, payload: await sha256Hex(body) });
  const res = await routeAdmin(req('/api/admin/staging/create', { method: 'POST', body, headers: { authorization: token } }), env, DEPS);
  assert.equal(res.status, 401);
});

test('J2 missing ADMIN_DB is an explicit 503, before any auth work', async () => {
  const env = fakeEnv({ ADMIN_DB: undefined });
  assert.equal((await routeAdmin(req('/api/admin/staging'), env, DEPS)).status, 503);
});

test('J2 unreachable ADMIN_DB surfaces 503 on read AND write (never an empty 200)', async () => {
  const env = fakeEnv();
  const a = await loginAs(env, SK_A, DEPS);
  (env as { ADMIN_DB: D1Database }).ADMIN_DB = throwingD1();
  assert.equal((await listVia(a, env, DEPS)).status, 503);
  assert.equal((await mutate('/api/admin/staging/create', a, DRAFT, env, DEPS)).status, 503);
});

test('J2 mutations without (or with a wrong) CSRF token are 403', async () => {
  const env = fakeEnv();
  const a = await loginAs(env, SK_A, DEPS);
  const noToken = await routeAdmin(withAdminCookie('/api/admin/staging/create', a.id, {
    method: 'POST', body: JSON.stringify(DRAFT),
  }), env, DEPS);
  assert.equal(noToken.status, 403);
  const badToken = await routeAdmin(withAdminCookie('/api/admin/staging/create', a.id, {
    method: 'POST', body: JSON.stringify(DRAFT), headers: { 'x-admin-csrf': 'f'.repeat(64) },
  }), env, DEPS);
  assert.equal(badToken.status, 403);
});

test('J2 cross-site mutations are rejected before auth', async () => {
  const env = fakeEnv();
  const a = await loginAs(env, SK_A, DEPS);
  const res = await routeAdmin(withAdminCookie('/api/admin/staging/create', a.id, {
    method: 'POST', body: JSON.stringify(DRAFT), headers: { 'x-admin-csrf': a.csrf, origin: 'https://evil.example' },
  }), env, DEPS);
  assert.equal(res.status, 403);
});

test('J2 rate-limited requests are 429', async () => {
  const env = fakeEnv({ AUTH_RATE_LIMITER: denyAllLimiter });
  assert.equal((await routeAdmin(req('/api/admin/staging'), env, DEPS)).status, 429);
});

test('J2 wrong methods fail closed with 404', async () => {
  const env = fakeEnv();
  assert.equal((await routeAdmin(req('/api/admin/staging', { method: 'POST' }), env, DEPS)).status, 404);
  assert.equal((await routeAdmin(req('/api/admin/staging/create'), env, DEPS)).status, 404);
  assert.equal((await routeAdmin(req('/api/admin/staging/get', { method: 'POST' }), env, DEPS)).status, 404);
});

// ---- J3: scoping ----

test('J3 an admin cannot see or touch another author\'s draft — 404, no existence oracle', async () => {
  const env = fakeEnv();
  const a = await loginAs(env, SK_A, DEPS);
  const b = await loginAs(env, SK_B, DEPS);
  const idA = await createDraft(a, env);
  assert.equal((await getVia(idA, b, env, DEPS)).status, 404);
  assert.equal((await mutate('/api/admin/staging/update', b, { id: idA, content: '# hijack' }, env, DEPS)).status, 404);
  assert.equal((await mutate('/api/admin/staging/abandon', b, { id: idA }, env, DEPS)).status, 404);
  // and B's own list shows none of A's work
  const list = (await (await listVia(b, env, DEPS)).json()) as { drafts: unknown[] };
  assert.equal(list.drafts.length, 0);
});

test('J3 a superadmin lists/reads/abandons any draft but can never update another author\'s words', async () => {
  const env = fakeEnv();
  const a = await loginAs(env, SK_A, DEPS);
  const b = await loginAs(env, SK_B, DEPS);
  const sup = await loginAs(env, SK_SUPER, DEPS);
  const idA = await createDraft(a, env);
  const idB = await createDraft(b, env, { ...DRAFT, slug: 'other-method' });

  const supList = (await (await listVia(sup, env, DEPS)).json()) as { drafts: Array<{ id: string }> };
  assert.deepEqual(new Set(supList.drafts.map((d) => d.id)), new Set([idA, idB]));
  const aList = (await (await listVia(a, env, DEPS)).json()) as { drafts: Array<{ id: string }> };
  assert.deepEqual(aList.drafts.map((d) => d.id), [idA]);

  assert.equal((await getVia(idA, sup, env, DEPS)).status, 200);
  assert.equal((await mutate('/api/admin/staging/update', sup, { id: idA, content: '# edit' }, env, DEPS)).status, 403);
  assert.equal((await mutate('/api/admin/staging/abandon', sup, { id: idA }, env, DEPS)).status, 200);
});

// ---- J4: validation + lifecycle ----

test('J4 create validation: kind, slug, content, and JSON shape all gate with 400', async () => {
  const env = fakeEnv();
  const a = await loginAs(env, SK_A, DEPS);
  const cases: Array<Record<string, unknown>> = [
    { ...DRAFT, kind: 'malware' },
    { ...DRAFT, slug: 'UPPER' },
    { ...DRAFT, slug: '../escape' },
    { ...DRAFT, slug: '' },
    { ...DRAFT, content: '' },
    { ...DRAFT, content: '   ' },
    { ...DRAFT, content: 'a'.repeat(MAX_CONTENT_BYTES + 1) },
  ];
  for (const c of cases) {
    assert.equal((await mutate('/api/admin/staging/create', a, c, env, DEPS)).status, 400, JSON.stringify(Object.keys(c)));
  }
  const badJson = await routeAdmin(withAdminCookie('/api/admin/staging/create', a.id, {
    method: 'POST', body: 'not json', headers: { 'x-admin-csrf': a.csrf },
  }), env, DEPS);
  assert.equal(badJson.status, 400);
  assert.equal(env.ADMIN_DB.audit.length, 0, 'no audit rows for rejected mutations');
});

test('J4 update lifecycle: unknown id 404; abandon-via-update 400; closed drafts 409', async () => {
  const env = fakeEnv();
  const a = await loginAs(env, SK_A, DEPS);
  const id = await createDraft(a, env);
  assert.equal((await mutate('/api/admin/staging/update', a, { id: 'nope', content: '# x' }, env, DEPS)).status, 404);
  assert.equal((await mutate('/api/admin/staging/update', a, { id, state: 'abandoned' }, env, DEPS)).status, 400);
  assert.equal((await mutate('/api/admin/staging/abandon', a, { id }, env, DEPS)).status, 200);
  assert.equal((await mutate('/api/admin/staging/update', a, { id, content: '# x' }, env, DEPS)).status, 409);
  assert.equal((await mutate('/api/admin/staging/abandon', a, { id }, env, DEPS)).status, 409);
});

test('J4 expired drafts are invisible to list AND get', async () => {
  const env = fakeEnv();
  const a = await loginAs(env, SK_A, DEPS);
  const id = await createDraft(a, env);
  env.ADMIN_DB.drafts.get(id)!.expires_at = Date.now() - 1;
  const list = (await (await listVia(a, env, DEPS)).json()) as { drafts: unknown[] };
  assert.equal(list.drafts.length, 0);
  assert.equal((await getVia(id, a, env, DEPS)).status, 404);
});

// ---- J5: audit ----

test('J5 every mutation appends exactly one admin_action_audit row with actor, action, target', async () => {
  const env = fakeEnv();
  const a = await loginAs(env, SK_A, DEPS);
  const id = await createDraft(a, env);
  await mutate('/api/admin/staging/update', a, { id, state: 'ready' }, env, DEPS);
  await mutate('/api/admin/staging/abandon', a, { id }, env, DEPS);
  const actor = `nostr:${a.pk}`;
  assert.deepEqual(
    env.ADMIN_DB.audit.map(({ actor: act, action, target, detail }) => ({ actor: act, action, target, detail })),
    [
      { actor, action: 'staging.create', target: id, detail: 'kind:skill' },
      { actor, action: 'staging.update', target: id, detail: 'state:ready' },
      { actor, action: 'staging.abandon', target: id, detail: null },
    ],
  );
  for (const row of env.ADMIN_DB.audit) assert.ok(row.id && row.at > 0);
});

test('J5 admin_action_audit is INSERT-only in code: no UPDATE or DELETE against it exists anywhere in the worker', () => {
  for (const rel of ['../admin/roster.ts', '../admin/router.ts', '../admin/roles.ts', '../admin/session.ts', '../admin/staging.ts', '../index.ts']) {
    const source = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
    assert.doesNotMatch(source, /UPDATE\s+admin_action_audit/i, `${rel} must never UPDATE admin_action_audit`);
    assert.doesNotMatch(source, /DELETE\s+FROM\s+admin_action_audit/i, `${rel} must never DELETE from admin_action_audit`);
  }
  const staging = readFileSync(fileURLToPath(new URL('../admin/staging.ts', import.meta.url)), 'utf8');
  assert.match(staging, /INSERT INTO admin_action_audit/, 'the action audit is written by INSERT alone');
});

// ---- J6: per-request NIP-98 ----

test('J6 a nostr admin can create via per-request NIP-98; an exact replay is burned', async () => {
  const env = fakeEnv();
  const body = JSON.stringify(DRAFT);
  const token = tokenFor(SK_A, { url: `${ORIGIN}/api/admin/staging/create`, payload: await sha256Hex(body) });
  const call = () => routeAdmin(req('/api/admin/staging/create', {
    method: 'POST', body, headers: { authorization: token, 'content-type': 'application/json' },
  }), env, DEPS);
  assert.equal((await call()).status, 200);
  assert.equal((await call()).status, 401, 'the event id is single-use');
});

test('J6 NIP-98 list: the signed URL must cover the exact route', async () => {
  const env = fakeEnv();
  const token = tokenFor(SK_A, { url: `${ORIGIN}/api/admin/staging`, method: 'GET' });
  const res = await routeAdmin(req('/api/admin/staging', { headers: { authorization: token } }), env, DEPS);
  assert.equal(res.status, 200);
  // same signature presented against a different admin route → 401 (u-tag mismatch)
  const wrong = await routeAdmin(req('/api/admin/whoami', { headers: { authorization: token } }), env, DEPS);
  assert.equal(wrong.status, 401);
});
