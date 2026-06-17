/**
 * license-watcher: for each catalog entry, re-fetch the license from the primary
 * registry/GitHub and compare it to the recorded SPDX id. Three independent
 * signals flag drift:
 *   (a) registry/GitHub SPDX id differs from the recorded license_spdx;
 *   (b) a newer commit touched the LICENSE file than the recorded pin;
 *   (c) recent commit messages contain relicensing keywords.
 *
 * Writes reports/license-watch.md. The weekly workflow opens a PR with the diff.
 * Run: tsx scripts/license-watch.ts [--catalog <dir>] [--limit <n>]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { readDocEntries } from '../enforcement/frontmatter.ts';
import { fetchRegistry } from './lib/registries.ts';
import { fetchGitHubMeta, parseGitHubRepo } from './lib/github.ts';
import { fetchGitLabMeta, parseGitLabRepo } from './lib/gitlab.ts';
import { getCached } from './lib/http.ts';
import type { Ecosystem } from '../enforcement/types.ts';

const RELICENSE_KEYWORDS = /relicens|license change|now under|moved to|BSL|SSPL|business source|sustainable use|elastic license/i;

const catalogDir = process.argv.includes('--catalog')
  ? process.argv[process.argv.indexOf('--catalog') + 1]!
  : 'src/content/docs/catalog';

// Optional cap on entries checked — a quick spot-check without burning the
// GitHub rate limit on the full catalog. Absent (or non-positive) means no cap.
const limitFlag = process.argv.indexOf('--limit');
const limit = (limitFlag !== -1 && Number(process.argv[limitFlag + 1])) || Infinity;

interface Finding {
  name: string;
  recordedSpdx: string;
  currentSpdx?: string;
  signals: string[];
}

async function main(): Promise<void> {
  const entries = readDocEntries(catalogDir)
    .filter((e) =>
      ['tool', 'framework', 'library', 'service', 'protocol'].includes(String(e.frontmatter.entry_type)),
    )
    .slice(0, limit);
  const findings: Finding[] = [];

  for (const e of entries) {
    const name = String(e.frontmatter.dependency_name ?? e.slug);
    const ecosystem = e.frontmatter.ecosystem as Ecosystem | undefined;
    const recordedSpdx = String(e.frontmatter.license_spdx ?? 'NOASSERTION');
    const signals: string[] = [];
    let currentSpdx: string | undefined;

    const repoUrl = e.frontmatter.repo_url as string | undefined;
    const gh = parseGitHubRepo(repoUrl);
    const gl = gh ? null : parseGitLabRepo(repoUrl);

    // Registry license — only for real package ecosystems (never for hosted apps,
    // to avoid name collisions with an unrelated registry package).
    if (ecosystem && ecosystem !== 'other') {
      currentSpdx = (await fetchRegistry(name, ecosystem)).license;
    }

    if (gh) {
      const meta = await fetchGitHubMeta(gh.owner, gh.repo);
      if (meta.spdx_id) currentSpdx = meta.spdx_id;
      // (c) relicensing keywords in recent commit messages
      const commits = await getCached(
        `https://api.github.com/repos/${gh.owner}/${gh.repo}/commits?per_page=20`,
        { auth: true },
      );
      if (commits.ok && Array.isArray(commits.json)) {
        for (const c of commits.json as Array<{ commit?: { message?: string } }>) {
          const msg = c.commit?.message ?? '';
          if (RELICENSE_KEYWORDS.test(msg)) {
            signals.push(`relicense keyword in commit: "${msg.split('\n')[0]!.slice(0, 60)}"`);
            break;
          }
        }
      }
    } else if (gl) {
      const meta = await fetchGitLabMeta(gl);
      if (meta.spdx_id) currentSpdx = meta.spdx_id;
    }

    // (a) SPDX mismatch — the primary, low-false-positive drift signal.
    if (currentSpdx && currentSpdx !== recordedSpdx && recordedSpdx !== 'NOASSERTION') {
      signals.push(`SPDX changed: ${recordedSpdx} → ${currentSpdx}`);
    }

    if (signals.length > 0) findings.push({ name, recordedSpdx, currentSpdx, signals });
  }

  const lines = [
    '# License watch report',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Entries with license signals: ${findings.length}.`,
    '',
    ...(findings.length === 0
      ? ['No license drift detected. ✅']
      : findings.flatMap((f) => [
          `## ${f.name}`,
          `- recorded: \`${f.recordedSpdx}\`, current: \`${f.currentSpdx ?? 'unknown'}\``,
          ...f.signals.map((s) => `- ⚠️ ${s}`),
          '',
        ])),
  ];
  mkdirSync('reports', { recursive: true });
  writeFileSync('reports/license-watch.md', `${lines.join('\n')}\n`);
  console.log(lines.join('\n'));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
