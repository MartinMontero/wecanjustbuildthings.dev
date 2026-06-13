import { getCached } from './http.ts';

export interface GitLabMeta {
  path: string;
  default_branch?: string;
  last_activity_at?: string;
  spdx_id?: string;
  commit_sha?: string;
}

export function parseGitLabRepo(url: string | undefined): string | null {
  if (!url) return null;
  const m = url.match(/gitlab\.com\/([^?#]+)/i);
  if (!m) return null;
  let path = m[1]!.replace(/\.git$/, '').replace(/\/+$/, '');
  // Strip GitLab's "/-/tree|blob|commit|…" deep-link suffix to leave group/project.
  const dash = path.indexOf('/-/');
  if (dash >= 0) path = path.slice(0, dash);
  return path || null;
}

const KEY_TO_SPDX: Record<string, string> = {
  mit: 'MIT',
  'apache-2.0': 'Apache-2.0',
  'agpl-3.0': 'AGPL-3.0-or-later',
  'gpl-3.0': 'GPL-3.0-or-later',
  'gpl-2.0': 'GPL-2.0-or-later',
  'lgpl-3.0': 'LGPL-3.0-or-later',
  'bsd-3-clause': 'BSD-3-Clause',
  'bsd-2-clause': 'BSD-2-Clause',
  'mpl-2.0': 'MPL-2.0',
  unlicense: 'Unlicense',
  isc: 'ISC',
};

export async function fetchGitLabMeta(path: string): Promise<GitLabMeta> {
  const meta: GitLabMeta = { path };
  const enc = encodeURIComponent(path);
  const proj = await getCached(`https://gitlab.com/api/v4/projects/${enc}?license=true`);
  if (proj.ok && proj.json && typeof proj.json === 'object') {
    const j = proj.json as Record<string, unknown>;
    meta.default_branch = j.default_branch as string | undefined;
    meta.last_activity_at = j.last_activity_at as string | undefined;
    const license = j.license as Record<string, unknown> | null;
    const key = license?.key as string | undefined;
    if (key) meta.spdx_id = KEY_TO_SPDX[key] ?? key;
  }
  if (meta.default_branch) {
    const commits = await getCached(
      `https://gitlab.com/api/v4/projects/${enc}/repository/commits?ref_name=${meta.default_branch}&per_page=1`,
    );
    if (commits.ok && Array.isArray(commits.json) && commits.json.length > 0) {
      meta.commit_sha = (commits.json[0] as Record<string, unknown>).id as string | undefined;
    }
  }
  return meta;
}
