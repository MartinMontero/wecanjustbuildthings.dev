#!/usr/bin/env node
/**
 * catalog-count.mjs — the ONE authoritative catalog count (BACKLOG E6).
 *
 * Counts catalog entries from the content tree exactly the way the built site
 * does (src/pages/catalog.json.ts): any docs entry under
 * src/content/docs/catalog/ whose frontmatter `entry_type` is in
 * {tool, framework, library, service, protocol, dataset}. Writes the figure to
 * data/catalog-count.json so docs can cite a generated number with a
 * generation date instead of a hand-typed literal (which drifted three ways:
 * CLAUDE.md 1,355 / TRANSLATIONS.md ~2,182 / 1,360 on disk).
 *
 * Usage:  node scripts/catalog-count.mjs        # writes data/catalog-count.json
 *         node scripts/catalog-count.mjs --check # exits 1 if the file is stale
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CATALOG_DIR = 'src/content/docs/catalog';
const OUT = 'data/catalog-count.json';
const INDEXED_TYPES = new Set(['tool', 'framework', 'library', 'service', 'protocol', 'dataset']);
const TOOL_TYPES = new Set(['tool', 'framework', 'library', 'service', 'protocol']);

function* mdxFiles(dir) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) yield* mdxFiles(p);
    else if (name.name.endsWith('.mdx') && name.name !== 'index.mdx') yield p;
  }
}

function entryType(path) {
  const src = readFileSync(path, 'utf8');
  const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return null;
  const m = fm[1].match(/^entry_type:\s*"?([a-z_]+)"?\s*$/m);
  return m ? m[1] : null;
}

const byType = {};
let total = 0;
for (const file of mdxFiles(CATALOG_DIR)) {
  const t = entryType(file);
  if (!t || !INDEXED_TYPES.has(t)) continue;
  byType[t] = (byType[t] ?? 0) + 1;
  total++;
}
const tools = Object.entries(byType)
  .filter(([t]) => TOOL_TYPES.has(t))
  .reduce((n, [, c]) => n + c, 0);

const figure = {
  generated: new Date().toISOString().slice(0, 10),
  source: 'node scripts/catalog-count.mjs (entry_type frontmatter over src/content/docs/catalog/)',
  total,
  tools,
  datasets: byType.dataset ?? 0,
  byType,
};

if (process.argv.includes('--check')) {
  const cur = JSON.parse(readFileSync(OUT, 'utf8'));
  if (cur.total !== total || cur.tools !== tools) {
    console.error(`catalog count stale: file says total=${cur.total} tools=${cur.tools}, tree has total=${total} tools=${tools} — run node scripts/catalog-count.mjs`);
    process.exit(1);
  }
  console.log(`catalog count current: total=${total} tools=${tools}`);
} else {
  writeFileSync(OUT, JSON.stringify(figure, null, 2) + '\n');
  console.log(`wrote ${OUT}: total=${total} tools=${tools} datasets=${figure.datasets}`);
}
