/**
 * Cost-estimator core types — pure, framework-free, and safe to import in BOTH
 * the browser (Path C) and the Cloudflare Worker (Path A).
 *
 * Hard rule: this file must NOT import build-session.ts. The session re-uses
 * `UsageProfile` / `CostEstimate` from here (type-only), not the other way round,
 * because build-session is Window/localStorage-bound and the Worker's lib has no
 * `localStorage`. Keeping the dependency one-directional is what lets the same
 * estimator core run server-side without dragging the DOM in.
 */

/** Compute posture, derived from the build session's constraints or overridden. */
export type ComputePosture = 'edge' | 'serverless' | 'always-on';

export type UsageField = 'monthlyActiveUsers' | 'bandwidthGB' | 'storageGB' | 'compute' | 'database';

/**
 * The estimator's inputs. Numeric fields are null until derived from the session
 * or entered by the builder; `source` records, per field, which one it was — so
 * the UI can show what it inferred vs. what the builder set.
 */
export interface UsageProfile {
  monthlyActiveUsers: number | null;
  bandwidthGB: number | null;
  storageGB: number | null;
  compute: ComputePosture | null;
  database: { needed: boolean; sizeGB: number | null } | null;
  source: Partial<Record<UsageField, 'derived' | 'manual'>>;
}

export type TierId = 'seed' | 'growth' | 'scale';

/** Where the network fetch happens. The same adapters run in both Path A and
 *  Path C; only the injected fetcher differs. */
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export type PriceProvenance = 'live' | 'snapshot';

/**
 * One usage→cost line. `unitPrice === null` means "not yet confirmed against a
 * primary source": the estimator carries the line for transparency but excludes
 * it from the confirmed total. Never fabricate a number to avoid a null.
 */
export interface PricingLineItem {
  label: string;
  unit: string; // e.g. "GB-month", "1M-requests", "flat-month"
  quantity: number;
  unitPrice: number | null; // null ⇒ TODO: confirm
  amount: number | null; // quantity * unitPrice, or null when unitPrice is null
}

export interface PricingQuote {
  providerId: string;
  providerName: string;
  currency: string; // ISO 4217
  lineItems: PricingLineItem[];
  confirmedTotal: number; // sum of non-null amounts
  hasUnconfirmed: boolean; // any line with a null unitPrice
  source: PriceProvenance;
  lastVerified: string | null; // ISO date; null ⇒ TODO: confirm
  sourceUrl: string; // primary source the price must be confirmed against
}

/** A usage profile resolved to concrete numbers for one tier (post-scaling). */
export interface ResolvedUsage {
  monthlyActiveUsers: number;
  bandwidthGB: number;
  storageGB: number;
  compute: ComputePosture;
  database: { needed: boolean; sizeGB: number };
}

export interface PricingProviderAdapter {
  providerId: string;
  providerName: string;
  /** Live where a verifiable endpoint exists; otherwise resolves from the dated
   *  registry snapshot. `fetcher` is injected so the same adapter runs in the
   *  browser (Path C) or the Worker (Path A). */
  getQuote(usage: ResolvedUsage, fetcher: Fetcher): Promise<PricingQuote>;
}

// ---- Results written back into the build session ----

export interface CostEstimateTier {
  tierId: TierId;
  label: string;
  resolvedUsage: ResolvedUsage;
  quotes: PricingQuote[];
}

export type EstimateDataSource = 'pathA-function' | 'pathC-client';

export interface CostEstimate {
  computedAt: string; // ISO timestamp
  dataSource: EstimateDataSource;
  tiers: CostEstimateTier[];
}
