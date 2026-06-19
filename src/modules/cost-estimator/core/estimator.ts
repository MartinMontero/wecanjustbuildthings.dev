import type {
  ComputePosture, CostEstimate, CostEstimateTier, EstimateDataSource, Fetcher,
  PricingProviderAdapter, ResolvedUsage, TierId, UsageField, UsageProfile,
} from './types.ts';
import { TIERS, type TierConfig } from '../config/tiers.ts';

/**
 * The deterministic estimator core. Pure arithmetic + adapter calls; no model, no
 * DOM, no session — safe to run in the browser (Path C) or the Worker (Path A).
 */

const TIER_LABEL: Record<TierId, string> = { seed: 'Seed', growth: 'Growth', scale: 'Scale' };

const COMPUTE_POSTURES: readonly ComputePosture[] = ['edge', 'serverless', 'always-on'];
const USAGE_FIELDS: readonly UsageField[] = ['monthlyActiveUsers', 'bandwidthGB', 'storageGB', 'compute', 'database'];

/** A finite, non-negative number, or null. NaN / Infinity / negative / non-number
 *  all become null, so the estimator falls back to the tier baseline instead of
 *  multiplying garbage into a total. */
const finiteNonNeg = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

/**
 * Coerce an untrusted value into a valid UsageProfile before any arithmetic runs.
 * Both inputs are untrusted: the Path-A `/api/pricing` endpoint is unauthenticated,
 * and the Path-C source is localStorage (writable by the user, extensions, and any
 * same-origin script). Every field is normalised to its declared type — invalid
 * numbers → null (→ baseline), unknown compute/database/source shapes → dropped —
 * so a hostile or corrupt profile can never poison an estimate with NaN/Infinity/
 * negatives. A well-formed profile passes through unchanged.
 */
export function coerceUsageProfile(input: unknown): UsageProfile {
  const u = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const db = u.database && typeof u.database === 'object' ? (u.database as Record<string, unknown>) : null;
  const rawSource = u.source && typeof u.source === 'object' && !Array.isArray(u.source)
    ? (u.source as Record<string, unknown>)
    : {};
  const source: UsageProfile['source'] = {};
  for (const f of USAGE_FIELDS) {
    const marker = rawSource[f];
    if (marker === 'manual' || marker === 'derived') source[f] = marker;
  }
  return {
    monthlyActiveUsers: finiteNonNeg(u.monthlyActiveUsers),
    bandwidthGB: finiteNonNeg(u.bandwidthGB),
    storageGB: finiteNonNeg(u.storageGB),
    compute: COMPUTE_POSTURES.includes(u.compute as ComputePosture) ? (u.compute as ComputePosture) : null,
    database: db ? { needed: db.needed === true, sizeGB: finiteNonNeg(db.sizeGB) } : null,
    source,
  };
}

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
