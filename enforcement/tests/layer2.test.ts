import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadExcludedOrgs } from '../config.ts';
import { findExcludedInGraph } from '../layer2-transitive/walk.ts';
import {
  parseNpmLock,
  parsePnpmLock,
  parseYarn1,
  parseYarnBerry,
} from '../layer2-transitive/parsers/npm-family.ts';
import { parseCargoLock } from '../layer2-transitive/parsers/cargo.ts';
import { parseUvLock, parsePoetryLock, parseRequirementsLock } from '../layer2-transitive/parsers/python.ts';
import { parseGoModClosure, parseGoModGraph } from '../layer2-transitive/parsers/go.ts';
import { parseGemfileLock } from '../layer2-transitive/parsers/ruby.ts';
import { parseMixLock } from '../layer2-transitive/parsers/elixir.ts';
import { parsePubspecLock } from '../layer2-transitive/parsers/dart.ts';
import { parseGradleLockfile } from '../layer2-transitive/parsers/gradle.ts';
import type { LockGraph } from '../types.ts';

const orgs = loadExcludedOrgs();

function expectChain(graph: LockGraph, excludedName: string, chainTail: string[]) {
  const findings = findExcludedInGraph(graph, orgs);
  const finding = findings.find((f) => f.excluded_package.startsWith(excludedName));
  assert.ok(finding, `expected a finding for ${excludedName}`);
  assert.equal(finding!.chain_known, true, `${excludedName} chain should be known`);
  const names = finding!.chain.map((n) => n.name);
  for (const node of chainTail) {
    assert.ok(names.includes(node), `chain ${names.join(' → ')} should include ${node}`);
  }
}

function expectClosureOnly(graph: LockGraph, excludedName: string) {
  const findings = findExcludedInGraph(graph, orgs);
  const finding = findings.find((f) => f.excluded_package.startsWith(excludedName));
  assert.ok(finding, `expected a finding for ${excludedName}`);
  assert.equal(finding!.chain_known, false, `${excludedName} should be closure-only`);
}

test('npm package-lock.json v3 — chain a → openai', () => {
  const lock = JSON.stringify({
    name: 'fixture',
    lockfileVersion: 3,
    packages: {
      '': { name: 'fixture', dependencies: { a: '1.0.0' } },
      'node_modules/a': { version: '1.0.0', dependencies: { openai: '4.0.0' } },
      'node_modules/openai': { version: '4.0.0' },
    },
  });
  expectChain(parseNpmLock(lock, 'package-lock.json'), 'openai', ['a', 'openai']);
});

test('pnpm-lock.yaml v9 — chain a → openai', () => {
  const lock = `lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      a:
        specifier: ^1.0.0
        version: 1.0.0
snapshots:
  a@1.0.0:
    dependencies:
      openai: 4.0.0
  openai@4.0.0: {}
`;
  expectChain(parsePnpmLock(lock, 'pnpm-lock.yaml'), 'openai', ['a', 'openai']);
});

test('yarn.lock v1 — chain a → openai', () => {
  const lock = `a@^1.0.0:
  version "1.0.0"
  dependencies:
    openai "^4.0.0"

openai@^4.0.0:
  version "4.0.0"
`;
  expectChain(parseYarn1(lock, 'yarn.lock'), 'openai', ['a', 'openai']);
});

test('yarn.lock Berry — chain a → openai', () => {
  const lock = `__metadata:
  version: 8
"a@npm:^1.0.0":
  version: 1.0.0
  dependencies:
    openai: "npm:^4.0.0"
"openai@npm:^4.0.0":
  version: 4.0.0
`;
  expectChain(parseYarnBerry(lock, 'yarn.lock'), 'openai', ['a', 'openai']);
});

test('Cargo.lock — chain fixture → a → async-openai', () => {
  const lock = `version = 4

[[package]]
name = "fixture"
version = "0.1.0"
dependencies = ["a"]

[[package]]
name = "a"
version = "1.0.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
dependencies = ["async-openai"]

[[package]]
name = "async-openai"
version = "0.20.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
`;
  expectChain(parseCargoLock(lock, 'Cargo.lock'), 'async-openai', ['a', 'async-openai']);
});

test('uv.lock — chain a → openai', () => {
  const lock = `version = 1

[[package]]
name = "fixture"
version = "0.1.0"
source = { virtual = "." }

[[package.dependencies]]
name = "a"

[[package]]
name = "a"
version = "1.0.0"

[[package.dependencies]]
name = "openai"

[[package]]
name = "openai"
version = "1.30.0"
`;
  expectChain(parseUvLock(lock, 'uv.lock'), 'openai', ['a', 'openai']);
});

test('poetry.lock — chain a → openai', () => {
  const lock = `[[package]]
name = "a"
version = "1.0.0"

[package.dependencies]
openai = "^1.0"

[[package]]
name = "openai"
version = "1.30.0"
`;
  expectChain(parsePoetryLock(lock, 'poetry.lock'), 'openai', ['a', 'openai']);
});

test('requirements.txt with # via — chain a → openai', () => {
  const lock = `a==1.0.0
    # via -r requirements.in
openai==1.30.0
    # via a
`;
  expectChain(parseRequirementsLock(lock, 'requirements.txt'), 'openai', ['a', 'openai']);
});

test('requirements.txt without # via — closure-only', () => {
  const lock = `a==1.0.0\nopenai==1.30.0\n`;
  expectClosureOnly(parseRequirementsLock(lock, 'requirements.txt'), 'openai');
});

test('go.mod alone — closure-only detection', () => {
  const mod = `module example.com/app\n\ngo 1.24\n\nrequire (\n\tgithub.com/foo/bar v1.2.3\n\tgithub.com/openai/openai-go v1.0.0 // indirect\n)\n`;
  expectClosureOnly(parseGoModClosure(mod, 'go.mod'), 'github.com/openai/openai-go');
});

test('go mod graph — full chain', () => {
  const graph = `example.com/app github.com/foo/bar@v1.2.3
github.com/foo/bar@v1.2.3 github.com/openai/openai-go@v1.0.0
`;
  expectChain(parseGoModGraph(graph, 'go.mod'), 'github.com/openai/openai-go', [
    'github.com/foo/bar',
    'github.com/openai/openai-go',
  ]);
});

test('Gemfile.lock — chain a → ruby-openai', () => {
  const lock = `GEM
  remote: https://rubygems.org/
  specs:
    a (1.0.0)
      ruby-openai (>= 3.0)
    ruby-openai (3.0.0)

PLATFORMS
  ruby

DEPENDENCIES
  a

BUNDLED WITH
   2.5.0
`;
  expectChain(parseGemfileLock(lock, 'Gemfile.lock'), 'ruby-openai', ['a', 'ruby-openai']);
});

test('mix.lock — chain a → openai_ex', () => {
  const lock = `%{
  "a": {:hex, :a, "1.0.0", "hash1", [:mix], [{:openai_ex, "~> 0.5", [hex: :openai_ex, repo: "hexpm", optional: false]}], "hexpm", "hash2"},
  "openai_ex": {:hex, :openai_ex, "0.5.0", "hash3", [:mix], [], "hexpm", "hash4"},
}
`;
  expectChain(parseMixLock(lock, 'mix.lock'), 'openai_ex', ['a', 'openai_ex']);
});

test('pubspec.lock — closure-only detection', () => {
  const lock = `packages:
  a:
    dependency: "direct main"
    version: "1.0.0"
  dart_openai:
    dependency: transitive
    version: "1.0.0"
`;
  expectClosureOnly(parsePubspecLock(lock, 'pubspec.lock'), 'dart_openai');
});

test('gradle.lockfile — closure-only detection', () => {
  const lock = `com.example:a:1.0.0=compileClasspath,runtimeClasspath
com.openai:openai-java:1.0.0=runtimeClasspath
empty=
`;
  expectClosureOnly(parseGradleLockfile(lock, 'gradle.lockfile'), 'com.openai:openai-java');
});

test('a clean lockfile produces no findings', () => {
  const lock = JSON.stringify({
    name: 'fixture',
    lockfileVersion: 3,
    packages: {
      '': { name: 'fixture', dependencies: { 'nostr-tools': '2.0.0' } },
      'node_modules/nostr-tools': { version: '2.0.0' },
    },
  });
  assert.equal(findExcludedInGraph(parseNpmLock(lock, 'package-lock.json'), orgs).length, 0);
});
