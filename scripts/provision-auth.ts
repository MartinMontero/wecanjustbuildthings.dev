/**
 * provision-auth.ts — idempotent provisioning of the auth storage (Sign in with
 * Nostr / Bluesky) on the *currently authenticated* Cloudflare account.
 *
 * The catalog site is static; only sign-in needs storage: two KV namespaces and
 * one D1 database (see docs/AUTH_PROVISIONING.md). The ids committed in
 * `wrangler.jsonc` are **account-scoped** — they only resolve on the account that
 * created them, so deploying under a different account needs fresh ids. This makes
 * that reproducible on any account:
 *
 *   1. reads the intended resource names (kept in sync with wrangler.jsonc),
 *   2. lists what already exists on the authenticated account,
 *   3. CREATES ONLY WHAT'S MISSING — it never deletes or recreates anything,
 *   4. prints the wrangler.jsonc-ready id block FIRST (so it's never lost if a
 *      later step fails),
 *   5. applies the D1 migrations against the RESOLVED database (not the stale id
 *      committed in wrangler.jsonc), so first-time provisioning on a new account
 *      migrates the database it just created.
 *
 * Re-running is safe and idempotent: existing resources are detected and reused.
 *
 *   npx wrangler login                    # or export CLOUDFLARE_API_TOKEN (+ _ACCOUNT_ID)
 *   npm run provision:auth                # detect + create missing + migrate + print ids
 *   npm run provision:auth -- --dry-run   # show the plan; call nothing, change nothing
 *
 * No third-party dependencies (Cloudflare's `wrangler` + Node built-ins only); no
 * Meta/OpenAI/xAI anything. Runs through the enforcement engine like any source.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DRY_RUN = process.argv.includes('--dry-run');

// The auth resources, mirrored from wrangler.jsonc.
const KV_BINDINGS = ['SESSIONS', 'ATPROTO'] as const;
const D1_NAME = 'wcjbt-auth';
const D1_BINDING = 'DB';

const WRANGLER_CONFIG_PATH = fileURLToPath(new URL('../wrangler.jsonc', import.meta.url));
const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

interface KvEntry { id: string; title: string }
interface D1Entry { uuid?: string; database_id?: string; name: string }

function wrangler(args: string[], opts: { capture?: boolean } = {}): string {
  const pretty = `wrangler ${args.join(' ')}`;
  if (DRY_RUN) {
    console.log(`  [dry-run] would run: ${pretty}`);
    return '';
  }
  try {
    return (
      execFileSync('npx', ['--no-install', 'wrangler', ...args], {
        encoding: 'utf8',
        stdio: opts.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
        // On Windows `npx` is a `.cmd` shim, which can't be spawned without a shell
        // (Node's CVE-2024-27980 hardening). Our args are fixed identifiers, so
        // shell:true is safe here. No-op on POSIX.
        shell: process.platform === 'win32',
      }) ?? ''
    );
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    throw new Error(`\`${pretty}\` failed:\n${e.stderr || e.stdout || e.message || String(err)}`);
  }
}

/**
 * Fail early with a clear message if wrangler isn't authenticated. NOTE: `wrangler
 * whoami` exits 0 even when unauthenticated (it just prints "You are not
 * authenticated"), so we inspect stdout — checking only the exit code would let an
 * unauthenticated run sail past and die later with a raw stack trace.
 */
function assertAuthenticated(): void {
  if (DRY_RUN) return;
  let out: string;
  try {
    out = wrangler(['whoami'], { capture: true });
  } catch (err) {
    console.error(`\n✘ Could not run \`wrangler whoami\` (is wrangler installed / the network up?):\n${err}`);
    process.exit(1);
  }
  if (/not authenticated|wrangler login/i.test(out)) {
    console.error(
      '\n✘ Cloudflare auth is not configured. Run `npx wrangler login`, or set a\n' +
        '  CLOUDFLARE_API_TOKEN (and CLOUDFLARE_ACCOUNT_ID) for the deploying account,\n' +
        '  then re-run. See docs/AUTH_PROVISIONING.md.',
    );
    process.exit(1);
  }
}

/** Pull the first JSON array out of (possibly banner-prefixed) wrangler output.
 *  Throws on non-array output instead of silently returning [] — a swallowed parse
 *  failure would read as "account has no resources" and flip the script from reuse
 *  to (failed) creation of already-existing resources. */
export function parseJsonArray<T>(out: string): T[] {
  const end = out.lastIndexOf(']');
  if (end === -1) {
    throw new Error(`expected a JSON array in wrangler output but found none:\n${out}`);
  }
  // The first '[' may belong to a banner line (e.g. "[WARNING] …"), so try each '['
  // start until one parses as a JSON array through the final ']'. Robust to a stray
  // bracket in noise without silently masking genuinely malformed output.
  for (let i = out.indexOf('['); i !== -1 && i < end; i = out.indexOf('[', i + 1)) {
    try {
      return JSON.parse(out.slice(i, end + 1)) as T[];
    } catch { /* this '[' was noise; try the next one */ }
  }
  throw new Error(`could not parse a JSON array from wrangler output:\n${out}`);
}

/** Read an id (D1 uuid or KV 32-hex) out of `wrangler … create` output. */
export function extractId(out: string): string | null {
  const uuid = out.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (uuid) return uuid[0];
  const hex = out.match(/"?(?:id|database_id)"?\s*[:=]\s*"?([0-9a-f]{32})"?/i);
  return hex ? hex[1]! : null;
}

/** The worker name, read from wrangler.jsonc so it can't drift from the source of
 *  truth (used only to match KV namespaces created by an older wrangler). */
export function readWorkerName(cfg: string): string {
  return /"name"\s*:\s*"([^"]+)"/.exec(cfg)?.[1] ?? 'wecanjustbuildthings';
}

/** The database_id currently committed in wrangler.jsonc (may be a placeholder). */
export function committedDbId(cfg: string): string | undefined {
  return /"database_id"\s*:\s*"([^"]+)"/.exec(cfg)?.[1];
}

export function compatibilityDate(cfg: string): string | undefined {
  return /"compatibility_date"\s*:\s*"([^"]+)"/.exec(cfg)?.[1];
}

/** Minimal throwaway wrangler config that points `d1 migrations apply` at the
 *  freshly RESOLVED database (absolute migrations_dir so it resolves regardless of
 *  where the temp file lives). Pure + exported for testing. */
export function buildMigrationConfig(opts: {
  name: string; compatibilityDate?: string; dbId: string; migrationsDir: string;
}): Record<string, unknown> {
  return {
    name: opts.name,
    ...(opts.compatibilityDate ? { compatibility_date: opts.compatibilityDate } : {}),
    d1_databases: [
      { binding: D1_BINDING, database_name: D1_NAME, database_id: opts.dbId, migrations_dir: opts.migrationsDir },
    ],
  };
}

/** Resolve one KV namespace id, creating it if missing. Titling note: the current
 *  wrangler (`kv namespace create SESSIONS`) titles the namespace with the BARE
 *  binding name (`SESSIONS`), not `<worker>-<binding>`; we match the bare name and,
 *  for namespaces made by an older wrangler, the `<worker>-<binding>` form too. */
function resolveKv(binding: string, worker: string, list: KvEntry[]): string {
  const legacyTitle = `${worker}-${binding}`;
  const found = list.find((n) => n.title === binding || n.title === legacyTitle);
  if (found) {
    console.log(`  ✓ KV ${binding}: exists (${found.id})`);
    return found.id;
  }
  console.log(`  + KV ${binding}: creating…`);
  const id = extractId(wrangler(['kv', 'namespace', 'create', binding], { capture: true }));
  if (!id) throw new Error(`could not read the new id for KV ${binding}`);
  console.log(`  ✓ KV ${binding}: created (${id})`);
  return id;
}

function resolveD1(list: D1Entry[]): string {
  const found = list.find((d) => d.name === D1_NAME);
  if (found) {
    const id = found.uuid ?? found.database_id ?? '';
    console.log(`  ✓ D1 ${D1_NAME}: exists (${id})`);
    return id;
  }
  console.log(`  + D1 ${D1_NAME}: creating…`);
  const id = extractId(wrangler(['d1', 'create', D1_NAME], { capture: true }));
  if (!id) throw new Error(`could not read the new database_id for D1 ${D1_NAME}`);
  console.log(`  ✓ D1 ${D1_NAME}: created (${id})`);
  return id;
}

/** Print the wrangler.jsonc-ready id block. Called BEFORE migrations so the ids are
 *  never lost if the migration step fails. */
function printIdBlock(kvIds: Record<string, string>, dbId: string): void {
  console.log('\nPaste these into wrangler.jsonc (keep the binding names + migrations_dir):\n');
  console.log('  "kv_namespaces": [');
  console.log(KV_BINDINGS.map((b) => `    { "binding": "${b}", "id": "${kvIds[b]}" }`).join(',\n'));
  console.log('  ],');
  console.log('  "d1_databases": [');
  console.log(
    `    { "binding": "${D1_BINDING}", "database_name": "${D1_NAME}", "database_id": "${dbId}", "migrations_dir": "migrations" }`,
  );
  console.log('  ]');
}

/**
 * Apply the D1 migrations to the RESOLVED database. `wrangler d1 migrations apply`
 * reads wrangler.jsonc and targets the committed database_id — which on a fresh
 * account is a stale id that doesn't exist, so a naive call would fail. When the
 * resolved id differs from the committed one we migrate through a throwaway config
 * pinned to the resolved id (the committed wrangler.jsonc is never mutated); if that
 * fails we fall back to clear manual guidance rather than a raw stack trace.
 */
function applyMigrations(dbId: string, cfg: string): void {
  console.log(`\nApplying D1 migrations to ${D1_NAME}…`);
  if (DRY_RUN) { wrangler(['d1', 'migrations', 'apply', D1_NAME, '--remote']); return; }

  if (committedDbId(cfg) === dbId) {
    // wrangler.jsonc already points at the resolved database — migrate directly.
    wrangler(['d1', 'migrations', 'apply', D1_NAME, '--remote']);
    return;
  }
  const tmp = join(tmpdir(), `provision-auth-wrangler.${process.pid}.json`);
  writeFileSync(tmp, JSON.stringify(buildMigrationConfig({
    name: readWorkerName(cfg), compatibilityDate: compatibilityDate(cfg), dbId, migrationsDir: MIGRATIONS_DIR,
  })));
  try {
    wrangler(['d1', 'migrations', 'apply', D1_NAME, '--remote', '--config', tmp]);
  } catch (err) {
    console.error(
      `\n⚠ Could not auto-apply migrations to the newly created database:\n${err}\n` +
        '  Paste the id block above into wrangler.jsonc, then run `npm run migrate`.',
    );
  } finally {
    try { rmSync(tmp, { force: true }); } catch { /* best effort cleanup */ }
  }
}

/** Warn (don't fail) if this script's resource list has drifted from wrangler.jsonc. */
function assertMirrorsConfig(cfg: string): void {
  const missing = [...KV_BINDINGS, D1_NAME, D1_BINDING].filter((n) => !cfg.includes(`"${n}"`));
  if (missing.length) {
    console.warn(`⚠ wrangler.jsonc no longer mentions: ${missing.join(', ')} — update this script.`);
  }
}

function main(): void {
  console.log(`\nProvisioning auth storage${DRY_RUN ? ' (dry-run)' : ''} — 2 KV namespaces + 1 D1 database\n`);
  const cfg = readFileSync(WRANGLER_CONFIG_PATH, 'utf8');
  const worker = readWorkerName(cfg);
  assertMirrorsConfig(cfg);
  assertAuthenticated();

  const kvIds: Record<string, string> = {};
  if (DRY_RUN) {
    for (const binding of KV_BINDINGS) {
      console.log(`  · KV ${binding}: ensure exists (create "${binding}" if missing)`);
      kvIds[binding] = 'PENDING';
    }
    console.log(`  · D1 ${D1_NAME}: ensure exists (create if missing)`);
    printIdBlock(kvIds, 'PENDING');
    applyMigrations('PENDING', cfg);
  } else {
    // One `kv namespace list` for all bindings (was one call per binding).
    const kvList = parseJsonArray<KvEntry>(wrangler(['kv', 'namespace', 'list'], { capture: true }));
    for (const binding of KV_BINDINGS) kvIds[binding] = resolveKv(binding, worker, kvList);
    const d1List = parseJsonArray<D1Entry>(wrangler(['d1', 'list', '--json'], { capture: true }));
    const dbId = resolveD1(d1List);
    // Print the ids BEFORE migrating so a migration failure can't lose them.
    printIdBlock(kvIds, dbId);
    applyMigrations(dbId, cfg);
  }

  console.log('\nThen set the signing secret separately: `npx wrangler secret put BLUESKY_PRIVATE_KEY_JWK`.');
}

// Run only when invoked directly (`npm run provision:auth`), not when imported by a
// test — so the pure helpers above can be unit-tested without provisioning anything.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
