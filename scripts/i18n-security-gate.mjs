/**
 * i18n-security-gate.mjs — the two-review gate for security-sensitive pages.
 *
 * Contract (CLAUDE.md "Security-sensitive pages"): a PR that touches a page
 * whose ENGLISH SOURCE frontmatter carries `security_sensitive: true` — or a
 * locale variant (es/ar) of one — must carry TWO distinct approving reviews
 * before this check passes. Fails closed: the flag is honored whether it
 * appears on the BASE or the HEAD version of the source (so a PR that removes
 * the flag is still gated), and a changed docs path whose content cannot be
 * fetched is treated as flagged.
 *
 * B4 dependency (stated in PLAN.md M0): GitHub only BLOCKS merge on a red
 * check once this check is marked Required in branch protection — an operator
 * setting. Until then this gate is a loud advisory.
 *
 * Zero dependencies; pure decision logic exported for unit tests
 * (scripts/i18n-security-gate.test.ts); the network `main` runs only when
 * invoked directly by .github/workflows/i18n-security-gate.yml.
 */

const DOCS_ROOT = 'src/content/docs/';
const LOCALE_PREFIX = /^(es|ar)\//;

/** The English source path a changed docs file maps to, or null when the path
 *  is outside the docs tree (or not a page). Locale variants inherit by path. */
export function englishSourceOf(path) {
  if (typeof path !== 'string' || !path.startsWith(DOCS_ROOT)) return null;
  if (!/\.(md|mdx)$/.test(path)) return null;
  const rel = path.slice(DOCS_ROOT.length);
  return DOCS_ROOT + rel.replace(LOCALE_PREFIX, '');
}

/** True when a page's raw text carries the flag in its LEADING frontmatter
 *  block. Total: no frontmatter ⇒ false. */
export function hasSecuritySensitiveFlag(raw) {
  if (typeof raw !== 'string') return false;
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return false;
  return /^security_sensitive:\s*true\s*$/m.test(m[1]);
}

/** Distinct users whose LATEST submitted review is an approval, excluding the
 *  PR author (self-approval never counts; GitHub forbids it anyway). Reviews
 *  arrive oldest-first from the API; later entries supersede earlier ones. */
export function distinctApprovals(reviews, authorLogin) {
  const latest = new Map();
  for (const r of reviews ?? []) {
    const user = r?.user?.login;
    const state = r?.state;
    if (!user || user === authorLogin) continue;
    if (state === 'APPROVED' || state === 'CHANGES_REQUESTED' || state === 'DISMISSED') {
      latest.set(user, state); // COMMENTED never supersedes a verdict
    }
  }
  return [...latest.values()].filter((s) => s === 'APPROVED').length;
}

/** Changed paths → the set of flagged English sources, given a loader that
 *  returns a file's raw text at a ref (or null when absent). Fails closed:
 *  a docs path whose BOTH versions are unreadable counts as flagged. */
export async function flaggedSources(changedPaths, readAt) {
  const flagged = new Set();
  const sources = new Set();
  for (const p of changedPaths) {
    const src = englishSourceOf(p);
    if (src) sources.add(src);
  }
  for (const src of sources) {
    const [head, base] = [await readAt(src, 'head'), await readAt(src, 'base')];
    if (head === undefined && base === undefined) { flagged.add(src); continue; } // unreadable ⇒ closed
    if (hasSecuritySensitiveFlag(head ?? '') || hasSecuritySensitiveFlag(base ?? '')) flagged.add(src);
  }
  return flagged;
}

// ---- network main (workflow entry point) ----

async function gh(token, url) {
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'wcjbt-i18n-security-gate' },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${url}`);
  return res.json();
}

async function paginate(token, url) {
  const out = [];
  for (let page = 1; page <= 20; page += 1) {
    const batch = await gh(token, `${url}${url.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    if (!batch || batch.length === 0) break;
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

async function main() {
  const { GH_TOKEN, REPO, PR_NUMBER, HEAD_SHA, BASE_SHA } = process.env;
  if (!GH_TOKEN || !REPO || !PR_NUMBER || !HEAD_SHA || !BASE_SHA) {
    console.error('missing env (GH_TOKEN, REPO, PR_NUMBER, HEAD_SHA, BASE_SHA)');
    process.exit(1); // fail closed on a mis-wired workflow
  }
  const api = `https://api.github.com/repos/${REPO}`;
  const files = await paginate(GH_TOKEN, `${api}/pulls/${PR_NUMBER}/files`);
  const changed = files.map((f) => f.filename).concat(files.map((f) => f.previous_filename).filter(Boolean));

  const readAt = async (path, which) => {
    const ref = which === 'head' ? HEAD_SHA : BASE_SHA;
    try {
      const body = await gh(GH_TOKEN, `${api}/contents/${encodeURIComponent(path).replaceAll('%2F', '/')}?ref=${ref}`);
      if (body === null) return null; // absent at this ref
      return Buffer.from(body.content, 'base64').toString('utf8');
    } catch {
      return undefined; // unreadable ⇒ callers fail closed
    }
  };

  const flagged = await flaggedSources(changed, readAt);
  if (flagged.size === 0) {
    console.log('i18n security gate: no security_sensitive pages touched — pass.');
    return;
  }
  const pr = await gh(GH_TOKEN, `${api}/pulls/${PR_NUMBER}`);
  const reviews = await paginate(GH_TOKEN, `${api}/pulls/${PR_NUMBER}/reviews`);
  const approvals = distinctApprovals(reviews, pr?.user?.login);
  console.log(`security_sensitive pages touched:\n${[...flagged].map((s) => `  - ${s}`).join('\n')}`);
  console.log(`distinct approving reviews (author excluded): ${approvals} / 2 required`);
  if (approvals < 2) {
    console.error('GATE RED: two distinct approving reviews are required before this PR may merge.');
    process.exit(1);
  }
  console.log('i18n security gate: pass.');
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
