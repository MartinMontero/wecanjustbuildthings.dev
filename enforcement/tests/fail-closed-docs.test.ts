// SPDX-License-Identifier: AGPL-3.0-or-later
//
// W0 follow-up: the doc-driven checks (catalog Layer 1, recipes, skills) and
// the Layer 3 tree scan fail CLOSED on input they cannot read, the same way
// the Layer 1/2 tree scans already do. Before this, a catalog entry whose YAML
// frontmatter did not parse was silently dropped (its declared dependency never
// checked), a --catalog / --recipes path that did not exist "passed", and
// Layer 3 reported "0 files clean" for a --tree that did not exist.
//
// Kept on purpose: an ABSENT --skills directory still passes quietly (cli.ts
// documents it as a legitimate state: no skills contributed yet).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadExcludedOrgs, loadProviderSignals } from '../config.ts';
import { InputFailure } from '../input-errors.ts';
import { collectDocEntries, parseFrontmatter, readDocEntries } from '../frontmatter.ts';
import { runCatalogLayer1 } from '../catalog-check.ts';
import { runLayer3OnTree } from '../layer3-provider-strings/scanner.ts';

const orgs = loadExcludedOrgs();
const signals = loadProviderSignals();
const cli = join(dirname(fileURLToPath(import.meta.url)), '..', 'cli.ts');

/** Frontmatter whose YAML does not parse (unclosed flow sequence). */
const BROKEN_PAGE = '---\ntitle: Broken\nentry_type: library\ndependency_name: [unclosed\n---\n\nBody.\n';
const GOOD_CATALOG_PAGE =
  '---\ntitle: Left pad\nentry_type: library\necosystem: js\ndependency_name: left-pad\n---\n\nPads strings.\n';
const GOOD_SKILL_PAGE =
  '---\ntitle: A skill\nentry_type: skill\nskill_method:\n  - Do the thing.\nskill_source: Field manual\nskill_license: CC-BY-SA-4.0\n---\n\nBody.\n';

function withTree(files: Record<string, string>, fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'enf-failclosed-docs-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), content);
    }
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runCli(args: string[], reportDir: string) {
  mkdirSync(reportDir, { recursive: true });
  return spawnSync(process.execPath, ['--import', 'tsx', cli, ...args, '--report-dir', reportDir], {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
}

// ---- frontmatter reader ----

test('parseFrontmatter: broken YAML throws unparseable_frontmatter; no frontmatter is still {}', () => {
  assert.throws(
    () => parseFrontmatter(BROKEN_PAGE, 'broken.mdx'),
    (e: unknown) => e instanceof InputFailure && e.reason === 'unparseable_frontmatter' && e.file === 'broken.mdx',
  );
  assert.throws(
    () => parseFrontmatter('---\n- just\n- a list\n---\n', 'list.mdx'),
    (e: unknown) => e instanceof InputFailure && e.reason === 'unparseable_frontmatter',
  );
  assert.deepEqual(parseFrontmatter('No frontmatter at all.\n', 'plain.md'), {});
});

test('collectDocEntries reports every unreadable page and still returns the readable ones', () => {
  withTree({ 'good.mdx': GOOD_CATALOG_PAGE, 'sub/broken.mdx': BROKEN_PAGE }, (dir) => {
    const { entries, errors } = collectDocEntries(dir);
    assert.deepEqual(entries.map((e) => e.slug), ['good']);
    assert.equal(errors.length, 1);
    assert.equal(errors[0]!.reason, 'unparseable_frontmatter');
    assert.match(errors[0]!.file, /broken\.mdx$/);
  });
});

test('readDocEntries (used by scripts) throws on the first unreadable page instead of dropping it', () => {
  withTree({ 'good.mdx': GOOD_CATALOG_PAGE, 'broken.mdx': BROKEN_PAGE }, (dir) => {
    assert.throws(() => readDocEntries(dir), (e: unknown) => e instanceof InputFailure);
  });
});

// ---- catalog Layer 1 ----

test('catalog Layer 1: an entry with broken frontmatter blocks with a named error (it used to be skipped)', () => {
  withTree({ 'left-pad.mdx': GOOD_CATALOG_PAGE, 'broken.mdx': BROKEN_PAGE }, (dir) => {
    const report = runCatalogLayer1(dir, orgs);
    assert.equal(report.status, 'block');
    assert.equal(report.findings.length, 0);
    assert.equal(report.scanned, 1);
    assert.deepEqual(report.errors?.map((e) => e.reason), ['unparseable_frontmatter']);
  });
});

test('catalog Layer 1: a catalog directory that does not exist blocks with unreadable_directory', () => {
  const report = runCatalogLayer1(join(tmpdir(), 'enf-failclosed-no-catalog-9c1e'), orgs);
  assert.equal(report.status, 'block');
  assert.equal(report.errors?.[0]?.reason, 'unreadable_directory');
});

test('catalog Layer 1: a clean catalog still passes with no errors', () => {
  withTree({ 'left-pad.mdx': GOOD_CATALOG_PAGE }, (dir) => {
    const report = runCatalogLayer1(dir, orgs);
    assert.equal(report.status, 'pass');
    assert.deepEqual(report.errors, []);
  });
});

// ---- Layer 3 tree scan ----

test('Layer 3: a --tree that does not exist blocks with unreadable_directory (not "0 files clean")', () => {
  const report = runLayer3OnTree(join(tmpdir(), 'enf-failclosed-no-tree-4b2d'), signals);
  assert.equal(report.status, 'block');
  assert.equal(report.errors?.[0]?.reason, 'unreadable_directory');
});

test('Layer 3: a clean tree still passes with no errors', () => {
  withTree({ 'src/app.ts': 'export const x = 1;\n' }, (dir) => {
    const report = runLayer3OnTree(dir, signals);
    assert.equal(report.status, 'pass');
    assert.deepEqual(report.errors, []);
  });
});

// ---- CLI: exit codes and named reasons ----

test('CANARY: `layer1 --catalog` on a catalog with a broken entry exits 1 and names unparseable_frontmatter', () => {
  withTree({ 'catalog/left-pad.mdx': GOOD_CATALOG_PAGE, 'catalog/broken.mdx': BROKEN_PAGE }, (dir) => {
    const r = runCli(['layer1', '--catalog', join(dir, 'catalog')], join(dir, 'reports'));
    assert.equal(r.status, 1, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.match(r.stdout, /unparseable_frontmatter/);
    assert.doesNotMatch(r.stdout, /Enforcement passed/);
  });
});

test('CANARY: `layer1 --catalog` and `layer3 --recipes` on paths that do not exist exit 1 (unreadable_directory)', () => {
  withTree({ 'placeholder.txt': 'x' }, (dir) => {
    for (const args of [['layer1', '--catalog', join(dir, 'missing-catalog')], ['layer3', '--recipes', join(dir, 'missing-recipes')]]) {
      const r = runCli(args, join(dir, 'reports'));
      assert.equal(r.status, 1, `${args.join(' ')}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
      assert.match(r.stdout, /unreadable_directory/);
    }
  });
});

test('CANARY: `skill --skills` exits 1 on a broken skill page, but an ABSENT skills directory still passes', () => {
  withTree({ 'skills/good.mdx': GOOD_SKILL_PAGE, 'skills/broken.mdx': BROKEN_PAGE }, (dir) => {
    const broken = runCli(['skill', '--skills', join(dir, 'skills')], join(dir, 'reports'));
    assert.equal(broken.status, 1, `stdout:\n${broken.stdout}\nstderr:\n${broken.stderr}`);
    assert.match(broken.stdout, /unparseable_frontmatter/);

    const absent = runCli(['skill', '--skills', join(dir, 'no-skills-yet')], join(dir, 'reports'));
    assert.equal(absent.status, 0, `stdout:\n${absent.stdout}\nstderr:\n${absent.stderr}`);
    assert.match(absent.stdout, /no skills directory yet/);
  });
});

test('CANARY: `recipe <file>` with broken frontmatter exits 1 and names unparseable_frontmatter', () => {
  withTree({ 'broken-recipe.mdx': BROKEN_PAGE }, (dir) => {
    const r = runCli(['recipe', join(dir, 'broken-recipe.mdx')], join(dir, 'reports'));
    assert.equal(r.status, 1, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.match(r.stdout, /unparseable_frontmatter/);
  });
});

test('CANARY: `layer3 --tree` on a path that does not exist exits 1 (unreadable_directory)', () => {
  withTree({ 'placeholder.txt': 'x' }, (dir) => {
    const r = runCli(['layer3', '--tree', join(dir, 'missing')], join(dir, 'reports'));
    assert.equal(r.status, 1, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.match(r.stdout, /unreadable_directory/);
  });
});
