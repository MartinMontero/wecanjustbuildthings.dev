import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDependencyInput } from './policy-input.ts';

test('empty / whitespace input yields no dependencies', () => {
  assert.deepEqual(parseDependencyInput('', 'js'), []);
  assert.deepEqual(parseDependencyInput('   \n  ', 'js'), []);
});

test('parses a package.json across all four dependency blocks as js', () => {
  const pkg = JSON.stringify({
    name: 'demo',
    dependencies: { react: '^18', svelte: '^5' },
    devDependencies: { vite: '^5' },
    optionalDependencies: { fsevents: '*' },
    peerDependencies: { typescript: '^5' },
  });
  const out = parseDependencyInput(pkg, 'py'); // default ignored for package.json
  assert.deepEqual(out.map((d) => d.name).sort(), ['fsevents', 'react', 'svelte', 'typescript', 'vite']);
  assert.ok(out.every((d) => d.ecosystem === 'js'));
});

test('a JSON object with no dependency blocks falls through to line parsing', () => {
  // valid JSON, starts with '{', but no deps → treated as a one-line list
  const out = parseDependencyInput('{"name":"demo"}', 'js');
  assert.equal(out.length, 1);
  assert.equal(out[0]!.name, '{name:demo}'); // quotes/commas stripped from the single line
});

test('parses a plain list, one dep per line, ignoring blanks and # comments', () => {
  const out = parseDependencyInput('react\n\n# a comment\nsvelte\n', 'js');
  assert.deepEqual(out, [
    { name: 'react', ecosystem: 'js' },
    { name: 'svelte', ecosystem: 'js' },
  ]);
});

test('a per-line ecosystem token overrides the default; otherwise the default applies', () => {
  const out = parseDependencyInput('serde rust\ntokio rust\nflask', 'py');
  assert.deepEqual(out, [
    { name: 'serde', ecosystem: 'rust' },
    { name: 'tokio', ecosystem: 'rust' },
    { name: 'flask', ecosystem: 'py' },
  ]);
});

test('strips surrounding quotes/commas so pasted package.json lines work, and drops empties', () => {
  const out = parseDependencyInput('"react",\n","\n@scope/pkg', 'js');
  assert.deepEqual(out, [
    { name: 'react', ecosystem: 'js' },     // from `"react",`
    { name: '@scope/pkg', ecosystem: 'js' }, // the `","` line cleaned to '' and was dropped
  ]);
});

test('malformed JSON starting with { degrades to line parsing without throwing', () => {
  assert.doesNotThrow(() => parseDependencyInput('{ not valid json', 'js'));
});
