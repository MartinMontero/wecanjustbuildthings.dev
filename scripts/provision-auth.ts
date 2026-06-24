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
 *   4. applies the D1 migrations (migrations/),
 *   5. prints a wrangler.jsonc-ready block with the resolved ids to paste.
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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DRY_RUN = process.argv.includes('--dry-run');

// The auth resources, mirrored from wrangler.jsonc. `wrangler kv namespace create`
// titles a namespace `<worker>-<binding>`, so we match either that or the bare name.
const WORKER = 'wecanjustbuildthings';
const KV_BINDINGS = ['SESSIONS', 'ATPROTO'] as const;
const D1_NAME = 'wcjbt-auth';
const D1_BINDING = 'DB';

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
      }) ?? ''
    );
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    throw new Error(`\`${pretty}\` failed:\n${e.stderr || e.stdout || e.message || String(err)}`);
  }
}

/** Fail early with a clear message if wrangler isn't authenticated. */
function assertAuthenticated(): void {
  if (DRY_RUN) return;
  try {
    wrangler(['whoami'], { capture: true });
  } catch {
    console.error(
      '\n✘ Cloudflare auth is not configured. Run `npx wrangler login`, or set a\n' +
        '  CLOUDFLARE_API_TOKEN (and CLOUDFLARE_ACCOUNT_ID) for the deploying account,\n' +
        '  then re-run. See docs/AUTH_PROVISIONING.md.',
    );
    process.exit(1);
  }
}

/** Pull the first JSON array out of (possibly banner-prefixed) wrangler output. */
function parseJsonArray<T>(out: string): T[] {
  const start = out.indexOf('[');
  const end = out.lastIndexOf(']');
  if (start === -1 || end === -1) return [];
  try {
    return JSON.parse(out.slice(start, end + 1)) as T[];
  } catch {
    return [];
  }
}

/** Read an id (D1 uuid or KV 32-hex) out of `wrangler … create` output. */
function extractId(out: string): string | null {
  const uuid = out.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (uuid) return uuid[0];
  const hex = out.match(/"?(?:id|database_id)"?\s*[:=]\s*"?([0-9a-f]{32})"?/i);
  return hex ? hex[1]! : null;
}

function resolveKv(binding: string): string {
  if (DRY_RUN) {
    console.log(`  · KV ${binding}: ensure exists (create "${WORKER}-${binding}" if missing)`);
    return 'PENDING';
  }
  const title = `${WORKER}-${binding}`;
  const list = parseJsonArray<{ id: string; title: string }>(
    wrangler(['kv', 'namespace', 'list'], { capture: true }),
  );
  const found = list.find((n) => n.title === title || n.title === binding);
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

function resolveD1(): string {
  if (DRY_RUN) {
    console.log(`  · D1 ${D1_NAME}: ensure exists (create if missing)`);
    return 'PENDING';
  }
  const list = parseJsonArray<{ uuid?: string; database_id?: string; name: string }>(
    wrangler(['d1', 'list', '--json'], { capture: true }),
  );
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

/** Warn (don't fail) if this script's resource list has drifted from wrangler.jsonc. */
function assertMirrorsConfig(): void {
  const cfg = readFileSync(fileURLToPath(new URL('../wrangler.jsonc', import.meta.url)), 'utf8');
  const missing = [...KV_BINDINGS, D1_NAME, D1_BINDING].filter((n) => !cfg.includes(`"${n}"`));
  if (missing.length) {
    console.warn(`⚠ wrangler.jsonc no longer mentions: ${missing.join(', ')} — update this script.`);
  }
}

console.log(`\nProvisioning auth storage${DRY_RUN ? ' (dry-run)' : ''} — 2 KV namespaces + 1 D1 database\n`);
assertMirrorsConfig();
assertAuthenticated();

const kvIds: Record<string, string> = {};
for (const binding of KV_BINDINGS) kvIds[binding] = resolveKv(binding);
const dbId = resolveD1();

console.log(`\nApplying D1 migrations to ${D1_NAME}…`);
wrangler(['d1', 'migrations', 'apply', D1_NAME, '--remote']);

console.log('\nPaste these into wrangler.jsonc (keep the binding names + migrations_dir):\n');
console.log('  "kv_namespaces": [');
console.log(KV_BINDINGS.map((b) => `    { "binding": "${b}", "id": "${kvIds[b]}" }`).join(',\n'));
console.log('  ],');
console.log('  "d1_databases": [');
console.log(
  `    { "binding": "${D1_BINDING}", "database_name": "${D1_NAME}", "database_id": "${dbId}", "migrations_dir": "migrations" }`,
);
console.log('  ]');
console.log('\nThen set the signing secret separately: `npx wrangler secret put BLUESKY_PRIVATE_KEY_JWK`.');
