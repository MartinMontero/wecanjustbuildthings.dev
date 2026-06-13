import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadExcludedOrgs } from '../config.ts';
import { matchDependency } from '../matcher.ts';
import { parsePackageJson } from '../layer1-direct/parsers/js.ts';
import { parseCargoToml } from '../layer1-direct/parsers/rust.ts';
import { parsePyprojectToml, parseRequirementsTxt, pep508Name } from '../layer1-direct/parsers/py.ts';
import { parseGoMod } from '../layer1-direct/parsers/go.ts';
import { parseMixExs } from '../layer1-direct/parsers/elixir.ts';
import { parsePubspecYaml } from '../layer1-direct/parsers/dart.ts';
import { parseGemfile } from '../layer1-direct/parsers/ruby.ts';
import { parseGradle } from '../layer1-direct/parsers/kotlin.ts';
import { runLayer1OnTree } from '../layer1-direct/index.ts';

const orgs = loadExcludedOrgs();

function flaggedNames(deps: ReturnType<typeof parsePackageJson>['deps']): string[] {
  return deps.filter((d) => matchDependency(d, orgs).length > 0).map((d) => d.name);
}

test('package.json parser extracts and flags excluded deps', () => {
  const { deps } = parsePackageJson(
    JSON.stringify({ dependencies: { 'nostr-tools': '^2.0.0', openai: '^4.0.0' }, devDependencies: { vitest: '^1' } }),
    'package.json',
  );
  assert.equal(deps.length, 3);
  assert.deepEqual(flaggedNames(deps), ['openai']);
});

test('Cargo.toml parser handles tables and flags excluded deps', () => {
  const { deps } = parseCargoToml(
    `[dependencies]\nserde = "1"\nasync-openai = { version = "0.20" }\n[dev-dependencies]\ntokio = "1"\n`,
    'Cargo.toml',
  );
  assert.deepEqual(flaggedNames(deps), ['async-openai']);
});

test('pyproject (PEP 621 + poetry) parser flags excluded deps', () => {
  const pep621 = parsePyprojectToml(`[project]\ndependencies = ["nostr-sdk>=0.1", "openai>=1.0"]\n`, 'pyproject.toml');
  assert.deepEqual(flaggedNames(pep621.deps), ['openai']);
  const poetry = parsePyprojectToml(
    `[tool.poetry.dependencies]\npython = "^3.11"\nhttpx = "^0.27"\nopenai = "^1.0"\n`,
    'pyproject.toml',
  );
  assert.deepEqual(flaggedNames(poetry.deps), ['openai']);
});

test('requirements.txt parser and pep508 name extraction', () => {
  assert.equal(pep508Name('openai==1.30.0 ; python_version >= "3.8"'), 'openai');
  assert.equal(pep508Name('# a comment'), null);
  const { deps } = parseRequirementsTxt('requests==2.0\nopenai>=1.0\n# comment\n-e .\n', 'requirements.txt');
  assert.deepEqual(flaggedNames(deps), ['openai']);
});

test('go.mod parser flags excluded module prefixes', () => {
  const { deps } = parseGoMod(
    `module example.com/app\n\ngo 1.24\n\nrequire (\n\tgithub.com/nbd-wtf/go-nostr v0.40.0\n\tgithub.com/openai/openai-go v1.0.0 // indirect\n)\n`,
    'go.mod',
  );
  assert.deepEqual(flaggedNames(deps), ['github.com/openai/openai-go']);
});

test('go.mod replace directive reroutes to an excluded module and is flagged', () => {
  const { deps } = parseGoMod(
    `module example.com/app\n\ngo 1.24\n\nrequire example.com/llm v0.1.0\n\nreplace example.com/llm => github.com/openai/openai-go v1.0.0\n`,
    'go.mod',
  );
  assert.deepEqual(flaggedNames(deps), ['github.com/openai/openai-go']);
});

test('go.mod block replace reroute is flagged; local paths are ignored', () => {
  const { deps } = parseGoMod(
    `module example.com/app\ngo 1.24\nreplace (\n\texample.com/local => ./vendor/local\n\texample.com/llm => github.com/openai/openai-go v1.0.0\n)\n`,
    'go.mod',
  );
  assert.deepEqual(flaggedNames(deps), ['github.com/openai/openai-go']);
});

test('mix.exs parser flags excluded deps and warns on dynamic blocks', () => {
  const { deps } = parseMixExs(
    `defmodule App.MixProject do\n  defp deps do\n    [\n      {:phoenix, "~> 1.7"},\n      {:openai_ex, "~> 0.5"}\n    ]\n  end\nend\n`,
    'mix.exs',
  );
  assert.deepEqual(flaggedNames(deps), ['openai_ex']);
});

test('pubspec.yaml parser flags excluded deps', () => {
  const { deps } = parsePubspecYaml(
    `name: app\ndependencies:\n  flutter:\n    sdk: flutter\n  dart_openai: ^1.0.0\n  http: ^1.0.0\n`,
    'pubspec.yaml',
  );
  assert.deepEqual(flaggedNames(deps), ['dart_openai']);
});

test('Gemfile parser flags excluded gems', () => {
  const { deps } = parseGemfile(`source "https://rubygems.org"\ngem "rails"\ngem "ruby-openai", "~> 3.0"\n`, 'Gemfile');
  assert.deepEqual(flaggedNames(deps), ['ruby-openai']);
});

test('gradle parser flags excluded coordinates and warns on version catalogs', () => {
  const { deps, warnings } = parseGradle(
    `dependencies {\n  implementation 'com.squareup.okhttp3:okhttp:4.12.0'\n  implementation("com.openai:openai-java:1.0.0")\n  implementation libs.androidx.core\n}\n`,
    'build.gradle',
  );
  assert.deepEqual(flaggedNames(deps), ['com.openai:openai-java']);
  assert.ok(warnings.some((w) => w.includes('version-catalog')));
});

test('runLayer1OnTree flags an excluded dependency across a directory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wcb-l1-'));
  try {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { openai: '^4.0.0' } }));
    mkdirSync(join(dir, 'node_modules', 'ignored'), { recursive: true });
    writeFileSync(join(dir, 'node_modules', 'ignored', 'package.json'), JSON.stringify({ dependencies: { openai: '^4' } }));
    const report = runLayer1OnTree(dir, orgs);
    assert.equal(report.status, 'block');
    assert.equal(report.findings.length, 1, 'node_modules must be ignored');
    assert.equal(report.findings[0]!.org_key, 'openai');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
