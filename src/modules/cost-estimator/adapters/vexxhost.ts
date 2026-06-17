import { makeSnapshotAdapter, type PricingProviderAdapter } from './_interface.ts';

/**
 * VEXXHOST adapter. Snapshot-only — no public machine-readable pricing API found
 * (verified Jun 2026). Source: https://vexxhost.com/pricing/.
 */
export const vexxhostAdapter: PricingProviderAdapter = makeSnapshotAdapter('vexxhost');
