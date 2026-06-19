import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse as parseYaml } from 'yaml';
import { slugifySkill, skillToMd, yamlDoubleQuoted, type DraftSkill } from './skill-doc.ts';

/** Pull and YAML-parse the frontmatter block of a generated SKILL.md. */
function frontmatter(md: string): Record<string, unknown> {
  const m = md.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(m, 'SKILL.md must open with a YAML frontmatter block');
  return parseYaml(m![1]!) as Record<string, unknown>;
}

test('slugifySkill produces ASCII kebab and a stable fallback', () => {
  assert.equal(slugifySkill('Tenant Intake'), 'tenant-intake');
  assert.equal(slugifySkill('  Safe Data!! Handling  '), 'safe-data-handling');
  assert.equal(slugifySkill('--weird__name--'), 'weird-name');
  assert.equal(slugifySkill(''), 'skill');
  assert.equal(slugifySkill('!!!'), 'skill');
  assert.equal(slugifySkill('الإبلاغ'), 'skill'); // non-Latin-only collapses to the fallback
});

test('yamlDoubleQuoted escapes quotes/backslashes and flattens newlines', () => {
  assert.equal(yamlDoubleQuoted('plain'), '"plain"');
  assert.equal(yamlDoubleQuoted('has "quotes"'), '"has \\"quotes\\""');
  assert.equal(yamlDoubleQuoted('a\\b'), '"a\\\\b"');
  assert.equal(yamlDoubleQuoted('line1\nline2\tend'), '"line1 line2 end"');
});

test('skillToMd: a description with a colon stays valid YAML (the original bug)', () => {
  const s: DraftSkill = { name: 'Tenant Intake', description: 'Intake: never expose the unit #', method: ['Use a handle'] };
  const fm = frontmatter(skillToMd(s));
  assert.equal(fm.name, 'tenant-intake');
  assert.equal(fm.description, 'Intake: never expose the unit #'); // round-trips exactly
});

test('skillToMd: quotes/backslashes in source survive a YAML round-trip', () => {
  const s: DraftSkill = {
    name: 'vetting',
    description: 'Vet a member',
    method: ['Check refs'],
    source: 'Field "manual" v2 \\ notes',
  };
  const fm = frontmatter(skillToMd(s)) as { attribution: { source: string; license: string } };
  assert.equal(fm.attribution.source, 'Field "manual" v2 \\ notes');
  assert.equal(fm.attribution.license, 'CC-BY-SA-4.0');
});

test('skillToMd: defaults the source and numbers the method in the body', () => {
  const s: DraftSkill = { name: 'safe handling', description: 'Hold data safely', method: ['Minimize', 'Encrypt', 'Review'] };
  const md = skillToMd(s);
  const fm = frontmatter(md) as { attribution: { source: string } };
  assert.equal(fm.attribution.source, 'Described by the builder in the Build Studio');
  assert.match(md, /# Safe Handling/);          // title-cased heading from the slug
  assert.match(md, /\n1\. Minimize\n2\. Encrypt\n3\. Review\n/); // numbered steps
});

test('skillToMd frontmatter is always parseable regardless of hostile input', () => {
  const hostile: DraftSkill = {
    name: 'x',
    description: 'weird: "value" with # and: colons \\ and\nnewlines',
    method: ['step'],
    source: 'src: with "everything" \\ \n',
  };
  assert.doesNotThrow(() => frontmatter(skillToMd(hostile)));
});
