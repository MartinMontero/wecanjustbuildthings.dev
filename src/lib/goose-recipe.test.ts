import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse as parseYaml } from 'yaml';
import {
  buildGooseRecipe,
  buildExtensionAllowlist,
  recipeToYaml,
  skillToSubRecipe,
  subRecipeRef,
  skillSubRecipePath,
  RESPONSE_JSON_SCHEMA,
  type ExtensionAllowlist,
  type ExtensionEntry,
  type RecipeInput,
} from './goose-recipe.ts';
import type { SessionExtension } from './build-session.ts';
import type { DraftSkill } from './skill-doc.ts';

const skill = (over: Partial<DraftSkill> = {}): DraftSkill => ({
  name: 'Tenant Intake',
  description: 'Take an eviction report without exposing the tenant',
  method: ['Use a chosen handle, not a legal name', 'Record the building, not the unit'],
  ...over,
});

const allow: ExtensionAllowlist = {
  byId: {
    'mcp-fs': { type: 'stdio', name: 'filesystem', cmd: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] },
    gh: { type: 'sse', name: 'github', uri: 'https://example.test/sse' },
    dev: { type: 'builtin', name: 'developer' },
  },
};

const ext = (catalogId: string, name = 'x', kind: SessionExtension['kind'] = 'mcp_stdio'): SessionExtension =>
  ({ catalogId, name, kind });

const baseInput = (over: Partial<RecipeInput> = {}): RecipeInput => ({
  title: 'Tenant Reporter',
  slug: 'tenant-reporter',
  prompt: 'You are building "Tenant Reporter".\nPROBLEM: report evictions safely.',
  extensions: [],
  ...over,
});

test('buildGooseRecipe is deterministic and model-agnostic (no provider/model/settings)', () => {
  const a = buildGooseRecipe(baseInput(), allow);
  const b = buildGooseRecipe(baseInput(), allow);
  assert.deepEqual(a, b);
  // Model-agnostic: no structural provider/model/settings field (instructions prose may
  // still mention "model provider" as guidance — that's not a hardcoded provider).
  assert.ok(!('settings' in a), 'no settings block');
  assert.ok(!('provider' in a), 'no provider field');
  assert.ok(!('model' in a), 'no model field');
  assert.equal(a.version, '1.0.0');
  assert.equal(a.title, 'Tenant Reporter');
  assert.match(a.description, /no Meta\/OpenAI\/xAI/);
  assert.ok(a.activities.length >= 1);
  assert.deepEqual(a.parameters, []);
});

test('a persona is prepended to the recipe instructions (carried in the deeplink)', () => {
  const persona = { name: 'mentor', description: 'A Socratic build mentor.', method: ['Reflect first.', 'Offer choices.'] };
  const r = buildGooseRecipe(baseInput({ persona }), allow);
  assert.match(r.instructions, /Act as the build mentor — A Socratic build mentor\./);
  assert.match(r.instructions, /1\. Reflect first\.\n2\. Offer choices\./);
  assert.match(r.instructions, /policy-clean/); // base instructions still present
  // omitted persona ⇒ just the base instructions
  assert.ok(!buildGooseRecipe(baseInput(), allow).instructions.includes('Act as the build mentor'));
});

test('recipeToYaml round-trips a persona recipe (multi-line instructions block scalar)', () => {
  // D-2a made `instructions` multi-line; prove the YAML block scalar survives it
  // (same class as the prompt bullet-indent case).
  const persona = {
    name: 'mentor',
    description: 'A Socratic build mentor.',
    method: ['Reflect the real problem first.', 'Offer choices with honest trade-offs.', 'Keep the builder in control.'],
  };
  const r = buildGooseRecipe(baseInput({ persona }), allow);
  const lines = String((parseYaml(recipeToYaml(r)) as Record<string, any>).instructions).split('\n');
  assert.ok(lines.includes('Act as the build mentor — A Socratic build mentor.'), 'persona header preserved');
  assert.ok(lines.includes('1. Reflect the real problem first.'), 'numbered persona step preserved');
  assert.ok(lines.includes('3. Keep the builder in control.'), 'last persona step preserved');
  assert.ok(lines.some((l) => l.includes('policy-clean')), 'base instructions still present after the persona');
});

test('the recipe forces the structured response the Mentor Engine will read (Slice D)', () => {
  const r = buildGooseRecipe(baseInput(), allow);
  assert.ok(r.response, 'the main recipe always carries a response contract');
  assert.deepEqual(r.response.json_schema, RESPONSE_JSON_SCHEMA);
  const schema = r.response.json_schema as { required: string[] };
  assert.deepEqual(schema.required, ['constraints', 'proposals']);
});

test('extensions: only allowlisted ids appear, resolved to the VETTED config, deduped', () => {
  const r = buildGooseRecipe(
    baseInput({
      extensions: [
        ext('mcp-fs', 'attacker-renamed'), // allowlisted → included, but with the vetted name
        ext('not-vetted', 'evil'),          // not in allowlist → dropped
        ext('dev', 'developer', 'builtin'),
        ext('mcp-fs', 'dup'),               // same vetted name → deduped
      ],
    }),
    allow,
  );
  assert.deepEqual(r.extensions.map((e) => e.name).sort(), ['developer', 'filesystem']);
  // config comes from the allowlist, NOT the session's claimed name
  const fs = r.extensions.find((e) => e.name === 'filesystem');
  assert.equal(fs?.type, 'stdio');
  assert.deepEqual((fs as { args: string[] }).args, ['-y', '@modelcontextprotocol/server-filesystem']);
});

test('G-Trust property: a non-allowlisted extension can never appear in a recipe', () => {
  const allowNames = new Set(Object.values(allow.byId).map((r) => r.name));
  const ids = ['mcp-fs', 'gh', 'dev', 'not-vetted', 'also-bad', 'sneaky'];
  for (let n = 0; n < 1000; n += 1) {
    const picks = Array.from({ length: 1 + (n % 5) }, (_, i) => ext(ids[(n + i) % ids.length]!));
    const r = buildGooseRecipe(baseInput({ extensions: picks }), allow);
    for (const e of r.extensions) assert.ok(allowNames.has(e.name), `leaked non-allowlisted: ${e.name}`);
    assert.ok(r.extensions.length <= Object.keys(allow.byId).length, 'no more than the allowlist size');
  }
});

test('recipeToYaml emits valid YAML that round-trips the recipe', () => {
  const r = buildGooseRecipe(
    baseInput({ extensions: [ext('mcp-fs'), ext('gh'), ext('dev', 'developer', 'builtin')] }),
    allow,
  );
  const parsed = parseYaml(recipeToYaml(r)) as Record<string, any>;
  assert.equal(parsed.version, '1.0.0');
  assert.equal(parsed.title, 'Tenant Reporter');
  assert.match(parsed.prompt, /You are building "Tenant Reporter"/);
  assert.equal(parsed.extensions.length, 3);
  assert.ok(parsed.extensions.some((e: any) => e.type === 'stdio' && Array.isArray(e.args)));
  assert.deepEqual(parsed.response.json_schema.required, ['constraints', 'proposals']);
});

test('recipeToYaml preserves an indented, bulleted prompt (the real agent-prompt shape)', () => {
  // Mirrors BuildStudio's agentPrompt: flush-left lines, a blank line, and 4-space
  // sub-bullets — the indentation-inside-a-block-scalar case most likely to break.
  const prompt = [
    'You are building "Tenant Reporter".',
    '',
    'RULES (binding):',
    '- Read the constitution first.',
    '    - ★ ndk (js)',
    '    - svelte (js)',
    '- No Meta/OpenAI/xAI — directly or transitively.',
  ].join('\n');
  const r = buildGooseRecipe(baseInput({ prompt }), allow);
  const lines = String((parseYaml(recipeToYaml(r)) as Record<string, any>).prompt).split('\n');
  assert.ok(lines.includes('- Read the constitution first.'), 'column-0 list item preserved');
  assert.ok(lines.includes('    - ★ ndk (js)'), 'deeper 4-space bullet preserved exactly');
  assert.ok(lines.includes('    - svelte (js)'), 'second 4-space bullet preserved');
  assert.ok(lines.includes('- No Meta/OpenAI/xAI — directly or transitively.'), 'back to column 0 preserved');
});

test('buildExtensionAllowlist: only verified, well-formed extensions pass the trust gate', () => {
  const entries: ExtensionEntry[] = [
    { id: 'fs', data: { entry_type: 'extension', verification_status: 'verified', dependency_name: 'filesystem', goose_extension_type: 'stdio', goose_extension_command: 'npx', goose_extension_args: ['-y', 'x'] } },
    { id: 'unverified', data: { entry_type: 'extension', verification_status: 'under_review', dependency_name: 'sketchy', goose_extension_type: 'stdio', goose_extension_command: 'rm' } }, // not verified → excluded
    { id: 'wrong-type', data: { entry_type: 'tool', verification_status: 'verified', dependency_name: 'react' } }, // not an extension → excluded
    { id: 'malformed', data: { entry_type: 'extension', verification_status: 'verified', dependency_name: 'broken', goose_extension_type: 'stdio' } }, // stdio without a command → excluded
    { id: 'dev', data: { entry_type: 'extension', verification_status: 'verified', dependency_name: 'developer', goose_extension_type: 'builtin' } },
    { id: 'gh', data: { entry_type: 'extension', verification_status: 'verified', dependency_name: 'github', goose_extension_type: 'sse', goose_extension_uri: 'https://x.test/sse', goose_extension_timeout: 30 } },
  ];
  const { byId } = buildExtensionAllowlist(entries);
  assert.deepEqual(Object.keys(byId).sort(), ['dev', 'fs', 'gh']); // unverified/wrong-type/malformed all dropped
  assert.deepEqual(byId.fs, { type: 'stdio', name: 'filesystem', cmd: 'npx', args: ['-y', 'x'] });
  assert.deepEqual(byId.dev, { type: 'builtin', name: 'developer' });
  assert.deepEqual(byId.gh, { type: 'sse', name: 'github', uri: 'https://x.test/sse', timeout: 30 });
});

test('recipeToYaml handles an empty extension/parameter set and hostile text', () => {
  const r = buildGooseRecipe(
    baseInput({ title: 'Weird: "quotes" & colons', prompt: 'line1\nline2: with colon\n# hash' }),
    allow,
  );
  const yaml = recipeToYaml(r);
  assert.match(yaml, /\nextensions: \[\]\n/);
  assert.match(yaml, /\nparameters: \[\]\n/);
  const parsed = parseYaml(yaml) as Record<string, any>;
  assert.equal(parsed.title, 'Weird: "quotes" & colons'); // survives YAML round-trip
  assert.match(parsed.prompt, /line2: with colon/);
});

// ---- Slice E: authored skills → sub-recipes (path-based) or inline ------------------

test('skillToSubRecipe is a self-contained recipe: numbered method, no extensions/response', () => {
  const a = skillToSubRecipe(skill());
  const b = skillToSubRecipe(skill());
  assert.deepEqual(a, b); // deterministic
  assert.equal(a.title, 'Tenant Intake');
  assert.deepEqual(a.extensions, []);
  assert.equal(a.response, undefined); // a sub-recipe carries a method, not a reflection contract
  assert.equal(a.subRecipes, undefined);
  assert.match(a.instructions, /1\. Use a chosen handle/);
  assert.match(a.instructions, /2\. Record the building/);
});

test('skillToSubRecipe round-trips through YAML with no response key', () => {
  const yaml = recipeToYaml(skillToSubRecipe(skill()));
  const parsed = parseYaml(yaml) as Record<string, any>;
  assert.equal(parsed.title, 'Tenant Intake');
  assert.equal('response' in parsed, false); // omitted, not null
  assert.equal('sub_recipes' in parsed, false);
  assert.match(String(parsed.instructions), /Record the building, not the unit/);
});

test('subRecipeRef / skillSubRecipePath agree and are slug-based', () => {
  const s = skill({ name: 'Safe Data!! Handling' });
  assert.equal(skillSubRecipePath(s), 'recipes/safe-data-handling.goose-recipe.yaml');
  assert.deepEqual(subRecipeRef(s), {
    name: 'safe-data-handling',
    path: 'recipes/safe-data-handling.goose-recipe.yaml',
    description: s.description,
  });
});

test("skills 'subrecipes' mode references files; the method is NOT folded into instructions", () => {
  const r = buildGooseRecipe(baseInput({ skills: [skill(), skill({ name: 'Vet Member' })] }), allow, {
    skills: 'subrecipes',
  });
  assert.equal(r.subRecipes?.length, 2);
  assert.deepEqual(r.subRecipes?.map((s) => s.path), [
    'recipes/tenant-intake.goose-recipe.yaml',
    'recipes/vet-member.goose-recipe.yaml',
  ]);
  assert.ok(!r.instructions.includes('Use a chosen handle')); // referenced, not inlined
  const parsed = parseYaml(recipeToYaml(r)) as Record<string, any>;
  assert.equal(parsed.sub_recipes.length, 2);
  assert.equal(parsed.sub_recipes[0].name, 'tenant-intake');
  assert.equal(parsed.sub_recipes[0].path, 'recipes/tenant-intake.goose-recipe.yaml');
});

test("skills 'inline' mode folds methods into instructions and emits NO sub_recipes (deeplink-safe)", () => {
  const r = buildGooseRecipe(baseInput({ skills: [skill()] }), allow, { skills: 'inline' });
  assert.equal(r.subRecipes, undefined);
  assert.match(r.instructions, /Skill — Tenant Intake/);
  assert.match(r.instructions, /1\. Use a chosen handle/);
  const yaml = recipeToYaml(r);
  assert.ok(!yaml.includes('sub_recipes:')); // nothing path-based travels in a URL
});

test('omitting the skills option embeds nothing (back-compat) even when skills are present', () => {
  const r = buildGooseRecipe(baseInput({ skills: [skill()] }), allow);
  assert.equal(r.subRecipes, undefined);
  assert.ok(!r.instructions.includes('Tenant Intake'));
});

test('a sub-recipe with hostile text stays valid YAML', () => {
  const hostile = skill({ name: 'Weird: "x"', description: 'has "quotes": and #hash', method: ['do: a\tthing'] });
  assert.doesNotThrow(() => parseYaml(recipeToYaml(skillToSubRecipe(hostile))));
});

test('the zip bundle is internally consistent: every sub_recipes path is a written, valid-YAML file', () => {
  const skills = [skill(), skill({ name: 'Vet Member' }), skill({ name: 'Safe Data!! Handling' })];
  const main = buildGooseRecipe(baseInput({ skills }), allow, { skills: 'subrecipes' });

  // The files BuildStudio writes alongside the main recipe (skillSubRecipePath ↔ skillToSubRecipe).
  const written = new Map(skills.map((s) => [skillSubRecipePath(s), recipeToYaml(skillToSubRecipe(s))]));

  assert.equal(main.subRecipes?.length, skills.length);
  for (const ref of main.subRecipes ?? []) {
    assert.ok(written.has(ref.path), `sub_recipes path ${ref.path} has a written file`);
    assert.doesNotThrow(() => parseYaml(written.get(ref.path)!), `${ref.path} is valid YAML`);
  }

  // No two skills collide on one file, and the rendered main YAML references exactly those paths.
  const paths = (main.subRecipes ?? []).map((r) => r.path);
  assert.equal(new Set(paths).size, paths.length, 'sub-recipe paths are unique');
  const parsed = parseYaml(recipeToYaml(main)) as Record<string, any>;
  assert.deepEqual(
    parsed.sub_recipes.map((s: { path: string }) => s.path).sort(),
    [...paths].sort(),
  );
});
