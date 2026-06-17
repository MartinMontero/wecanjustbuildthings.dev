import type { Fetcher, PricingLineItem, PricingProviderAdapter, PricingQuote, ResolvedUsage } from '../core/types.ts';
import { getProvider, type SnapshotLine } from '../registry/providers.ts';

// One import site for the adapter contract.
export type { PricingProviderAdapter, PricingQuote, Fetcher } from '../core/types.ts';

/**
 * Usage → billable-quantity assumptions: how a resolved usage profile maps to the
 * units providers actually bill in. Deliberate, documented estimates —
 * ⚠️ TODO: confirm with product owner.
 */
export const QUANTITY_ASSUMPTIONS = {
  /** Monthly inbound requests generated per active user. */
  requestsPerMauPerMonth: 1000, // TODO: confirm
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Map one snapshot line to a billable quantity from the resolved usage. */
export function quantityForLine(line: SnapshotLine, usage: ResolvedUsage): number {
  switch (line.key) {
    case 'base':
      return 1;
    case 'compute':
      if (line.unit === '1M-requests') {
        return round2((usage.monthlyActiveUsers * QUANTITY_ASSUMPTIONS.requestsPerMauPerMonth) / 1_000_000);
      }
      // flat-month compute (one instance). Posture sensitivity is a TODO: confirm.
      return 1;
    case 'bandwidth':
      return usage.bandwidthGB;
    case 'storage':
      return usage.storageGB;
    case 'database':
      return usage.database.needed ? usage.database.sizeGB : 0;
    default:
      return 0;
  }
}

function toLineItem(line: SnapshotLine, usage: ResolvedUsage): PricingLineItem {
  const quantity = quantityForLine(line, usage);
  const amount = line.unitPrice === null ? null : round2(line.unitPrice * quantity);
  return { label: line.label, unit: line.unit, quantity, unitPrice: line.unitPrice, amount };
}

/**
 * Generic snapshot adapter — resolves a quote from the dated registry snapshot.
 * `fetcher` is intentionally unused (snapshots need no network); it exists so a
 * future LIVE adapter for the provider can drop in behind the same interface
 * without changing the estimator core.
 */
export function makeSnapshotAdapter(providerId: string): PricingProviderAdapter {
  const snapshot = getProvider(providerId);
  if (!snapshot) throw new Error(`Unknown provider in registry: ${providerId}`);
  return {
    providerId: snapshot.providerId,
    providerName: snapshot.providerName,
    async getQuote(usage: ResolvedUsage, _fetcher: Fetcher): Promise<PricingQuote> {
      const lineItems = snapshot.lines.map((line) => toLineItem(line, usage));
      const confirmedTotal = round2(lineItems.reduce((sum, li) => sum + (li.amount ?? 0), 0));
      const hasUnconfirmed = lineItems.some((li) => li.unitPrice === null);
      return {
        providerId: snapshot.providerId,
        providerName: snapshot.providerName,
        currency: snapshot.currency,
        lineItems,
        confirmedTotal,
        hasUnconfirmed,
        source: 'snapshot',
        lastVerified: snapshot.lastVerified,
        sourceUrl: snapshot.sourceUrl,
      };
    },
  };
}
