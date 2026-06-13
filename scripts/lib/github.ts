import { getCached } from './http.ts';

export interface GitHubMeta {
  owner: string;
  repo: string;
  default_branch?: string;
  pushed_at?: string;
  archived?: boolean;
  spdx_id?: string;
  license_path?: string;
  license_commit_sha?: string;
  repo_html_url?: string;
}

export function parseGitHubRepo(url: string | undefined): { owner: string; repo: string } | null {
  if (!url) return null;
  const m = url.match(/github\.com[/:]([^/]+)\/([^/#?]+)/i);
  if (!m) return null;
  return { owner: m[1]!, repo: m[2]!.replace(/\.git$/, '') };
}

/** Fetch repo metadata + the commit that last touched the LICENSE file. */
export async function fetchGitHubMeta(owner: string, repo: string): Promise<GitHubMeta> {
  const meta: GitHubMeta = { owner, repo };
  const repoRes = await getCached(`https://api.github.com/repos/${owner}/${repo}`, { auth: true });
  if (repoRes.ok && repoRes.json && typeof repoRes.json === 'object') {
    const j = repoRes.json as Record<string, unknown>;
    meta.default_branch = j.default_branch as string | undefined;
    meta.pushed_at = j.pushed_at as string | undefined;
    meta.archived = Boolean(j.archived);
    meta.repo_html_url = j.html_url as string | undefined;
    const license = j.license as Record<string, unknown> | null;
    if (license && typeof license.spdx_id === 'string' && license.spdx_id !== 'NOASSERTION') {
      meta.spdx_id = license.spdx_id;
    }
  }

  // Find the commit that last touched a license file (license-at-commit pin).
  for (const path of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'COPYING', 'LICENSE-MIT']) {
    const res = await getCached(
      `https://api.github.com/repos/${owner}/${repo}/commits?per_page=1&path=${path}`,
      { auth: true },
    );
    if (res.ok && Array.isArray(res.json) && res.json.length > 0) {
      const commit = res.json[0] as Record<string, unknown>;
      meta.license_commit_sha = commit.sha as string | undefined;
      meta.license_path = path;
      break;
    }
  }
  // Fallback: HEAD commit of default branch.
  if (!meta.license_commit_sha) {
    const res = await getCached(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`, { auth: true });
    if (res.ok && Array.isArray(res.json) && res.json.length > 0) {
      meta.license_commit_sha = (res.json[0] as Record<string, unknown>).sha as string | undefined;
    }
  }
  return meta;
}

export function maintenanceStatus(isoDate: string | undefined, archived = false): string {
  if (archived) return 'abandoned';
  if (!isoDate) return 'unknown';
  const days = (Date.now() - new Date(isoDate).getTime()) / 86_400_000;
  if (days < 90) return 'active';
  if (days < 365) return 'minimal';
  if (days < 365 * 3) return 'dormant';
  return 'abandoned';
}
