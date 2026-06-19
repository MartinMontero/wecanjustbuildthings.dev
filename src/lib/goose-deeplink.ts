/**
 * goose-deeplink.ts — pure, client-side Goose recipe deeplinks (Slice C). Encodes a
 * GooseRecipe into `goose://recipe?config=<base64>` with a UTF-8-safe base64 wrapper
 * (mirrors the encoder in src/components/AccountWidget.astro), and models the
 * explain-before-launch panel. No DOM, no network, deterministic.
 *
 * STABLE primitive only: recipe deeplinks. `goose serve` / ACP / the TS SDK are out of
 * scope (see PLAN.md §5).
 */
import type { GooseRecipe } from './goose-recipe.ts';

/** Above this encoded size the UI must fall back to copy-link / download — custom-scheme
 *  URL limits vary by OS/browser, so 8 KB is a conservative, safe budget. */
export const DEEPLINK_MAX_BYTES = 8192;

const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder();

/** UTF-8-safe base64 of any string (btoa is latin1-only, so encode to bytes first). */
function base64Encode(s: string): string {
  let binary = '';
  for (const byte of utf8.encode(s)) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function base64Decode(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return fromUtf8.decode(bytes);
}

/** recipe → the `config` query value (UTF-8-safe base64 of the recipe JSON). */
export function encodeRecipeConfig(recipe: GooseRecipe): string {
  return base64Encode(JSON.stringify(recipe));
}
/** Inverse of encodeRecipeConfig (round-trip / tests). */
export function decodeRecipeConfig(config: string): GooseRecipe {
  return JSON.parse(base64Decode(config)) as GooseRecipe;
}

export interface RecipeDeeplink {
  url: string;
  bytes: number;
  /** false ⇒ the encoded link exceeds the budget; the UI shows the copy/download fallback. */
  withinBudget: boolean;
}
export function recipeDeeplink(recipe: GooseRecipe): RecipeDeeplink {
  const url = `goose://recipe?config=${encodeRecipeConfig(recipe)}`;
  const bytes = utf8.encode(url).length;
  return { url, bytes, withinBudget: bytes <= DEEPLINK_MAX_BYTES };
}

/** Plain-language, non-dev description of what an extension can do — never raw config. */
function explainExtension(e: GooseRecipe['extensions'][number]): string {
  if (e.type === 'builtin') return 'A built-in Goose capability.';
  if (e.type === 'stdio') return 'Runs a vetted helper tool on your computer.';
  return 'Connects to a vetted online service.';
}

export interface ExplainModel {
  title: string;
  /** One entry per extension the recipe will ask Goose to load. */
  extensions: Array<{ name: string; why: string }>;
  /** Always true: Goose's own "Trust & Execute" consent gates the actual run. */
  willDoNothingUntilUserConsents: true;
}
/** What the explain-before-launch panel shows before the builder opens Goose. */
export function explainRecipe(recipe: GooseRecipe): ExplainModel {
  return {
    title: recipe.title,
    extensions: recipe.extensions.map((e) => ({ name: e.name, why: explainExtension(e) })),
    willDoNothingUntilUserConsents: true,
  };
}
