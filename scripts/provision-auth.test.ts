import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseJsonArray, extractId, readWorkerName, committedDbId, compatibilityDate, buildMigrationConfig,
} from './provision-auth.ts';

// Importing the script must NOT run the provisioning flow (it is guarded behind a
// direct-invocation check). If it ran, this file would try to shell out to wrangler.
test('importing provision-auth does not execute the provisioning flow', () => {
  assert.equal(typeof parseJsonArray, 'function');
});

test('parseJsonArray extracts a JSON array from banner-prefixed wrangler output', () => {
  const out = '▲ [WARNING] Proxy…\n\n[\n  { "id": "abc", "title": "SESSIONS" }\n]\n';
  assert.deepEqual(parseJsonArray<{ id: string; title: string }>(out), [{ id: 'abc', title: 'SESSIONS' }]);
  assert.deepEqual(parseJsonArray('[]'), []); // genuinely empty account
});

test('parseJsonArray THROWS on non-array output instead of masking it as "empty"', () => {
  // A format change / error text with no array must not silently become [] (which
  // would flip resolveKv/resolveD1 from reuse to a doomed create).
  assert.throws(() => parseJsonArray('Error: not logged in'), /found none/);
  assert.throws(() => parseJsonArray('[ {"id": broken ]'), /could not parse/);
});

test('extractId reads a D1 uuid or a 32-hex KV id, else null', () => {
  assert.equal(extractId('Created database d3240389-b265-4229-bff0-b8ab94c4d78d'), 'd3240389-b265-4229-bff0-b8ab94c4d78d');
  assert.equal(extractId('id = "4646df2e5e3c4182b0d654a4a0664e40"'), '4646df2e5e3c4182b0d654a4a0664e40');
  assert.equal(extractId('"id": "a8da5109ae3046c88d726288d59aaa96"'), 'a8da5109ae3046c88d726288d59aaa96');
  assert.equal(extractId('no id anywhere here'), null);
});

const CFG = `{
  "name": "wecanjustbuildthings",
  "compatibility_date": "2026-06-01",
  "d1_databases": [
    { "binding": "DB", "database_name": "wcjbt-auth", "database_id": "d3240389-b265-4229-bff0-b8ab94c4d78d", "migrations_dir": "migrations" }
  ]
}`;

test('config readers pull name, committed database_id, and compatibility_date', () => {
  assert.equal(readWorkerName(CFG), 'wecanjustbuildthings');
  assert.equal(committedDbId(CFG), 'd3240389-b265-4229-bff0-b8ab94c4d78d');
  assert.equal(compatibilityDate(CFG), '2026-06-01');
  assert.equal(readWorkerName('{}'), 'wecanjustbuildthings'); // safe default
});

test('buildMigrationConfig pins the RESOLVED db id + an absolute migrations dir', () => {
  const cfg = buildMigrationConfig({
    name: 'wecanjustbuildthings', compatibilityDate: '2026-06-01',
    dbId: 'fresh-account-uuid', migrationsDir: '/abs/repo/migrations',
  }) as { d1_databases: Array<{ database_id: string; migrations_dir: string; database_name: string }> };
  // This is the High-severity fix: migrations must target the freshly resolved id,
  // never the stale one committed in wrangler.jsonc.
  assert.equal(cfg.d1_databases[0]!.database_id, 'fresh-account-uuid');
  assert.equal(cfg.d1_databases[0]!.database_name, 'wcjbt-auth');
  assert.equal(cfg.d1_databases[0]!.migrations_dir, '/abs/repo/migrations');
});
