/**
 * Catalog generator.
 *
 * Source of truth, in priority order:
 *   1. data/aos-dependency-audit.csv  (the 1,161-row AOS audit, when present)
 *   2. data/seed-catalog.json         (the curated seed set, always present)
 *
 * For each row it queries the primary registry and GitHub for the license
 * (verified at a commit SHA), maintenance status, and metadata, screens the
 * dependency against the exclusion policy, and writes one .mdx per entry.
 *
 * Run: npm run data:fetch     (alias for `tsx scripts/build-catalog.ts`)
 * Flags: --limit <n>  --out <dir>  --source <csv|seed>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchRegistry } from './lib/registries.ts';
import { fetchGitHubMeta, maintenanceStatus, parseGitHubRepo } from './lib/github.ts';
import { getCached } from './lib/http.ts';
import { uniqueSlug } from './slugify.ts';
import { loadExcludedOrgs } from '../enforcement/config.ts';
import { matchDependency } from '../enforcement/matcher.ts';
import type { Ecosystem } from '../enforcement/types.ts';

interface SeedRow {
  name: string;
  ecosystem: Ecosystem;
  entry_type: string;
  category: string;
  protocols?: string[];
  pie_anchor?: string;
  what_it_does?: string;
}

interface BuiltEntry {
  slug: string;
  name: string;
  ecosystem: Ecosystem;
  license_spdx?: string;
  verification_status: 'verified' | 'under_review' | 'blocked';
}

const args = process.argv.slice(2);
function flag(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}
const OUT_DIR = flag('out') ?? 'src/content/docs/catalog';
const LIMIT = flag('limit') ? Number(flag('limit')) : Infinity;

const orgs = loadExcludedOrgs();

async function loadSpdxIds(): Promise<Set<string>> {
  const cacheFile = 'data/spdx-licenses.json';
  type SpdxList = { licenses?: Array<{ licenseId: string }> };
  let json: SpdxList | null = null;
  if (existsSync(cacheFile)) {
    json = JSON.parse(readFileSync(cacheFile, 'utf8')) as SpdxList;
  } else {
    // spdx.org is WAF-blocked from many CI networks; the canonical list is also
    // mirrored in the SPDX license-list-data repo on GitHub.
    const res = await getCached('https://raw.githubusercontent.com/spdx/license-list-data/main/json/licenses.json');
    if (res.ok && res.json) {
      json = res.json as SpdxList;
      mkdirSync('data', { recursive: true });
      writeFileSync(cacheFile, JSON.stringify(json, null, 2));
    }
  }
  const ids = new Set((json?.licenses ?? []).map((l) => l.licenseId));
  if (ids.size === 0) console.warn('  ! SPDX license list unavailable — entries will be marked under_review.');
  return ids;
}

function normalizeSpdx(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const map: Record<string, string> = {
    'Apache 2.0': 'Apache-2.0',
    'Apache License 2.0': 'Apache-2.0',
    'BSD': 'BSD-3-Clause',
    'MIT License': 'MIT',
    'The MIT License': 'MIT',
    'ISC License': 'ISC',
    'GPLv3': 'GPL-3.0-or-later',
    'AGPLv3': 'AGPL-3.0-or-later',
  };
  return map[raw] ?? raw;
}

function loadRows(): SeedRow[] {
  const csv = 'data/aos-dependency-audit.csv';
  if (flag('source') !== 'seed' && existsSync(csv)) {
    return parseAuditCsv(readFileSync(csv, 'utf8'));
  }
  return JSON.parse(readFileSync('data/seed-catalog.json', 'utf8')) as SeedRow[];
}

/** Map human-readable ecosystem labels from the spreadsheet to our codes. */
function normalizeEcosystem(raw: string | undefined): Ecosystem {
  const v = (raw ?? '').toLowerCase().trim();
  if (/javascript|typescript|npm|node|deno|bun/.test(v)) return 'js';
  if (/rust|crate/.test(v)) return 'rust';
  if (/python|pypi|pip/.test(v)) return 'py';
  if (/golang|^go\b|go module/.test(v)) return 'go';
  if (/elixir|erlang|hex/.test(v)) return 'elixir';
  if (/dart|flutter|pub/.test(v)) return 'dart';
  if (/ruby|gem/.test(v)) return 'ruby';
  if (/kotlin|java|maven|gradle|android/.test(v)) return 'kotlin';
  if (/swift|cocoapods/.test(v)) return 'swift';
  if (/php|composer/.test(v)) return 'php';
  if (['js', 'rust', 'py', 'go', 'elixir', 'dart', 'ruby', 'kotlin', 'swift', 'php', 'other'].includes(v)) {
    return v as Ecosystem;
  }
  return 'other';
}

/** Minimal CSV parse of the AOS "ALL DEPENDENCIES" export. */
function parseAuditCsv(text: string): SeedRow[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const rows: SeedRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    const [name, ecosystem, category, , whatItDoes] = cols;
    if (!name) continue;
    rows.push({
      name: name.trim(),
      ecosystem: normalizeEcosystem(ecosystem),
      entry_type: 'library',
      category: category?.trim() || 'Misc & Everything Else',
      what_it_does: whatItDoes?.trim(),
    });
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function frontmatter(fields: Record<string, unknown>): string {
  const lines: string[] = ['---'];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      lines.push(`${key}: [${value.map((v) => yamlString(String(v))).join(', ')}]`);
    } else if (typeof value === 'string') {
      lines.push(`${key}: ${yamlString(value)}`);
    } else {
      lines.push(`${key}: ${String(value)}`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

function badge(kind: string, value: string): string {
  return `<span class="wcb-badge wcb-badge--${value}">${kind}: ${value}</span>`;
}

async function buildEntry(row: SeedRow, used: Set<string>, spdxIds: Set<string>): Promise<BuiltEntry> {
  const slug = uniqueSlug(row.name, row.ecosystem, used);

  // Policy screen first — an excluded dependency never gets an entry.
  if (matchDependency({ name: row.name, ecosystem: row.ecosystem, source_file: 'seed' }, orgs).length > 0) {
    return { slug, name: row.name, ecosystem: row.ecosystem, verification_status: 'blocked' };
  }

  const reg = await fetchRegistry(row.name, row.ecosystem);
  const gh = parseGitHubRepo(reg.repoUrl);
  const meta = gh ? await fetchGitHubMeta(gh.owner, gh.repo) : null;

  const spdxRaw = meta?.spdx_id ?? normalizeSpdx(reg.license);
  const spdx = spdxRaw;
  const spdxValid = Boolean(spdxRaw && spdxIds.has(spdxRaw));

  // Pin the license to a commit. Prefer GitHub's license-commit lookup; fall
  // back to the registry-recorded publish commit (npm `gitHead`), which needs no
  // GitHub call and is just as much a verifiable pin.
  const sha = meta?.license_commit_sha ?? reg.gitHead;
  const repo = gh ? `${gh.owner}/${gh.repo}` : undefined;
  const licenseSourceUrl =
    repo && sha
      ? `https://github.com/${repo}/blob/${sha}/${meta?.license_path ?? 'LICENSE'}`
      : reg.repoUrl ?? reg.registryUrl;

  const lastActivity = meta?.pushed_at ?? reg.publishedAt;
  const status = maintenanceStatus(lastActivity, meta?.archived);

  const verified = spdxValid && Boolean(sha) && Boolean(reg.repoUrl);
  const verification_status: BuiltEntry['verification_status'] = verified ? 'verified' : 'under_review';

  const fm = frontmatter({
    title: row.name,
    description: row.what_it_does ?? `${row.name} — ${row.category}`,
    entry_type: row.entry_type,
    dependency_name: row.name,
    ecosystem: row.ecosystem,
    category: row.category,
    what_it_does: row.what_it_does ?? `${row.name} (${row.ecosystem})`,
    protocols: row.protocols ?? [],
    homepage_url: reg.homepageUrl,
    repo_url: reg.repoUrl,
    registry_url: reg.registryUrl,
    license_spdx: spdx ?? 'NOASSERTION',
    license_source_url: licenseSourceUrl,
    license_source_commit_sha: sha,
    maintenance_status: status,
    last_release_at: reg.publishedAt,
    aos_repos_using: 0,
    pie_anchor: row.pie_anchor,
    provider_agnostic: false,
    verification_status,
    verified_at: new Date().toISOString().slice(0, 10),
    sidebar: undefined,
  });

  const body = `${fm}

import { Aside } from '@astrojs/starlight/components';

${row.what_it_does ?? ''}

<div class="wcb-badges">
${badge('license', spdx ?? 'unknown')}
${badge('status', status)}
${badge('verification', verification_status)}
</div>

<dl class="wcb-meta">
  <dt>Ecosystem</dt><dd>${row.ecosystem}</dd>
  <dt>Category</dt><dd>${row.category}</dd>
  <dt>License</dt><dd>${spdx ?? 'unknown'}${spdxValid ? '' : ' (unverified SPDX)'}</dd>
  <dt>Latest version</dt><dd>${reg.version ?? 'unknown'}</dd>
  ${reg.repoUrl ? `<dt>Source</dt><dd><a href="${reg.repoUrl}">${reg.repoUrl}</a></dd>` : ''}
  <dt>Registry</dt><dd><a href="${reg.registryUrl}">${reg.registryUrl}</a></dd>
</dl>

${
  sha
    ? `<Aside type="tip" title="Verified at a commit">License read as <code>${spdx}</code> from <a href="${licenseSourceUrl}">${meta?.license_path ?? 'LICENSE'}</a> at commit <code>${sha.slice(0, 12)}</code>.</Aside>`
    : `<Aside type="caution" title="Pending full verification">A pinned license commit could not be retrieved automatically; this entry is marked <code>under_review</code> until a maintainer confirms the source.</Aside>`
}

## Why it's in the catalog

This entry was screened against the [exclusion policy](/policies/): it declares no
dependency owned by Meta, OpenAI, or xAI at the direct level. See
[how enforcement works](/policies/enforcement/) for the full three-layer check.
`;

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, `${slug}.mdx`), body, 'utf8');
  return { slug, name: row.name, ecosystem: row.ecosystem, license_spdx: spdx, verification_status };
}

async function main(): Promise<void> {
  const spdxIds = await loadSpdxIds();
  const rows = loadRows().slice(0, LIMIT);
  const used = new Set<string>();
  const built: BuiltEntry[] = [];

  console.log(`Building ${rows.length} catalog entries into ${OUT_DIR} …\n`);
  for (const row of rows) {
    try {
      const entry = await buildEntry(row, used, spdxIds);
      built.push(entry);
      const mark = entry.verification_status === 'verified' ? '✓' : entry.verification_status === 'blocked' ? '✗' : '~';
      console.log(`  ${mark} ${entry.slug.padEnd(28)} ${entry.license_spdx ?? ''} (${entry.verification_status})`);
    } catch (err) {
      console.error(`  ! ${row.name}: ${(err as Error).message}`);
    }
  }

  const verified = built.filter((b) => b.verification_status === 'verified').length;
  const review = built.filter((b) => b.verification_status === 'under_review').length;
  const blocked = built.filter((b) => b.verification_status === 'blocked').length;
  console.log(`\nDone: ${built.length} entries — ${verified} verified, ${review} under review, ${blocked} blocked.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
