import { makeSnapshotAdapter, type PricingProviderAdapter } from './_interface.ts';

/**
 * Cloudflare adapter. Resolves from the dated snapshot: Cloudflare publishes no
 * first-party machine-readable pricing API (verified Jun 2026), so no live
 * adapter is written here. If a verifiable endpoint ever appears, replace this
 * with a live adapter behind the same `PricingProviderAdapter` interface.
 */
export const cloudflareAdapter: PricingProviderAdapter = makeSnapshotAdapter('cloudflare');
