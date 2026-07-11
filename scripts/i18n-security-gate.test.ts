import { test } from 'node:test';
import assert from 'node:assert/strict';
import { englishSourceOf, hasSecuritySensitiveFlag, distinctApprovals, flaggedSources } from './i18n-security-gate.mjs';

// ---- path mapping: locale variants inherit the English source's flag ----

test('englishSourceOf maps locale variants to the English source and passes sources through', () => {
  assert.equal(
    englishSourceOf('src/content/docs/es/guides/encrypted-group-messaging-marmot.mdx'),
    'src/content/docs/guides/encrypted-group-messaging-marmot.mdx',
  );
  assert.equal(
    englishSourceOf('src/content/docs/ar/check.mdx'),
    'src/content/docs/check.mdx',
  );
  assert.equal(
    englishSourceOf('src/content/docs/guides/x.md'),
    'src/content/docs/guides/x.md',
  );
});

test('englishSourceOf ignores non-docs paths and non-pages', () => {
  for (const p of ['README.md', 'worker/index.ts', 'src/content/docs/img/x.png', 'src/pages/console/index.astro', 42]) {
    assert.equal(englishSourceOf(p as never), null, String(p));
  }
  // "es"/"ar" only as LOCALE prefixes — a page legitimately named es-something is untouched
  assert.equal(englishSourceOf('src/content/docs/essentials.mdx'), 'src/content/docs/essentials.mdx');
});

// ---- flag detection: leading frontmatter only ----

test('hasSecuritySensitiveFlag reads only the leading frontmatter block', () => {
  assert.ok(hasSecuritySensitiveFlag('---\ntitle: x\nsecurity_sensitive: true\n---\nbody'));
  assert.ok(!hasSecuritySensitiveFlag('---\ntitle: x\n---\nsecurity_sensitive: true'));
  assert.ok(!hasSecuritySensitiveFlag('---\nsecurity_sensitive: false\n---\n'));
  assert.ok(!hasSecuritySensitiveFlag('no frontmatter at all'));
  assert.ok(!hasSecuritySensitiveFlag(undefined));
  // windows line endings
  assert.ok(hasSecuritySensitiveFlag('---\r\nsecurity_sensitive: true\r\n---\r\n'));
});

// ---- review counting: latest verdict per distinct user, author excluded ----

const r = (login: string, state: string) => ({ user: { login }, state });

test('distinctApprovals counts latest-verdict distinct approvers and excludes the author', () => {
  assert.equal(distinctApprovals([r('a', 'APPROVED'), r('b', 'APPROVED')], 'author'), 2);
  // author's own approval never counts
  assert.equal(distinctApprovals([r('author', 'APPROVED'), r('a', 'APPROVED')], 'author'), 1);
  // a later CHANGES_REQUESTED supersedes an earlier approval
  assert.equal(distinctApprovals([r('a', 'APPROVED'), r('a', 'CHANGES_REQUESTED')], 'x'), 0);
  // re-approval after changes-requested counts again
  assert.equal(distinctApprovals([r('a', 'CHANGES_REQUESTED'), r('a', 'APPROVED')], 'x'), 1);
  // COMMENTED never supersedes a verdict
  assert.equal(distinctApprovals([r('a', 'APPROVED'), r('a', 'COMMENTED')], 'x'), 1);
  // same user approving twice is still one
  assert.equal(distinctApprovals([r('a', 'APPROVED'), r('a', 'APPROVED')], 'x'), 1);
  assert.equal(distinctApprovals([], 'x'), 0);
  assert.equal(distinctApprovals(undefined, 'x'), 0);
});

// ---- end-to-end decision: flagged sources, fail-closed semantics ----

const FLAGGED = '---\ntitle: guide\nsecurity_sensitive: true\n---\n';
const PLAIN = '---\ntitle: guide\n---\n';

function loader(headByPath: Record<string, string | null>, baseByPath: Record<string, string | null>) {
  return async (path: string, which: 'head' | 'base') =>
    (which === 'head' ? headByPath : baseByPath)[path];
}

test('flaggedSources flags a touched flagged page AND its locale variants', async () => {
  const src = 'src/content/docs/guides/g.mdx';
  const out = await flaggedSources(
    ['src/content/docs/es/guides/g.mdx'],
    loader({ [src]: FLAGGED }, { [src]: FLAGGED }),
  );
  assert.deepEqual([...out], [src]);
});

test('flaggedSources honors the flag on BASE even when HEAD removes it (flag-removal is gated)', async () => {
  const src = 'src/content/docs/guides/g.mdx';
  const out = await flaggedSources([src], loader({ [src]: PLAIN }, { [src]: FLAGGED }));
  assert.equal(out.size, 1);
});

test('flaggedSources passes unflagged pages and ignores non-docs churn', async () => {
  const src = 'src/content/docs/about.mdx';
  const out = await flaggedSources(
    [src, 'worker/index.ts', 'package.json'],
    loader({ [src]: PLAIN }, { [src]: PLAIN }),
  );
  assert.equal(out.size, 0);
});

test('flaggedSources fails CLOSED when a docs page is unreadable at both refs', async () => {
  const src = 'src/content/docs/guides/g.mdx';
  const out = await flaggedSources([src], loader({}, {})); // loader returns undefined for both
  assert.equal(out.size, 1);
});

test('flaggedSources treats absent-at-one-ref (null) as an honest read, not a failure', async () => {
  // new unflagged page: absent at base (null), plain at head — passes
  const src = 'src/content/docs/guides/new.mdx';
  const out = await flaggedSources([src], loader({ [src]: PLAIN }, { [src]: null }));
  assert.equal(out.size, 0);
});
