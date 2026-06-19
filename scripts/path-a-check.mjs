/**
 * Path-A invariant gate (Slice D): the deployed platform makes ZERO model-inference
 * calls. Fails if any model-provider API host appears in the app code — including
 * PERMITTED providers (Anthropic/DeepSeek/OpenRouter/Google), because Path A means the
 * platform calls no model at all; inference runs in the user's own Goose. The single
 * permitted "structured-reflection" step (mentor-engine.reflectFromResponse) only reads
 * already-produced JSON and makes no network call, so it can't trip this.
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

// App code only — exclude the enforcement engine (its YAML/tests legitimately list
// excluded hosts as denylist signals) and any test files.
const ROOTS = ['src/lib', 'src/components', 'src/modules', 'src/pages', 'worker'];
const files = execSync(`git ls-files ${ROOTS.join(' ')}`, { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter((f) => !f.includes('/tests/') && !f.endsWith('.test.ts'));

const hits = [];
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  for (const h of HOSTS) if (text.includes(h)) hits.push(`${f} → ${h}`);
}

if (hits.length) {
  console.error('✗ Path-A violated — model-inference host(s) found in app code:');
  for (const h of hits) console.error('  - ' + h);
  process.exit(1);
}
console.log(`✓ Path-A: zero model-inference hosts across ${files.length} app files.`);
