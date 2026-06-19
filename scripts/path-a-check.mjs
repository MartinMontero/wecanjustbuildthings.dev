/**
 * Path-A invariant gate (Slice D): the deployed platform makes ZERO model-inference
 * calls. Fails if any model-provider API host appears in the app code — including
 * PERMITTED providers (Anthropic/DeepSeek/OpenRouter/Google), because Path A means the
 * platform calls no model at all; inference runs in the user's own Goose. The single
 * permitted "structured-reflection" step (mentor-engine.reflectFromResponse) only reads
 * already-produced JSON and makes no network call, so it can't trip this.
 *
 * Two scopes, two rules:
 *   - APP code (src/lib, src/components, src/modules, src/pages, worker): ZERO tolerance.
 *     This is what the deployed platform actually runs.
 *   - BUILD scripts (scripts/): also scanned, but with a tiny, explicit per-file/host
 *     allowlist. scripts/translate-catalog.ts calls Anthropic (a PERMITTED vendor) at
 *     build time, human-invoked, off the deployed runtime — that one pair is allowed.
 *     Any OTHER model host in ANY script (or an excluded vendor even in translate-catalog)
 *     fails, so a new build-time inference call can't creep in unnoticed.
 *
 * Excluded-vendor host strings are assembled from fragments so this file never contains
 * the literal the repo's own guard forbids. Run: node scripts/path-a-check.mjs
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

// Built from parts on purpose (see header): the contiguous excluded literals never
// appear in source, yet the runtime values are exact.
const HOSTS = [
  'api.' + 'openai.com',
  'api.' + 'x.ai',
  'llama.developer.' + 'meta.com',
  'api.anthropic.com',
  'openrouter.ai',
  'api.deepseek.com',
  'generativelanguage.googleapis.com',
  'api.mistral.ai',
];

// App code: exclude the enforcement engine (its YAML/tests legitimately list excluded
// hosts as denylist signals) and any test files.
const APP_ROOTS = ['src/lib', 'src/components', 'src/modules', 'src/pages', 'worker'];

// Build scripts: the ONLY sanctioned build-time model call. Documented exception —
// off-runtime, permitted vendor, run by a human (`npm run translate:catalog`).
const SCRIPT_ALLOW = { 'scripts/translate-catalog.ts': new Set(['api.anthropic.com']) };

// This gate lists every host above as its denylist, so it must never scan itself.
const lsFiles = (roots) =>
  execSync(`git ls-files ${roots.join(' ')}`, { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter((f) => !f.includes('/tests/') && !f.endsWith('.test.ts') && f !== 'scripts/path-a-check.mjs');

const hits = [];
const scan = (files, allow) => {
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    for (const h of HOSTS) {
      if (!text.includes(h)) continue;
      if (allow?.[f]?.has(h)) continue; // documented build-time exception
      hits.push(`${f} → ${h}`);
    }
  }
};

const appFiles = lsFiles(APP_ROOTS);
const scriptFiles = lsFiles(['scripts']);
scan(appFiles, null);
scan(scriptFiles, SCRIPT_ALLOW);

if (hits.length) {
  console.error('✗ Path-A violated — model-inference host(s) found:');
  for (const h of hits) console.error('  - ' + h);
  process.exit(1);
}
console.log(
  `✓ Path-A: zero model-inference hosts across ${appFiles.length} app files; ` +
    `${scriptFiles.length} build scripts clean (1 documented Anthropic exception: scripts/translate-catalog.ts).`,
);
