/**
 * One-time, idempotent migration: backfill the `version` frontmatter field on
 * existing catalog entries.
 *
 * Every entry already renders its license-verified release in the body
 * (`<dt>Latest version</dt><dd>…</dd>`), but older builds did not persist it to
 * frontmatter. `build-catalog.ts` now writes `version:` directly, so a full
 * `npm run data:fetch` regen would also produce it — this script just lifts the
 * value already present in the body into frontmatter without re-querying any
 * registry. Safe to re-run: entries that already carry `version:` are skipped.
 *
 * Run: npx tsx scripts/backfill-catalog-version.ts
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'src/content/docs/catalog');
const VERSION_IN_BODY = /<dt>Latest version<\/dt><dd>([^<]*)<\/dd>/;

let updated = 0;
let skippedHas = 0;
let skippedNoVersion = 0;

for (const file of readdirSync(DIR)) {
  if (!file.endsWith('.mdx')) continue;
  const path = join(DIR, file);
  const text = readFileSync(path, 'utf8');

  const fmMatch = text.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) continue;
  const fmBlock = fmMatch[1];

  if (/^version:/m.test(fmBlock)) { skippedHas++; continue; }

  const vMatch = text.match(VERSION_IN_BODY);
  const version = vMatch?.[1]?.trim();
  if (!version || version === 'unknown') { skippedNoVersion++; continue; }

  // Insert after last_release_at (matching build-catalog field order), else after
  // maintenance_status, else at the end of the frontmatter block.
  const lines = fmBlock.split('\n');
  const newLine = `version: ${JSON.stringify(version)}`;
  let at = lines.findIndex((l) => l.startsWith('last_release_at:'));
  if (at < 0) at = lines.findIndex((l) => l.startsWith('maintenance_status:'));
  if (at < 0) at = lines.length - 1;
  lines.splice(at + 1, 0, newLine);

  const newText = text.replace(fmMatch[0], `---\n${lines.join('\n')}\n---`);
  writeFileSync(path, newText, 'utf8');
  updated++;
}

console.log(
  `Backfilled version on ${updated} entr${updated === 1 ? 'y' : 'ies'}; ` +
    `skipped ${skippedHas} already-set, ${skippedNoVersion} with no resolvable version.`,
);
