import { makeSnapshotAdapter, type PricingProviderAdapter } from './_interface.ts';

/**
 * Denvr Dataworks adapter. Snapshot-only — pricing is page/console-based with no
 * public machine-readable pricing API found (verified Jun 2026).
 * Source: https://www.denvr.com/pricing.
 */
export const denvrAdapter: PricingProviderAdapter = makeSnapshotAdapter('denvr');
