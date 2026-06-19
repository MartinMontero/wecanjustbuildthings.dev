/**
 * goose-recipe.ts — pure, model-free serializer: session-derived input → a Goose
 * recipe (Slice B). No DOM, no network, and NO provider/model: Goose is model-agnostic,
 * so the user's own Goose config picks the model. Deterministic — same input yields a
 * byte-identical recipe.
 *
 * MCP trust boundary: extensions are emitted ONLY from the Catalog-derived allowlist.
 * The session references an extension by its VERIFIED Catalog id; the vetted config
 * (cmd/args/uri) comes from the allowlist, never from session or user input. A session
 * extension whose id isn't in the allowlist is dropped — non-allowlisted extensions are
 * unrepresentable in a generated recipe.
 */
import type { SessionExtension } from './build-session.ts';
import { yamlDoubleQuoted, slugifySkill, type DraftSkill } from './skill-doc.ts';

export type JsonSchema = Record<string, unknown>;

/** A vetted Goose extension, resolved from the Catalog allowlist (never user input). */
export type GooseExtensionRef =
  | { type: 'builtin'; name: string; timeout?: number }
  | { type: 'stdio'; name: string; cmd: string; args: string[]; timeout?: number }
  | { type: 'sse'; name: string; uri: string; timeout?: number };

/** catalogId (verified Catalog slug) → its vetted extension config. */
export interface ExtensionAllowlist {
  byId: Record<string, GooseExtensionRef>;
}

/** Minimal shape of a Catalog 'extension' entry the allowlist builder reads — a subset
 *  of the content-collection entry, kept here so this module stays free of astro:content. */
export interface ExtensionEntry {
  id: string;
  data: {
    entry_type?: string;
    verification_status?: string;
    dependency_name?: string;
    title?: string;
    goose_extension_type?: 'builtin' | 'stdio' | 'sse';
    goose_extension_command?: string;
    goose_extension_args?: string[];
    goose_extension_uri?: string;
    goose_extension_timeout?: number;
  };
}

export interface GooseParameter {
  key: string;
  description: string;
  requirement: 'required' | 'optional';
  default?: string;
}

/** A reference from the main recipe to a standalone sub-recipe FILE (Slice E). Goose's
 *  `sub_recipes` are path-based: each entry names another recipe YAML on disk. Verified
 *  against the aaif-goose `SubRecipe` struct — `name` and `path` are both required; there
 *  is no inline form, so a sub-recipe only works where its file exists (the zip, not a
 *  deeplink). */
export interface SubRecipeRef {
  name: string;
  path: string;
  description?: string;
}

export interface GooseRecipe {
  version: string;
  title: string;
  description: string;
  instructions: string;
  prompt: string;
  extensions: GooseExtensionRef[];
  parameters: GooseParameter[];
  activities: string[];
  /** Path-based references to standalone skill sub-recipe files (Slice E). Omitted when
   *  there are none, or when skills are folded inline (the deeplink). */
  subRecipes?: SubRecipeRef[];
  /** The forced structured result (main recipe only). A sub-recipe carries a method, not
   *  a reflection contract, so it omits this — `response` is Optional in Goose. */
  response?: { json_schema: JsonSchema };
}

/** Session-derived inputs the serializer needs (narrow + pure for testability). */
export interface RecipeInput {
  title: string;
  slug: string;
  /** The fully-assembled agent prompt (BuildStudio owns its wording). */
  prompt: string;
  /** Candidate extensions chosen on the session; gated against the allowlist. */
  extensions: SessionExtension[];
  /** Optional mentor persona (Slice D), prepended to the recipe instructions so the
   *  agent adopts the Socratic-mentor frame even via the deeplink (which carries no files). */
  persona?: DraftSkill;
  /** Skills the builder authored (Slice E). How they ride the recipe is set by
   *  RecipeOptions.skills — as path-based sub-recipes (zip) or folded inline (deeplink). */
  skills?: DraftSkill[];
}

/** How authored skills are embedded (Slice E). The transport decides:
 *  - 'subrecipes': reference standalone files via `sub_recipes` — for the ZIP, where the
 *    files exist on disk and resolve.
 *  - 'inline': fold each method into `instructions` so the recipe is self-contained — for
 *    the DEEPLINK, which carries no files (may grow it past the deeplink budget).
 *  - omitted: skills are not embedded in the recipe (back-compat). */
export interface RecipeOptions {
  skills?: 'subrecipes' | 'inline';
}

/**
 * The structured result the recipe forces Goose to emit, read DETERMINISTICALLY by the
 * Mentor Engine in Slice D (no LLM call on our side). Mirrors SessionMentorReflection.
 */
export const RESPONSE_JSON_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['constraints', 'proposals'],
  properties: {
    constraints: { type: 'array', items: { type: 'string' } },
    proposals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['action', 'name', 'why'],
        properties: {
          action: { type: 'string', enum: ['add', 'remove'] },
          name: { type: 'string' },
          why: { type: 'string' },
        },
      },
    },
  },
};

const RECIPE_INSTRUCTIONS =
  'Read the constitution and never violate it. Use only the listed, policy-clean ' +
  'dependencies (nothing owned by Meta, OpenAI, or xAI). Run `npm run enforce` before ' +
  'every commit. Use your own permitted, BYOK model provider.';

/** Render the mentor persona as a leading instruction block (carried in the deeplink). */
function personaToInstructions(p: DraftSkill): string {
  const steps = p.method.map((m, i) => `${i + 1}. ${m}`).join('\n');
  return `Act as the build mentor — ${p.description}\n${steps}`;
}

/** Canonical in-zip path for a skill's standalone sub-recipe file. Keeps the parent's
 *  `sub_recipes[].path` and the file actually written to the zip in lock-step. */
export function skillSubRecipePath(s: DraftSkill): string {
  return `recipes/${slugifySkill(s.name)}.goose-recipe.yaml`;
}

/** A skill → the parent recipe's `sub_recipes` reference (path-based; the file is written
 *  separately by the caller). Pure. */
export function subRecipeRef(s: DraftSkill): SubRecipeRef {
  return { name: slugifySkill(s.name), path: skillSubRecipePath(s), description: s.description };
}

/** Project a DraftSkill into a standalone, self-contained Goose recipe — a sub-recipe FILE
 *  is just a recipe. Pure, deterministic, model-free: the skill's numbered method becomes
 *  the instructions; no extensions, no response contract. */
export function skillToSubRecipe(s: DraftSkill): GooseRecipe {
  const slug = slugifySkill(s.name);
  const title = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const steps = s.method.map((m, i) => `${i + 1}. ${m}`).join('\n');
  return {
    version: '1.0.0',
    title,
    description: s.description,
    instructions: `Apply the builder's own method — ${s.description}\nFollow these steps exactly, in order; never skip one:\n${steps}`,
    prompt: `Apply the "${title}" method to the task at hand.`,
    extensions: [],
    parameters: [],
    activities: [],
  };
}

/** Fold authored skills into a single instructions block (the 'inline' transport, for the
 *  deeplink — no files travel in a URL). Each method is numbered and attributed by name. */
function skillsToInstructions(skills: DraftSkill[]): string {
  return skills
    .map((s) => {
      const steps = s.method.map((m, i) => `${i + 1}. ${m}`).join('\n');
      return `Skill — ${s.name}: ${s.description}\n${steps}`;
    })
    .join('\n\n');
}

/** Deterministic next-steps shown in Goose to guide a non-dev builder. */
function activitiesFor(slug: string): string[] {
  return [
    `Write specs/001-${slug}/plan.md from the spec`,
    'Generate tasks.md, then implement task by task',
    'Keep every change green: run `npm run enforce`',
  ];
}

/**
 * Build a Goose recipe from session-derived input + the Catalog extension allowlist.
 * Pure + deterministic. Extensions absent from `allow` are dropped (trust boundary);
 * never emits a model/provider (Goose is model-agnostic).
 */
export function buildGooseRecipe(
  input: RecipeInput,
  allow: ExtensionAllowlist,
  opts: RecipeOptions = {},
): GooseRecipe {
  const seen = new Set<string>();
  const extensions = input.extensions
    .map((e) => allow.byId[e.catalogId]) // vetted config only — the session is reference-only
    .filter((ref): ref is GooseExtensionRef => Boolean(ref))
    .filter((ref) => (seen.has(ref.name) ? false : (seen.add(ref.name), true)));

  let instructions = input.persona
    ? `${personaToInstructions(input.persona)}\n\n${RECIPE_INSTRUCTIONS}`
    : RECIPE_INSTRUCTIONS;
  const skills = input.skills ?? [];
  let subRecipes: SubRecipeRef[] | undefined;
  if (skills.length && opts.skills === 'inline') {
    // Self-contained (deeplink): the methods travel in the instructions themselves.
    instructions = `${instructions}\n\nApply the builder's own captured methods:\n\n${skillsToInstructions(skills)}`;
  } else if (skills.length && opts.skills === 'subrecipes') {
    // Modular (zip): reference the standalone files the caller writes alongside.
    subRecipes = skills.map(subRecipeRef);
  }

  return {
    version: '1.0.0',
    title: input.title,
    description: `Build ${input.slug} — policy-clean (no Meta/OpenAI/xAI), via wecanjustbuildthings.dev`,
    instructions,
    prompt: input.prompt,
    extensions,
    parameters: [], // reserved: the prompt is fully rendered, so there are no template variables yet
    activities: activitiesFor(input.slug),
    ...(subRecipes ? { subRecipes } : {}),
    response: { json_schema: RESPONSE_JSON_SCHEMA },
  };
}

/**
 * Build the vetted-extension allowlist from Catalog entries — the MCP trust GATE. An
 * entry is included ONLY when it is entry_type 'extension' AND verification_status
 * 'verified' AND well-formed for its kind (stdio needs a command, sse needs a uri).
 * Keyed by entry id (the catalogId a session references). Pure; /extensions.json feeds
 * it getCollection() results, and it is unit-tested directly.
 */
export function buildExtensionAllowlist(entries: ExtensionEntry[]): ExtensionAllowlist {
  const byId: Record<string, GooseExtensionRef> = {};
  for (const { id, data: d } of entries) {
    if (d.entry_type !== 'extension' || d.verification_status !== 'verified') continue;
    const name = d.dependency_name ?? d.title;
    if (!name) continue;
    let ref: GooseExtensionRef | null = null;
    if (d.goose_extension_type === 'builtin') ref = { type: 'builtin', name };
    else if (d.goose_extension_type === 'stdio' && d.goose_extension_command) {
      ref = { type: 'stdio', name, cmd: d.goose_extension_command, args: d.goose_extension_args ?? [] };
    } else if (d.goose_extension_type === 'sse' && d.goose_extension_uri) {
      ref = { type: 'sse', name, uri: d.goose_extension_uri };
    }
    if (!ref) continue;
    if (d.goose_extension_timeout != null) ref.timeout = d.goose_extension_timeout;
    byId[id] = ref;
  }
  return { byId };
}

// ---- YAML rendering (for the downloadable *.goose-recipe.yaml) -------------------
// Hand-rolled for our fixed recipe shape: dependency-free + deterministic. The nested
// response.json_schema is emitted as inline JSON (JSON is valid YAML).

const indentBlock = (text: string): string =>
  text.split('\n').map((l) => (l ? '  ' + l : '')).join('\n');

function extToYaml(e: GooseExtensionRef): string {
  const parts = [`type: ${yamlDoubleQuoted(e.type)}`, `name: ${yamlDoubleQuoted(e.name)}`];
  if (e.type === 'stdio') parts.push(`cmd: ${yamlDoubleQuoted(e.cmd)}`, `args: ${JSON.stringify(e.args)}`);
  if (e.type === 'sse') parts.push(`uri: ${yamlDoubleQuoted(e.uri)}`);
  if (e.timeout != null) parts.push(`timeout: ${e.timeout}`);
  return `  - { ${parts.join(', ')} }`;
}

function subRecipeToYaml(s: SubRecipeRef): string {
  const parts = [`name: ${yamlDoubleQuoted(s.name)}`, `path: ${yamlDoubleQuoted(s.path)}`];
  if (s.description) parts.push(`description: ${yamlDoubleQuoted(s.description)}`);
  return `  - { ${parts.join(', ')} }`;
}

/** Render a GooseRecipe as YAML. Deterministic; valid YAML for any input. `sub_recipes`
 *  and `response` are emitted only when present (both Optional in Goose). */
export function recipeToYaml(r: GooseRecipe): string {
  const lines: (string | null)[] = [
    `version: ${yamlDoubleQuoted(r.version)}`,
    `title: ${yamlDoubleQuoted(r.title)}`,
    `description: ${yamlDoubleQuoted(r.description)}`,
    'instructions: |',
    indentBlock(r.instructions),
    'prompt: |',
    indentBlock(r.prompt),
    r.extensions.length ? 'extensions:\n' + r.extensions.map(extToYaml).join('\n') : 'extensions: []',
    r.parameters.length
      ? 'parameters:\n' +
        r.parameters
          .map(
            (p) =>
              `  - { key: ${yamlDoubleQuoted(p.key)}, description: ${yamlDoubleQuoted(p.description)}, requirement: ${yamlDoubleQuoted(p.requirement)} }`,
          )
          .join('\n')
      : 'parameters: []',
    r.activities.length ? 'activities:\n' + r.activities.map((a) => `  - ${yamlDoubleQuoted(a)}`).join('\n') : 'activities: []',
    r.subRecipes && r.subRecipes.length ? 'sub_recipes:\n' + r.subRecipes.map(subRecipeToYaml).join('\n') : null,
    r.response ? `response: ${JSON.stringify(r.response)}` : null,
  ];
  return lines.filter((l): l is string => l !== null).join('\n') + '\n';
}
