/**
 * maintenance-checker: re-fetch each catalog entry's latest activity and
 * reclassify its maintenance status. Writes a markdown report and sets a
 * non-zero exit code only on fetch errors (status drift is reported, not fatal —
 * the weekly workflow opens a PR with the diff).
 *
 * Run: tsx scripts/maintenance-check.ts [--catalog <dir>]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { readDocEntries } from '../enforcement/frontmatter.ts';
import { fetchRegistry } from './lib/registries.ts';
import { fetchGitHubMeta, maintenanceStatus, parseGitHubRepo } from './lib/github.ts';
import { fetchGitLabMeta, parseGitLabRepo } from './lib/gitlab.ts';
import type { Ecosystem } from '../enforcement/types.ts';

const catalogDir = process.argv.includes('--catalog')
  ? process.argv[process.argv.indexOf('--catalog') + 1]!
  : 'src/content/docs/catalog';

interface Row {
  slug: string;
  name: string;
  recorded: string;
  current: string;
  lastActivity?: string;
}

async function main(): Promise<void> {
  const entries = readDocEntries(catalogDir).filter((e) =>
    ['tool', 'framework', 'library', 'service', 'protocol'].includes(String(e.frontmatter.entry_type)),
  );
  const rows: Row[] = [];

  for (const e of entries) {
    const name = String(e.frontmatter.dependency_name ?? e.slug);
    const ecosystem = e.frontmatter.ecosystem as Ecosystem | undefined;
    const recorded = String(e.frontmatter.maintenance_status ?? 'unknown');
    let lastActivity: string | undefined;
    let archived = false;

    const repoUrl = e.frontmatter.repo_url as string | undefined;
    const gh = parseGitHubRepo(repoUrl);
    const gl = gh ? null : parseGitLabRepo(repoUrl);
    if (gh) {
      const meta = await fetchGitHubMeta(gh.owner, gh.repo);
      lastActivity = meta.pushed_at;
      archived = Boolean(meta.archived);
    } else if (gl) {
      lastActivity = (await fetchGitLabMeta(gl)).last_activity_at;
    }
    // Registry fallback only for real package ecosystems (never for hosted apps).
    if (!lastActivity && ecosystem && ecosystem !== 'other') {
      lastActivity = (await fetchRegistry(name, ecosystem)).publishedAt;
    }
    const current = maintenanceStatus(lastActivity, archived);
    rows.push({ slug: e.slug, name, recorded, current, lastActivity });
  }

  const changed = rows.filter((r) => r.current !== 'unknown' && r.current !== r.recorded);
  const lines = [
    '# Maintenance check report',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Entries checked: ${rows.length}. Status changes: ${changed.length}.`,
    '',
    '| Entry | Recorded | Current | Last activity |',
    '|---|---|---|---|',
    ...rows.map((r) => `| ${r.name} | ${r.recorded} | ${r.current}${r.current !== r.recorded ? ' ⚠️' : ''} | ${r.lastActivity ?? '—'} |`),
  ];
  mkdirSync('reports', { recursive: true });
  writeFileSync('reports/maintenance-check.md', `${lines.join('\n')}\n`);
  console.log(lines.join('\n'));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
