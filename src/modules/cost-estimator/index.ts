/**
 * Hosting Cost Estimator — public entry.
 *
 * Deterministic arithmetic + data fetching only: NO model call anywhere, and no
 * dependency on the Mentor Engine's reflect() structured-reflection step. It reads
 * its inputs from, and writes its results back into, the shared build session —
 * never a second, parallel state store.
 *
 * The UI mounts as an Astro island; import `ui/CostEstimator.svelte` directly in a
 * page. This entry re-exports the framework-free pieces.
 */
export { estimate, resolveUsageForTier } from './core/estimator.ts';
export {
  deriveUsageFromSession, missingUsageFields, applyOverride,
  writeUsageToSession, writeEstimateToSession,
} from './core/usage-profile.ts';
export { ALL_ADAPTERS } from './adapters/index.ts';
export { makeSnapshotAdapter, QUANTITY_ASSUMPTIONS } from './adapters/_interface.ts';
export { PROVIDERS, EXCLUDED_PROVIDER_IDS, getProvider } from './registry/providers.ts';
export { TIERS } from './config/tiers.ts';
export type {
  UsageProfile, CostEstimate, ResolvedUsage, PricingQuote, PricingLineItem,
  PricingProviderAdapter, Fetcher, TierId, ComputePosture,
} from './core/types.ts';
