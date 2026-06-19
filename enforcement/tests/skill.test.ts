import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadProviderSignals } from '../config.ts';
import { validateSkill, type SkillValidationContext } from '../layer3-provider-strings/skill-validator.ts';
import type { DocEntry } from '../frontmatter.ts';

const ctx: SkillValidationContext = { signals: loadProviderSignals() };

const entry = (fm: Record<string, unknown>): DocEntry => ({
  slug: 'tenant-intake',
  file: 'skills/tenant-intake.mdx',
  frontmatter: fm,
});
const okFm = {
  entry_type: 'skill',
  skill_method: ['Use a chosen handle, not a legal name', 'Record the building, not the unit'],
  skill_license: 'CC-BY-SA-4.0',
};

test('a clean skill passes', () => {
  const r = validateSkill(entry(okFm), 'Use a chosen handle, not a legal name. Record the building, not the unit.', ctx);
  assert.equal(r.status, 'pass', r.errors.join('; '));
});

test('a skill that names an excluded-provider config key is blocked', () => {
  const r = validateSkill(entry(okFm), 'First, set OPENAI_API_KEY in your environment, then run the agent.', ctx);
  assert.equal(r.status, 'block');
  assert.ok(r.errors.some((e) => e.includes('OPENAI_API_KEY')));
  assert.ok(r.errors.some((e) => e.includes('config_key')));
});

test('a skill that names an excluded endpoint host is blocked (the body is scanned, not just frontmatter)', () => {
  // Assembled from fragments so THIS source file never holds a contiguous excluded host.
  const host = ['api.', 'openai.com'].join('');
  const body = `---\nentry_type: skill\n---\n\nThen POST the transcript to ${host} for a summary.`;
  const r = validateSkill(entry(okFm), body, ctx);
  assert.equal(r.status, 'block');
  assert.ok(r.errors.some((e) => e.includes(host)));
});

test('a skill missing a method step is blocked (defence-in-depth beyond the Zod schema)', () => {
  const r = validateSkill(entry({ entry_type: 'skill', skill_method: [], skill_license: 'CC-BY-SA-4.0' }), 'clean', ctx);
  assert.equal(r.status, 'block');
  assert.ok(r.errors.some((e) => e.includes('skill_method')));
});

test('a skill missing a license is blocked', () => {
  const r = validateSkill(entry({ entry_type: 'skill', skill_method: ['x'] }), 'clean', ctx);
  assert.equal(r.status, 'block');
  assert.ok(r.errors.some((e) => e.includes('skill_license')));
});

test('prose that avoids endpoint/import/config patterns passes', () => {
  const r = validateSkill(entry(okFm), 'Prefer a permitted, accountable model vendor; never an excluded one.', ctx);
  assert.equal(r.status, 'pass', r.errors.join('; '));
});

test('the scan is deliberately broad: an import-shaped phrase ("use OpenAI") blocks even in prose', () => {
  // The Elixir import signal is literally "use OpenAI"; a skill ships verbatim, so we'd
  // rather block and have the author rephrase ("never use excluded vendors") than leak.
  const r = validateSkill(entry(okFm), 'Never use OpenAI tooling in this workflow.', ctx);
  assert.equal(r.status, 'block');
  assert.ok(r.errors.some((e) => e.includes('import')));
});
