import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse as parseYaml } from 'yaml';
import { mentorPersonaSkill } from './mentor-persona.ts';
import { skillToMd } from './skill-doc.ts';

test('mentorPersonaSkill returns a well-formed persona skill per locale', () => {
  for (const lang of ['en', 'es', 'ar'] as const) {
    const s = mentorPersonaSkill(lang);
    assert.equal(s.name, 'mentor');
    assert.ok(s.description.length > 0);
    assert.ok(s.method.length >= 3, 'persona carries several guidance steps');
    assert.ok(s.method.every((m) => m.trim().length > 0));
    assert.ok(s.source && s.source.length > 0);
  }
});

test('locales are actually localized (not the English copy)', () => {
  const en = mentorPersonaSkill('en').description;
  assert.notEqual(mentorPersonaSkill('es').description, en);
  assert.notEqual(mentorPersonaSkill('ar').description, en);
});

test('an unknown locale falls back to English', () => {
  // @ts-expect-error — exercising the runtime fallback for an out-of-range lang
  assert.deepEqual(mentorPersonaSkill('fr'), mentorPersonaSkill('en'));
});

test('the persona renders to a valid SKILL.md (frontmatter parses), incl. Arabic', () => {
  for (const lang of ['en', 'ar'] as const) {
    const md = skillToMd(mentorPersonaSkill(lang));
    const m = md.match(/^---\n([\s\S]*?)\n---\n/);
    assert.ok(m, 'opens with YAML frontmatter');
    const fm = parseYaml(m![1]!) as { name: string };
    assert.equal(fm.name, 'mentor');
    assert.match(md, /^# Mentor/m); // title-cased heading from the slug
  }
});
