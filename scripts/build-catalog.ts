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
import { fetchRegistry, type RegistryInfo } from './lib/registries.ts';
import { fetchGitHubMeta, maintenanceStatus, parseGitHubRepo } from './lib/github.ts';
import { getCached } from './lib/http.ts';
import { uniqueSlug } from './slugify.ts';
import { loadExcludedOrgs } from '../enforcement/config.ts';
import { matchDependency, matchGitHubOwner } from '../enforcement/matcher.ts';
import type { Ecosystem } from '../enforcement/types.ts';

interface SeedRow {
  name: string;
  ecosystem: Ecosystem;
  entry_type: string;
  category: string;
  protocols?: string[];
  pie_anchor?: string;
  what_it_does?: string;
  aos_repos_using?: number;
  aos_repos_list?: string[];
  /** When set, the entry is resolved from this GitHub/GitLab repo, not a registry. */
  source_url?: string;
  /** A declared-but-unverified license string (e.g. from the agentic sheet). */
  license_hint?: string;
}

/** Category → navigation metadata (Part 3 Step 6 PIE mapping + protocol family). */
function categoryMeta(category: string): { protocols: string[]; pie_anchor: string } {
  const c = category.toLowerCase();
  if (c.includes('nostr') || c.includes('lightning') || c.includes('bitcoin')) {
    return { protocols: ['nostr', 'lightning'], pie_anchor: '§4 Cooking → Recipes' };
  }
  if (c.includes('security') || c.includes('privacy')) {
    return { protocols: ['general'], pie_anchor: '§4 Cooking → Catalysts / Pressure' };
  }
  if (c.includes('auth') || c.includes('identity') || c.includes('keys')) {
    return { protocols: ['general'], pie_anchor: '§4 Cooking → Catalysts' };
  }
  if (c.includes('monitoring') || c.includes('observability') || c.includes('collaboration') || c.includes('comms')) {
    return { protocols: ['general'], pie_anchor: '§4 Cooking → Pressure' };
  }
  if (
    c.includes('dev environment') ||
    c.includes('tooling') ||
    c.includes('hosting') ||
    c.includes('deploy') ||
    c.includes('database') ||
    c.includes('storage') ||
    c.includes('languages') ||
    c.includes('runtimes') ||
    c.includes('ci-cd') ||
    c.includes('version control')
  ) {
    return { protocols: ['general'], pie_anchor: '§4 Cooking → The Oven' };
  }
  if (c.includes('misc') || c.includes('planning') || c.includes('design')) {
    return { protocols: ['general'], pie_anchor: '§3 Kitchen Prep' };
  }
  // Frameworks & Libraries, Testing & QA, AI & Agents, default
  return { protocols: ['general'], pie_anchor: '§4 Cooking → Recipes' };
}

/** Validate an SPDX id OR a simple SPDX expression ("MIT OR Apache-2.0",
 *  "(MIT OR Apache-2.0) AND BSD-3-Clause") — every license token must be known. */
function isValidSpdx(raw: string | undefined, ids: Set<string>): boolean {
  if (!raw) return false;
  if (ids.has(raw)) return true;
  const tokens = raw
    .replace(/[()]/g, ' ')
    .split(/\s+(?:OR|AND|WITH)\s+/i)
    .map((t) => t.trim().replace(/\+$/, '')) // strip "or-later" + suffix for the check
    .filter(Boolean);
  if (tokens.length < 2) return false;
  return tokens.every((t) => ids.has(t) || ids.has(`${t}+`));
}

/** Infer protocol families from a tool's name, category, and description so
 *  e.g. `@atproto/api` (in "Frameworks & Libraries") is still tagged `atproto`. */
function inferProtocols(name: string, category: string, desc: string | undefined): string[] {
  const hay = `${name} ${category} ${desc ?? ''}`.toLowerCase();
  const set = new Set<string>();
  if (/nostr|\bnip-?\d|nostrify|\bndk\b|nip-?\d{2}/.test(hay)) set.add('nostr');
  if (/atproto|at protocol|bluesky|@atproto|\bbsky\b|lexicon/.test(hay)) set.add('atproto');
  if (/lightning|lnurl|\blnd\b|\bldk\b|bolt11|breez|nostr wallet connect|\bnwc\b|\bcln\b/.test(hay)) set.add('lightning');
  if (/cashu|\becash\b/.test(hay)) set.add('cashu');
  if (set.size === 0) set.add('general');
  return [...set];
}

/** Clean a declared license hint ("MIT-family", "MIT (likely)", "Unverified") → SPDX-ish or undefined. */
function cleanLicenseHint(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const v = raw.replace(/\s*\(likely\)/i, '').replace(/-family$/i, '').replace(/-licensed$/i, '').trim();
  if (!v || /^(unverified|unknown|n\/?a|tbd|none)$/i.test(v)) return undefined;
  return v;
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
  type SpdxList = { licenses?: Array<{ licenseId: string; isDeprecatedLicenseId?: boolean }> };
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
  // Validate only against current, non-deprecated SPDX ids so a deprecated id
  // (e.g. "GPL-3.0") is not accepted as canonical.
  const ids = new Set((json?.licenses ?? []).filter((l) => !l.isDeprecatedLicenseId).map((l) => l.licenseId));
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
    // Deprecated SPDX ids → canonical replacements.
    'GPL-3.0': 'GPL-3.0-or-later',
    'GPL-2.0': 'GPL-2.0-or-later',
    'LGPL-3.0': 'LGPL-3.0-or-later',
    'LGPL-2.1': 'LGPL-2.1-or-later',
    'AGPL-3.0': 'AGPL-3.0-or-later',
  };
  return map[raw] ?? raw;
}

function loadRows(): SeedRow[] {
  if (flag('source') === 'seed') {
    return JSON.parse(readFileSync('data/seed-catalog.json', 'utf8')) as SeedRow[];
  }
  const rows: SeedRow[] = [];
  const onlyAgentic = flag('source') === 'agentic';
  const onlyAos = flag('source') === 'aos';

  const csv = 'data/aos-dependency-audit.csv';
  if (!onlyAgentic && existsSync(csv)) rows.push(...parseAuditCsv(readFileSync(csv, 'utf8')));
  if (!onlyAos) rows.push(...loadAgentic());

  if (rows.length === 0) rows.push(...(JSON.parse(readFileSync('data/seed-catalog.json', 'utf8')) as SeedRow[]));
  return rows;
}

interface AgenticTool {
  name: string;
  category_label?: string;
  subcategory?: string;
  language?: string;
  license_hint?: string;
  backer?: string;
  source_url?: string;
  description?: string;
}

function loadAgentic(): SeedRow[] {
  const file = 'data/agentic-tools.json';
  if (!existsSync(file)) return [];
  const tools = JSON.parse(readFileSync(file, 'utf8')) as AgenticTool[];
  return tools.map((t) => {
    const detail = [t.category_label, t.subcategory].filter(Boolean).join(' / ');
    return {
      name: t.name,
      ecosystem: normalizeEcosystem(t.language),
      entry_type: 'tool',
      category: 'AI & Agents',
      what_it_does: t.description || `${t.name}${detail ? ` — ${detail}` : ''}`,
      protocols: inferProtocols(t.name, `AI & Agents ${detail}`, t.description),
      pie_anchor: '§4 Cooking → Recipes',
      source_url: t.source_url || undefined,
      license_hint: cleanLicenseHint(t.license_hint),
    };
  });
}

function parseReposUsing(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Math.round(Number.parseFloat(raw));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function parseUsedIn(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && s !== '...' && s !== '…')
    .slice(0, 20);
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

/** CSV parse of the AOS "ALL DEPENDENCIES" export (Dependency, Ecosystem,
 *  Category, Repos Using, What It Does, Used In). */
function parseAuditCsv(text: string): SeedRow[] {
  const records = parseCsvRecords(text);
  const rows: SeedRow[] = [];
  for (const cols of records.slice(1)) {
    const [name, ecosystem, category, reposUsing, whatItDoes, usedIn] = cols;
    if (!name || !name.trim()) continue;
    const cat = category?.trim() || 'Misc & Everything Else';
    const meta = categoryMeta(cat);
    rows.push({
      name: name.trim(),
      ecosystem: normalizeEcosystem(ecosystem),
      entry_type: 'library',
      category: cat,
      what_it_does: whatItDoes?.trim(),
      aos_repos_using: parseReposUsing(reposUsing),
      aos_repos_list: parseUsedIn(usedIn),
      protocols: inferProtocols(name, cat, whatItDoes),
      pie_anchor: meta.pie_anchor,
    });
  }
  return rows;
}

/** RFC-4180-ish CSV parser that correctly handles quoted fields spanning
 *  multiple lines (common in a human-maintained "What It Does" column). */
function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      records.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    records.push(row);
  }
  return records;
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function frontmatter(fields: Record<string, unknown>): string {
  const lines: string[] = ['---'];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === '') continue;
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

  // Agentic rows carry a repo URL directly; AOS rows resolve via the registry.
  const reg: RegistryInfo = row.source_url
    ? { repoUrl: row.source_url, license: row.license_hint }
    : await fetchRegistry(row.name, row.ecosystem);
  const gh = parseGitHubRepo(reg.repoUrl);

  // Ownership screen — strongest signal when we have the repo URL: a repo owned
  // by an excluded org is blocked regardless of its package name.
  if (gh) {
    const ownerHit = matchGitHubOwner(gh.owner, orgs);
    if (ownerHit) {
      console.warn(`  ✗ ${slug}: blocked — repo owner "${gh.owner}" → ${ownerHit.org_key}`);
      return { slug, name: row.name, ecosystem: row.ecosystem, verification_status: 'blocked' };
    }
  }
  // Name/coordinate screen (catches registry packages owned by excluded orgs).
  if (matchDependency({ name: row.name, ecosystem: row.ecosystem, source_file: 'seed' }, orgs).length > 0) {
    console.warn(`  ✗ ${slug}: blocked — package name matches excluded org`);
    return { slug, name: row.name, ecosystem: row.ecosystem, verification_status: 'blocked' };
  }

  const meta = gh ? await fetchGitHubMeta(gh.owner, gh.repo) : null;

  // A catalog entry needs at least one primary source URL (the schema requires
  // license_source_url). Without any, we can't author a valid entry — skip and
  // log rather than write something broken.
  if (!reg.repoUrl && !reg.registryUrl && !reg.homepageUrl) {
    console.warn(`  ~ ${slug}: skipped — no primary source URL (ecosystem ${row.ecosystem})`);
    return { slug, name: row.name, ecosystem: row.ecosystem, verification_status: 'under_review' };
  }

  const spdxRaw = meta?.spdx_id ?? normalizeSpdx(reg.license);
  const spdx = spdxRaw;
  const spdxValid = isValidSpdx(spdxRaw, spdxIds);

  const repo = gh ? `${gh.owner}/${gh.repo}` : undefined;
  // A license is "read at a commit" only when GitHub confirmed both the LICENSE
  // path and the commit that touched it. The npm `gitHead` fallback is a publish
  // commit, not a verified LICENSE-file read — pin to it but describe it honestly.
  const verifiedBlob = Boolean(repo && meta?.license_path && meta?.license_commit_sha);
  const sha = meta?.license_commit_sha ?? reg.gitHead;
  const licenseSourceUrl = verifiedBlob
    ? `https://github.com/${repo}/blob/${meta!.license_commit_sha}/${meta!.license_path}`
    : repo && sha
      ? `https://github.com/${repo}/tree/${sha}`
      : (reg.repoUrl ?? reg.registryUrl);

  const lastActivity = meta?.pushed_at ?? reg.publishedAt;
  const status = maintenanceStatus(lastActivity, meta?.archived);

  // "verified" requires a valid SPDX id, a commit pin, and a source repo.
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
    aos_repos_using: row.aos_repos_using ?? 0,
    aos_repos_list: row.aos_repos_list ?? [],
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
  ${reg.registryUrl ? `<dt>Registry</dt><dd><a href="${reg.registryUrl}">${reg.registryUrl}</a></dd>` : ''}
</dl>

${
  verifiedBlob
    ? `<Aside type="tip" title="Verified at a commit">License read as <code>${spdx}</code> from <a href="${licenseSourceUrl}">${meta!.license_path}</a> at commit <code>${sha!.slice(0, 12)}</code>.</Aside>`
    : sha
      ? `<Aside type="tip" title="Pinned to a publish commit">Registry declares <code>${spdx}</code>; pinned to <a href="${licenseSourceUrl}">commit <code>${sha.slice(0, 12)}</code></a>. A maintainer pass with a GitHub token can upgrade this to a verified LICENSE-file read.</Aside>`
      : `<Aside type="caution" title="Pending full verification">A pinned license commit could not be retrieved automatically; this entry is <code>under_review</code> until a maintainer confirms the source.</Aside>`
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

/** Hand-authored catalog files the generator must never overwrite. */
const PROTECTED_SLUGS = ['index', 'shakespeare'];

async function main(): Promise<void> {
  const spdxIds = await loadSpdxIds();
  const rows = loadRows().slice(0, LIMIT);
  // Reserve protected slugs so uniqueSlug never reuses them for a generated entry.
  const used = new Set<string>(PROTECTED_SLUGS);
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
