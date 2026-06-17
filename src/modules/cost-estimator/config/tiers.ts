import type { TierId, ComputePosture } from '../core/types.ts';

/**
 * The three scale tiers. The estimator projects the builder's own usage across
 * these bands so they can see how cost behaves as they grow.
 *
 * ⚠️ TODO: confirm with product owner — BOTH the baseline bands and the scaling
 * factors below are placeholders, not finalized product decisions. They are kept
 * here, in one file, so they are easy to find and CI-checkable.
 */
export interface TierConfig {
  id: TierId;
  /** Multiplier applied to the builder's entered usage (relative to Seed = 1). */
  scale: number; // TODO: confirm
  /** Absolute fallback band, used per-field only when the builder entered nothing. */
  baseline: {
    monthlyActiveUsers: number; // TODO: confirm
    bandwidthGB: number; // TODO: confirm
    storageGB: number; // TODO: confirm
    compute: ComputePosture; // TODO: confirm
  };
}

export const TIERS: readonly TierConfig[] = [
  // Seed — just launched / validating.
  { id: 'seed', scale: 1, baseline: { monthlyActiveUsers: 500, bandwidthGB: 10, storageGB: 5, compute: 'edge' } }, // TODO: confirm
  // Growth — real traction.
  { id: 'growth', scale: 10, baseline: { monthlyActiveUsers: 10_000, bandwidthGB: 200, storageGB: 100, compute: 'serverless' } }, // TODO: confirm
  // Scale — established product.
  { id: 'scale', scale: 50, baseline: { monthlyActiveUsers: 100_000, bandwidthGB: 2_000, storageGB: 1_000, compute: 'always-on' } }, // TODO: confirm
] as const;

export const TIER_IDS: readonly TierId[] = TIERS.map((t) => t.id);
