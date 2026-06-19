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
import { yamlDoubleQuoted } from './skill-doc.ts';

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

export interface GooseRecipe {
  version: string;
  title: string;
  description: string;
  instructions: string;
  prompt: string;
  extensions: GooseExtensionRef[];
  parameters: GooseParameter[];
  activities: string[];
  response: { json_schema: JsonSchema };
}

/** Session-derived inputs the serializer needs (narrow + pure for testability). */
export interface RecipeInput {
  title: string;
  slug: string;
  /** The fully-assembled agent prompt (BuildStudio owns its wording). */
  prompt: string;
  /** Candidate extensions chosen on the session; gated against the allowlist. */
  extensions: SessionExtension[];
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
          action: { type: 'string', enum: ['add', 'swap', 'remove'] },
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
export function buildGooseRecipe(input: RecipeInput, allow: ExtensionAllowlist): GooseRecipe {
  const seen = new Set<string>();
  const extensions = input.extensions
    .map((e) => allow.byId[e.catalogId]) // vetted config only — the session is reference-only
    .filter((ref): ref is GooseExtensionRef => Boolean(ref))
    .filter((ref) => (seen.has(ref.name) ? false : (seen.add(ref.name), true)));

  return {
    version: '1.0.0',
    title: input.title,
    description: `Build ${input.slug} — policy-clean (no Meta/OpenAI/xAI), via wecanjustbuildthings.dev`,
    instructions: RECIPE_INSTRUCTIONS,
    prompt: input.prompt,
    extensions,
    parameters: [], // reserved: the prompt is fully rendered, so there are no template variables yet
    activities: activitiesFor(input.slug),
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

/** Render a GooseRecipe as YAML. Deterministic; valid YAML for any input. */
export function recipeToYaml(r: GooseRecipe): string {
  const lines = [
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
    `response: ${JSON.stringify(r.response)}`,
  ];
  return lines.join('\n') + '\n';
}
