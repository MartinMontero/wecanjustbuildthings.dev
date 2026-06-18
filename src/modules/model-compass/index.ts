/**
 * Model Compass — public entry.
 *
 * An informational, sovereignty-first comparison of independent LLM tools/models.
 * Framework-free data + pure helpers only: NO model call, NO key proxying — it
 * stays compatible with the static-hosting / BYO-key invariant. The UI mounts as
 * an Astro island (Phase 2): import `ui/ModelCompass.svelte` directly in a page.
 */
export { MODELS, EXCLUDED_PROVIDER_IDS, EXCLUDED_PROVIDER_ALIASES, getModel } from './registry/models.ts';
export { sortBySovereignty, sovereigntyRank } from './core/sort.ts';
export { STRINGS, normalizeLang } from './ui/i18n.ts';
export type { Lang, ModelCompassStrings } from './ui/i18n.ts';
export type { ModelEntry, Tier, ModelKind, Caution, CautionLevel, CodingBenchmark } from './core/types.ts';
