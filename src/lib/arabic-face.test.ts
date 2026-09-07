import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';

// M6 checkpoint invariants: the Arabic display face exists within budget, its
// license ships, the :lang(ar) wiring is present, and the console surface
// carries zero raw hex. These guard the G6 rider mechanically, not by memory.

const partsDir = 'data/fonts/parts';
const oflPath = 'public/fonts/Readex-Pro-OFL.txt';

test('Arabic subset source exists, decodes to woff2, and is within the 45 KB budget', () => {
  const parts = readdirSync(partsDir).filter((f) => f.startsWith('arabic-headings.b64.part-')).sort();
  assert.ok(parts.length >= 4, 'font parts missing');
  const b64 = parts.map((f) => readFileSync(`${partsDir}/${f}`, 'utf8')).join('').replace(/\s+/g, '');
  const buf = Buffer.from(b64, 'base64');
  assert.ok(buf.length / 1024 <= 45, `subset ${(buf.length / 1024).toFixed(1)} KB exceeds the 45 KB budget`);
  assert.equal(buf.subarray(0, 4).toString('ascii'), 'wOF2', 'decoded source is not woff2');
  const digest = createHash('sha256').update(buf).digest('hex');
  assert.equal(digest, 'd80553453c7d817c1c47c659ae58c02831934ccb5b54a0092526ed96277cf316',
    'font source does not match its SHA-256 pin (see scripts/assemble-arabic-font.mjs)');
});

test('Readex Pro OFL license text is committed', () => {
  const text = readFileSync(oflPath, 'utf8');
  assert.match(text, /SIL OPEN FONT LICENSE/i);
});

test('Arabic headings are wired to the face via :lang(ar)', () => {
  const theme = readFileSync('src/styles/theme.css', 'utf8');
  assert.match(theme, /:lang\(ar\)/);
  assert.match(theme, /Readex Pro Arabic/);
  const tokens = readFileSync('src/styles/tokens.css', 'utf8');
  assert.match(tokens, /readex-pro-arabic-headings\.woff2/);
});

test('the console surface carries zero raw hex literals', () => {
  for (const f of ['src/pages/console/index.astro', 'src/components/AdminConsole.svelte']) {
    const src = readFileSync(f, 'utf8');
    assert.ok(!/#[0-9a-fA-F]{3}\b|#[0-9a-fA-F]{6}\b/.test(src), `raw hex remains in ${f}`);
    assert.ok(!src.includes('--sl-'), `Starlight var remains in ${f}`);
  }
});

test('the PLAN.md checkpoint line is filled (G6 rider)', () => {
  const plan = readFileSync('PLAN.md', 'utf8');
  assert.match(plan, /final pick: \*\*Readex Pro\*\*/);
  assert.match(plan, /32\.6 KB/);
  assert.ok(!/final pick: _+/.test(plan), 'checkpoint blank still present');
});
