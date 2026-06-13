/**
 * Generate catalog entries for the public datasets parsed from
 * awesomedata/awesome-public-datasets (see scripts/extract via data/datasets.json).
 *
 * Datasets are reference links, not commit-pinned packages, so they're authored
 * with entry_type: dataset (no license-at-commit requirement) under
 * src/content/docs/catalog/datasets/, and surfaced in the catalog explorer as a
 * distinct "Datasets" kind.
 *
 * Run: tsx scripts/build-datasets.ts
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { uniqueSlug } from './slugify.ts';

interface DatasetRow {
  section: string;
  status: 'ok' | 'fixme';
  name: string;
  desc: string;
  url: string;
}

const OUT_DIR = 'src/content/docs/catalog/datasets';

function httpUrl(u: string | undefined): string | undefined {
  if (!u) return undefined;
  try {
    const p = new URL(u);
    return p.protocol === 'http:' || p.protocol === 'https:' ? u : undefined;
  } catch {
    return undefined;
  }
}

function yamlString(v: string): string {
  return JSON.stringify(v);
}

function frontmatter(fields: Record<string, unknown>): string {
  const lines = ['---'];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) {
      if (!v.length) continue;
      lines.push(`${k}: [${v.map((x) => yamlString(String(x))).join(', ')}]`);
    } else if (typeof v === 'string') {
      lines.push(`${k}: ${yamlString(v)}`);
    } else {
      lines.push(`${k}: ${String(v)}`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

function displayUrl(u: string): string {
  return u.replace(/^https?:\/\//, '').replace(/^www\./, '');
}

/** Escape characters that would otherwise be parsed as MDX (JSX tags / expressions). */
function mdxEscape(s: string): string {
  return s.replace(/[<>{}]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '{': '&#123;', '}': '&#125;' })[c]!);
}

function cleanDesc(name: string, desc: string): string {
  // The list packs "Name - description [...]" into one string; recover the tail.
  const tail = desc.replace(name, '').replace(/^\s*-\s*/, '').replace(/\s*\[\.\.\.\]\s*$/, '').trim();
  return tail && tail.length > 4 ? tail : `${name} — a public dataset.`;
}

function main(): void {
  const rows = JSON.parse(readFileSync('data/datasets.json', 'utf8')) as DatasetRow[];
  // Clean rebuild of the datasets subfolder (idempotent).
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const used = new Set<string>();
  let written = 0;
  let skipped = 0;

  for (const row of rows) {
    const url = httpUrl(row.url);
    if (!url) {
      skipped += 1;
      continue;
    }
    const slug = uniqueSlug(`ds-${row.name}`, 'other', used);
    const desc = cleanDesc(row.name, row.desc);
    const fm = frontmatter({
      title: row.name,
      description: desc.slice(0, 160),
      entry_type: 'dataset',
      dependency_name: row.name,
      ecosystem: 'other',
      category: `Dataset · ${row.section}`,
      what_it_does: desc,
      protocols: ['general'],
      homepage_url: url,
      repo_url: url,
      maintenance_status: 'unknown',
      verification_status: 'under_review',
      verified_at: new Date().toISOString().slice(0, 10),
    });

    const body = `${fm}

import { Aside } from '@astrojs/starlight/components';

${mdxEscape(desc)}

<dl class="wcb-meta">
  <dt>Topic</dt><dd>${row.section}</dd>
  <dt>Source</dt><dd><a href="${url}">${displayUrl(url)}</a></dd>
  <dt>Directory</dt><dd><a href="https://github.com/awesomedata/awesome-public-datasets">awesome-public-datasets</a>${row.status === 'fixme' ? ' (upstream flagged for review)' : ''}</dd>
</dl>

<Aside type="note" title="A dataset, not a package">
This is an external public dataset indexed from
[awesome-public-datasets](https://github.com/awesomedata/awesome-public-datasets),
included as a resource for builders. Unlike software entries it isn't license-pinned
to a commit — verify the dataset's own license and terms at the source before use.
</Aside>
`;

    writeFileSync(join(OUT_DIR, `${slug}.mdx`), body, 'utf8');
    written += 1;
  }

  console.log(`datasets: wrote ${written} entries to ${OUT_DIR} (${skipped} skipped: no http url)`);
}

main();
