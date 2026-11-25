// SPDX-License-Identifier: AGPL-3.0-or-later
//
// bun.lock (Bun's text lockfile) reader. Fixtures are synthetic but follow the
// layouts in Bun's own writer, oven-sh/bun src/install/lockfile/bun.lock.rs:
//   npm       -> [ "name@version", registry, INFO, integrity ]
//   folder    -> [ "name@file:path", INFO ]        symlink -> [ "name@link:path", INFO ]
//   tarball   -> [ "name@tarball", INFO ]
//   git       -> [ "name@git+repo", INFO, .bun-tag ]
//   github    -> [ "name@github:user/repo", INFO, .bun-tag ]
//   workspace -> [ "name@workspace:path" ]         root -> [ "name@root:", { bin, binDir } ]
// Nested copies are keyed "parent/child"; the writer emits trailing commas (JSONC).
//
// Detection is exercised against a made-up TEST vendor passed straight to the
// matcher, so no real excluded package name appears in a dependency position
// here (the project guard forbids that, even in test data). The real policy
// list is covered by matcher.test.ts and layer2.test.ts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InputFailure } from '../input-errors.ts';
import { findExcludedInGraph } from '../layer2-transitive/walk.ts';
import { findBunResolution, parseBunLock, stripJsonc } from '../layer2-transitive/parsers/bun.ts';
import { runLayer2OnTree } from '../layer2-transitive/index.ts';
import type { ExcludedOrg } from '../types.ts';

const TEST_VENDOR: ExcludedOrg = {
  key: 'test-vendor',
  display_name: 'Test Vendor (fixture only)',
  llm_provider: false,
  github_orgs: [],
  npm_scopes: ['@banned'],
  npm_packages: ['banned-sdk', 'banned-ads-sdk'],
  pypi_maintainers: [],
  pypi_packages: [],
  crates_publishers: [],
  crates_packages: [],
  hex_publishers: [],
  hex_packages: [],
  rubygems_authors: [],
  rubygems_packages: [],
  maven_groups: [],
  pub_publishers: [],
  pub_packages: [],
  go_module_prefixes: [],
};
const orgs = [TEST_VENDOR];

/** A realistic bun.lock: trailing commas, scoped + nested keys, github/workspace rows. */
const BUN_LOCK = `{
  "lockfileVersion": 1,
  "configVersion": 1,
  "workspaces": {
    "": {
      "name": "fixture",
      "dependencies": {
        "a": "^1.0.0",
        "@scope/b": "^2.0.0",
        "gh": "github:someone/gh",
      },
    },
    "packages/app": {
      "name": "app",
      "dependencies": {
        "@banned/agent": "^1.0.0",
      },
    },
  },
  "packages": {
    "a": ["a@1.0.0", "", { "dependencies": { "banned-sdk": "^4.0.0" } }, "sha512-AAAA"],

    "@scope/b": ["@scope/b@2.0.0", "", { "dependencies": { "c": "^1.0.0" } }, "sha512-BBBB"],

    "@scope/b/c": ["c@1.1.0", "", { "dependencies": { "banned-ads-sdk": "^20.0.0" } }, "sha512-CCCC"],

    "c": ["c@0.9.0", "", {}, "sha512-DDDD"],

    "gh": ["gh@github:someone/gh#abc1234", { "dependencies": { "left-pad": "^1.0.0" } }, "someone-gh-abc1234"],

    "left-pad": ["left-pad@1.3.0", "", {}, "sha512-EEEE"],

    "app": ["app@workspace:packages/app"],

    "@banned/agent": ["@banned/agent@1.0.0", "", {}, "sha512-FFFF"],

    "banned-sdk": ["banned-sdk@4.0.0", "", {}, "sha512-GGGG"],

    "banned-ads-sdk": ["banned-ads-sdk@20.0.0", "", {}, "sha512-HHHH"],
  }
}
`;

function chainOf(lock: string, excludedName: string): string[] {
  const findings = findExcludedInGraph(parseBunLock(lock, 'bun.lock'), orgs);
  const f = findings.find((x) => x.excluded_package.startsWith(`${excludedName}@`));
  assert.ok(f, `expected a finding for ${excludedName}; got ${findings.map((x) => x.excluded_package).join(', ')}`);
  assert.equal(f!.chain_known, true);
  return f!.chain.map((n) => n.name);
}

// ---- JSONC handling ----

test('stripJsonc removes trailing commas and comments but never touches string contents', () => {
  const src = '{ "a": "x, }", // line comment\n "b": [1, 2,], /* block, ] */ "c": "// not a comment", }';
  assert.deepEqual(JSON.parse(stripJsonc(src)), { a: 'x, }', b: [1, 2], c: '// not a comment' });
});

// ---- detection + chains ----

test('bun.lock: every package row becomes a checked node (all three planted packages detected)', () => {
  const found = findExcludedInGraph(parseBunLock(BUN_LOCK, 'bun.lock'), orgs).map((f) => f.excluded_package).sort();
  assert.deepEqual(found, ['@banned/agent@1.0.0', 'banned-ads-sdk@20.0.0', 'banned-sdk@4.0.0']);
});

test('bun.lock: chain root -> a -> banned-sdk', () => {
  assert.deepEqual(chainOf(BUN_LOCK, 'banned-sdk'), ['a', 'banned-sdk']);
});

test('bun.lock: nested key "@scope/b/c" resolves before the top-level "c" (chain @scope/b -> c -> banned-ads-sdk)', () => {
  assert.deepEqual(chainOf(BUN_LOCK, 'banned-ads-sdk'), ['@scope/b', 'c', 'banned-ads-sdk']);
});

test('bun.lock: a non-root workspace dependency is a root of the graph', () => {
  assert.deepEqual(chainOf(BUN_LOCK, '@banned/agent'), ['@banned/agent']);
});

test('bun.lock: github rows (INFO at index 1) contribute edges', () => {
  const graph = parseBunLock(BUN_LOCK, 'bun.lock');
  const ghKey = [...graph.nodes.keys()].find((k) => k.startsWith('gh@'));
  assert.ok(ghKey);
  assert.deepEqual(graph.edges.get(ghKey!), ['left-pad@1.3.0']);
});

test('bun.lock: comments are accepted (JSONC)', () => {
  const withComments = BUN_LOCK.replace('"lockfileVersion": 1,', '// written by bun\n  "lockfileVersion": 1, /* v1 */');
  assert.deepEqual(chainOf(withComments, 'banned-sdk'), ['a', 'banned-sdk']);
});

// ---- the walk-up rule, ported from Bun's find_resolution ----

test('findBunResolution walks from "<pkgPath>/<dep>" toward the root, stepping over scoped segments', () => {
  const keys = new Set(['a/d', 'd', '@s/x/d', 'a/@s/x', '@s/x']);
  assert.equal(findBunResolution(keys, 'a', 'd'), 'a/d'); // own entry
  assert.equal(findBunResolution(new Set(['d']), 'a', 'd'), 'd'); // walked to root
  assert.equal(findBunResolution(keys, '@s/x/b', 'd'), '@s/x/d'); // walked one level, scoped parent
  assert.equal(findBunResolution(new Set(['a/d', 'd']), 'a/@s/x', 'd'), 'a/d'); // steps over "@s/x" as one segment
  assert.equal(findBunResolution(new Set(['zzz']), '@s/x', 'd'), undefined); // unresolvable
});

// ---- fail closed on anything the reader does not understand ----

test('bun.lock fails closed (unparseable_lockfile) on unknown or malformed structure', () => {
  const broken: Array<[string, string]> = [
    ['syntax error', '{ "lockfileVersion": 1, "workspaces": { '],
    ['top level not a mapping', '[]'],
    ['unknown lockfileVersion 4', BUN_LOCK.replace('"lockfileVersion": 1', '"lockfileVersion": 4')],
    ['lockfileVersion missing', BUN_LOCK.replace('"lockfileVersion": 1,', '')],
    ['workspaces missing', '{ "lockfileVersion": 1, "packages": {} }'],
    ['package row not an array', BUN_LOCK.replace('"left-pad": ["left-pad@1.3.0", "", {}, "sha512-EEEE"]', '"left-pad": "left-pad@1.3.0"')],
    ['package ident without @', BUN_LOCK.replace('"left-pad@1.3.0"', '"left-pad"')],
    ['row element neither string nor object', BUN_LOCK.replace('"sha512-EEEE"', '42')],
    ['dependency map not an object', BUN_LOCK.replace('{ "dependencies": { "left-pad": "^1.0.0" } }', '{ "dependencies": ["left-pad"] }')],
  ];
  for (const [label, content] of broken) {
    assert.throws(
      () => parseBunLock(content, 'bun.lock'),
      (err: unknown) => err instanceof InputFailure && err.reason === 'unparseable_lockfile',
      label,
    );
  }
});

// ---- wired into the Layer 2 tree scan ----

test('Layer 2 tree scan reads bun.lock: a planted package blocks, a clean lockfile passes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'enf-bunlock-'));
  try {
    writeFileSync(join(dir, 'bun.lock'), BUN_LOCK);
    const dirty = runLayer2OnTree(dir, orgs);
    assert.equal(dirty.status, 'block');
    assert.deepEqual(dirty.errors, []);
    assert.equal(dirty.scanned, 1);
    assert.ok(dirty.findings.some((f) => f.excluded_package === 'banned-sdk@4.0.0'));

    const clean = `{
  "lockfileVersion": 1,
  "workspaces": { "": { "name": "clean", "dependencies": { "left-pad": "^1.3.0", }, }, },
  "packages": { "left-pad": ["left-pad@1.3.0", "", {}, "sha512-EEEE"], },
}
`;
    writeFileSync(join(dir, 'bun.lock'), clean);
    const ok = runLayer2OnTree(dir, orgs);
    assert.equal(ok.status, 'pass');
    assert.equal(ok.scanned, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
