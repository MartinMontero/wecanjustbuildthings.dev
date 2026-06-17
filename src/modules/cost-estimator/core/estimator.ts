import type {
  CostEstimate, CostEstimateTier, EstimateDataSource, Fetcher,
  PricingProviderAdapter, ResolvedUsage, TierId, UsageProfile,
} from './types.ts';
import { TIERS, type TierConfig } from '../config/tiers.ts';

/**
 * The deterministic estimator core. Pure arithmetic + adapter calls; no model, no
 * DOM, no session — safe to run in the browser (Path C) or the Worker (Path A).
 */

const TIER_LABEL: Record<TierId, string> = { seed: 'Seed', growth: 'Growth', scale: 'Scale' };

/** Project the builder's usage onto one tier: entered values scale by the tier's
 *  factor; un-entered values fall back to the tier's baseline band. */
export function resolveUsageForTier(usage: UsageProfile, tier: TierConfig): ResolvedUsage {
  const scaled = (v: number | null, baseline: number): number => (v != null ? v * tier.scale : baseline);
  const dbNeeded = usage.database?.needed ?? false;
  const dbSize = usage.database?.sizeGB ?? null;
  return {
    monthlyActiveUsers: scaled(usage.monthlyActiveUsers, tier.baseline.monthlyActiveUsers),
    bandwidthGB: scaled(usage.bandwidthGB, tier.baseline.bandwidthGB),
    storageGB: scaled(usage.storageGB, tier.baseline.storageGB),
    compute: usage.compute ?? tier.baseline.compute,
    database: { needed: dbNeeded, sizeGB: dbNeeded ? (dbSize != null ? dbSize * tier.scale : 0) : 0 },
  };
}

/** Produce one estimate per tier, per provider. */
export async function estimate(opts: {
  usage: UsageProfile;
  adapters: readonly PricingProviderAdapter[];
  fetcher: Fetcher;
  dataSource: EstimateDataSource;
  tiers?: readonly TierConfig[];
}): Promise<CostEstimate> {
  const tiers = opts.tiers ?? TIERS;
  const tierResults: CostEstimateTier[] = [];
  for (const tier of tiers) {
    const resolvedUsage = resolveUsageForTier(opts.usage, tier);
    const quotes = await Promise.all(opts.adapters.map((a) => a.getQuote(resolvedUsage, opts.fetcher)));
    tierResults.push({ tierId: tier.id, label: TIER_LABEL[tier.id], resolvedUsage, quotes });
  }
  return {
    computedAt: new Date().toISOString(),
    dataSource: opts.dataSource,
    tiers: tierResults,
  };
}
