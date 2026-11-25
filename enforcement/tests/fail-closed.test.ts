// SPDX-License-Identifier: AGPL-3.0-or-later
//
// W0 "fix the leaks": the engine must fail CLOSED on input it cannot read.
// Before this suite existed, an unparseable manifest or lockfile produced a
// warning and counted as clean, a lockfile format with no reader (bun.lock) was
// silently skipped, and a --tree that did not exist "passed". Each test below
// names the production change that would make it fail again.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadExcludedOrgs } from '../config.ts';
import { InputFailure, type InputErrorReason } from '../input-errors.ts';
import { parsePackageJson } from '../layer1-direct/parsers/js.ts';
import { parseCargoToml } from '../layer1-direct/parsers/rust.ts';
import { parsePyprojectToml } from '../layer1-direct/parsers/py.ts';
import { parsePubspecYaml } from '../layer1-direct/parsers/dart.ts';
import { runLayer1OnTree } from '../layer1-direct/index.ts';
import { parseNpmLock, parsePnpmLock, parseYarn1, parseYarnBerry } from '../layer2-transitive/parsers/npm-family.ts';
import { parseCargoLock } from '../layer2-transitive/parsers/cargo.ts';
import { parseUvLock, parsePoetryLock } from '../layer2-transitive/parsers/python.ts';
import { parsePubspecLock } from '../layer2-transitive/parsers/dart.ts';
import { runLayer2OnTree } from '../layer2-transitive/index.ts';

const orgs = loadExcludedOrgs();
const cli = join(dirname(fileURLToPath(import.meta.url)), '..', 'cli.ts');

/** A broken pyproject that ALSO declares an excluded package: what a parse failure used to hide. */
const BROKEN_PYPROJECT = '[project\nname = "canary"\nversion = "0.1.0"\ndependencies = ["openai>=1.0"]\n';
const VALID_PYPROJECT = '[project]\nname = "canary"\nversion = "0.1.0"\ndependencies = ["httpx>=0.27"]\n';

function failsWith(reason: InputErrorReason) {
  return (err: unknown) => {
    assert.ok(err instanceof InputFailure, `expected InputFailure, got ${String(err)}`);
    assert.equal(err.reason, reason);
    return true;
  };
}

function withTree(files: Record<string, string>, fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'enf-failclosed-'));
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

// ---- Layer 1 parsers: a syntax error is a named failure, never empty deps ----

test('pyproject.toml with a TOML syntax error throws unparseable_manifest (py.ts no longer returns empty deps)', () => {
  assert.throws(() => parsePyprojectToml(BROKEN_PYPROJECT, 'pyproject.toml'), failsWith('unparseable_manifest'));
});

test('package.json that is not valid JSON, or not a JSON object, throws unparseable_manifest', () => {
  assert.throws(() => parsePackageJson('{ "dependencies": ', 'package.json'), failsWith('unparseable_manifest'));
  assert.throws(() => parsePackageJson('["openai"]', 'package.json'), failsWith('unparseable_manifest'));
});

test('Cargo.toml with a TOML syntax error throws unparseable_manifest', () => {
  assert.throws(() => parseCargoToml('[dependencies\nasync-openai = "0.20"\n', 'Cargo.toml'), failsWith('unparseable_manifest'));
});

test('pubspec.yaml that is not valid YAML, or not a mapping, throws unparseable_manifest', () => {
  assert.throws(() => parsePubspecYaml('dependencies: [unclosed', 'pubspec.yaml'), failsWith('unparseable_manifest'));
  assert.throws(() => parsePubspecYaml('- a\n- b\n', 'pubspec.yaml'), failsWith('unparseable_manifest'));
});

test('Layer 1 tree scan: one broken manifest blocks the run with a named error, even beside a clean one', () => {
  withTree(
    { 'pyproject.toml': BROKEN_PYPROJECT, 'web/package.json': JSON.stringify({ dependencies: { 'nostr-tools': '^2' } }) },
    (dir) => {
      const report = runLayer1OnTree(dir, orgs);
      assert.equal(report.status, 'block');
      assert.equal(report.findings.length, 0);
      assert.equal(report.errors?.length, 1);
      assert.equal(report.errors![0]!.reason, 'unparseable_manifest');
      assert.match(report.errors![0]!.file, /pyproject\.toml$/);
    },
  );
});

test('Layer 1 tree scan: a --tree that does not exist blocks with unreadable_directory (not "0 manifests clean")', () => {
  const report = runLayer1OnTree(join(tmpdir(), 'enf-failclosed-does-not-exist-7f3a'), orgs);
  assert.equal(report.status, 'block');
  assert.equal(report.errors?.[0]?.reason, 'unreadable_directory');
});

// ---- Layer 2 parsers: a syntax error is a named failure, never an empty graph ----

test('lockfiles with syntax errors throw unparseable_lockfile (npm, pnpm, yarn v1, yarn Berry, Cargo, uv, poetry, pubspec)', () => {
  const broken: Array<[string, () => unknown]> = [
    ['package-lock.json', () => parseNpmLock('{ "packages": ', 'package-lock.json')],
    ['package-lock.json (not an object)', () => parseNpmLock('[]', 'package-lock.json')],
    ['pnpm-lock.yaml', () => parsePnpmLock('snapshots: [unclosed', 'pnpm-lock.yaml')],
    ['pnpm-lock.yaml (not a mapping)', () => parsePnpmLock('just a string', 'pnpm-lock.yaml')],
    ['yarn.lock v1', () => parseYarn1('a@^1:\n  version "1.0.0" }\n', 'yarn.lock')],
    ['yarn.lock Berry', () => parseYarnBerry('__metadata:\n  version: 6\n"a@npm:1": [unclosed\n', 'yarn.lock')],
    ['Cargo.lock', () => parseCargoLock('[[package]\nname = "a"\n', 'Cargo.lock')],
    ['uv.lock', () => parseUvLock('[[package]\nname = "a"\n', 'uv.lock')],
    ['poetry.lock', () => parsePoetryLock('[[package]\nname = "a"\n', 'poetry.lock')],
    ['pubspec.lock', () => parsePubspecLock('packages: [unclosed', 'pubspec.lock')],
  ];
  for (const [label, fn] of broken) {
    assert.throws(fn, failsWith('unparseable_lockfile'), label);
  }
});

test('yarn.lock v1 with unresolvable merge conflicts throws unparseable_lockfile (the library returns an EMPTY object)', () => {
  const conflicted =
    'a@^1:\n  version "1.0.0"\n<<<<<<< HEAD\nb@^1:\n  version "1.0.0" }\n=======\nb@^1:\n  version "2.0.0" }\n>>>>>>> other\n';
  assert.throws(() => parseYarn1(conflicted, 'yarn.lock'), failsWith('unparseable_lockfile'));
});

test('Layer 2 tree scan: a tree whose only lockfile is bun.lock blocks with unsupported_lockfile', () => {
  withTree({ 'package.json': '{"name":"x"}', 'bun.lock': 'not read: no bun.lock reader exists\n' }, (dir) => {
    const report = runLayer2OnTree(dir, orgs);
    assert.equal(report.status, 'block');
    assert.equal(report.errors?.length, 1);
    assert.equal(report.errors![0]!.reason, 'unsupported_lockfile');
    assert.match(report.errors![0]!.file, /bun\.lock$/);
  });
});

test('Layer 2 tree scan: every lockfile without a reader blocks (bun.lockb, deno.lock, Pipfile.lock, pdm.lock)', () => {
  for (const name of ['bun.lockb', 'deno.lock', 'Pipfile.lock', 'pdm.lock']) {
    withTree({ [name]: 'not read\n' }, (dir) => {
      const report = runLayer2OnTree(dir, orgs);
      assert.equal(report.status, 'block', name);
      assert.equal(report.errors?.[0]?.reason, 'unsupported_lockfile', name);
    });
  }
});

test('Layer 2 tree scan: an unreadable lockfile still blocks when a readable one sits beside it', () => {
  const npmLock = JSON.stringify({ name: 'x', lockfileVersion: 3, packages: { '': { name: 'x' } } });
  withTree({ 'package-lock.json': npmLock, 'bun.lockb': 'not read\n' }, (dir) => {
    const report = runLayer2OnTree(dir, orgs);
    assert.equal(report.status, 'block');
    assert.equal(report.scanned, 1);
    assert.deepEqual(report.errors?.map((e) => e.reason), ['unsupported_lockfile']);
  });
});

test('Layer 2 tree scan: a broken lockfile blocks with a named error', () => {
  withTree({ 'Cargo.lock': '[[package]\nname = "a"\n' }, (dir) => {
    const report = runLayer2OnTree(dir, orgs);
    assert.equal(report.status, 'block');
    assert.equal(report.errors?.[0]?.reason, 'unparseable_lockfile');
  });
});

test('Layer 2 tree scan: a clean, readable tree still passes with no errors', () => {
  const npmLock = JSON.stringify({ name: 'x', lockfileVersion: 3, packages: { '': { name: 'x' } } });
  withTree({ 'package-lock.json': npmLock }, (dir) => {
    const report = runLayer2OnTree(dir, orgs);
    assert.equal(report.status, 'pass');
    assert.deepEqual(report.errors, []);
  });
});

// ---- CLI canaries: the exit code and the named reason are what CI sees ----

test('CANARY: `all --tree` on a broken pyproject.toml exits 1 and names unparseable_manifest', () => {
  withTree({ 'pyproject.toml': BROKEN_PYPROJECT }, (dir) => {
    const r = runCli(['all', '--tree', dir], join(dir, 'reports'));
    assert.equal(r.status, 1, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.match(r.stdout, /unparseable_manifest/);
    assert.doesNotMatch(r.stdout, /Enforcement passed/);
  });
});

test('CANARY: `all --tree` on a valid pyproject.toml exits 0', () => {
  withTree({ 'pyproject.toml': VALID_PYPROJECT }, (dir) => {
    const r = runCli(['all', '--tree', dir], join(dir, 'reports'));
    assert.equal(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.match(r.stdout, /Enforcement passed/);
  });
});

test('CANARY: `all --tree` on a tree whose only lockfile is bun.lock exits 1 and names unsupported_lockfile', () => {
  withTree({ 'package.json': '{"name":"x"}', 'bun.lock': 'not read\n' }, (dir) => {
    const r = runCli(['all', '--tree', dir], join(dir, 'reports'));
    assert.equal(r.status, 1, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.match(r.stdout, /unsupported_lockfile/);
    assert.doesNotMatch(r.stdout, /Enforcement passed/);
  });
});

test('CANARY: `layer1`/`layer2 --tree` on a path that does not exist exits 1 and names unreadable_directory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'enf-failclosed-'));
  try {
    for (const layer of ['layer1', 'layer2']) {
      const r = runCli([layer, '--tree', join(dir, 'missing')], join(dir, 'reports'));
      assert.equal(r.status, 1, `${layer} stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
      assert.match(r.stdout, /unreadable_directory/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
