import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimate, resolveUsageForTier, coerceUsageProfile } from './estimator.ts';
import type { Fetcher, PricingProviderAdapter, ResolvedUsage, UsageProfile } from './types.ts';
import { TIERS } from '../config/tiers.ts';

const noopFetch: Fetcher = async () => new Response('{}');

// A fixture adapter with KNOWN prices, so the arithmetic is proven independently
// of the real registry snapshots (whose prices are intentionally unconfirmed).
const fixtureAdapter: PricingProviderAdapter = {
  providerId: 'fixture',
  providerName: 'Fixture',
  async getQuote(u: ResolvedUsage) {
    const lineItems = [
      { label: 'storage', unit: 'GB-month', quantity: u.storageGB, unitPrice: 2, amount: u.storageGB * 2 },
      { label: 'bandwidth', unit: 'GB-egress', quantity: u.bandwidthGB, unitPrice: 0.5, amount: u.bandwidthGB * 0.5 },
      { label: 'unconfirmed', unit: 'flat-month', quantity: 1, unitPrice: null, amount: null },
    ];
    const confirmedTotal = lineItems.reduce((s, l) => s + (l.amount ?? 0), 0);
    return {
      providerId: 'fixture', providerName: 'Fixture', currency: 'USD',
      lineItems, confirmedTotal, hasUnconfirmed: true,
      source: 'snapshot', lastVerified: null, sourceUrl: 'https://example.test',
    };
  },
};

test('resolveUsageForTier scales entered usage and falls back to baselines', () => {
  const usage: UsageProfile = {
    monthlyActiveUsers: 100, bandwidthGB: null, storageGB: 4,
    compute: 'serverless', database: { needed: true, sizeGB: 2 }, source: {},
  };
  const seed = resolveUsageForTier(usage, TIERS[0]!); // scale 1
  const growth = resolveUsageForTier(usage, TIERS[1]!); // scale 10
  assert.equal(seed.monthlyActiveUsers, 100);
  assert.equal(growth.monthlyActiveUsers, 1000);
  assert.equal(seed.storageGB, 4);
  assert.equal(growth.storageGB, 40);
  // bandwidth not entered → tier baseline used (not scaled)
  assert.equal(seed.bandwidthGB, TIERS[0]!.baseline.bandwidthGB);
  assert.equal(growth.bandwidthGB, TIERS[1]!.baseline.bandwidthGB);
  // database size scales when needed
  assert.equal(growth.database.sizeGB, 20);
});

test('estimate computes line-item math + confirmed totals across all three tiers', async () => {
  const usage: UsageProfile = {
    monthlyActiveUsers: 100, bandwidthGB: 10, storageGB: 4,
    compute: 'serverless', database: { needed: false, sizeGB: null }, source: {},
  };
  const est = await estimate({ usage, adapters: [fixtureAdapter], fetcher: noopFetch, dataSource: 'pathC-client' });
  assert.equal(est.tiers.length, 3);
  // Seed (scale 1): storage 4*2 + bandwidth 10*0.5 = 13; unconfirmed line excluded.
  const seed = est.tiers[0]!.quotes[0]!;
  assert.equal(seed.confirmedTotal, 13);
  assert.equal(seed.hasUnconfirmed, true);
  // Scale (scale 50): storage 200*2 + bandwidth 500*0.5 = 650.
  const scale = est.tiers[2]!.quotes[0]!;
  assert.equal(scale.confirmedTotal, 650);
});

test('coerceUsageProfile passes a well-formed profile through unchanged', () => {
  const valid: UsageProfile = {
    monthlyActiveUsers: 0, bandwidthGB: 12.5, storageGB: 4,
    compute: 'serverless', database: { needed: true, sizeGB: 2 },
    source: { monthlyActiveUsers: 'manual', database: 'derived' },
  };
  assert.deepEqual(coerceUsageProfile(valid), valid);
});

test('coerceUsageProfile nulls invalid numbers (negative / Infinity / NaN / string)', () => {
  const u = coerceUsageProfile({
    monthlyActiveUsers: -5, bandwidthGB: Number.POSITIVE_INFINITY, storageGB: 'lots',
    compute: 'serverless', database: { needed: true, sizeGB: Number.NaN }, source: {},
  });
  assert.equal(u.monthlyActiveUsers, null);
  assert.equal(u.bandwidthGB, null);
  assert.equal(u.storageGB, null);
  assert.equal(u.database?.needed, true); // needed is boolean-coerced, kept
  assert.equal(u.database?.sizeGB, null); // NaN size dropped
});

test('coerceUsageProfile drops unknown compute and non-object database/source', () => {
  const u = coerceUsageProfile({ compute: 'quantum', database: 'yes', source: ['x'] });
  assert.equal(u.compute, null);
  assert.equal(u.database, null);
  assert.deepEqual(u.source, {});
});

test('coerceUsageProfile keeps only valid manual/derived source markers', () => {
  const u = coerceUsageProfile({ source: { monthlyActiveUsers: 'manual', bandwidthGB: 'bogus', storageGB: 'derived' } });
  assert.deepEqual(u.source, { monthlyActiveUsers: 'manual', storageGB: 'derived' });
});

test('coerceUsageProfile maps garbage input to an all-null profile (→ all baselines)', () => {
  assert.deepEqual(coerceUsageProfile(null), {
    monthlyActiveUsers: null, bandwidthGB: null, storageGB: null,
    compute: null, database: null, source: {},
  });
});

test('a sanitized hostile profile yields a finite estimate, never NaN/Infinity', async () => {
  const dirty = coerceUsageProfile({ monthlyActiveUsers: -1, bandwidthGB: 'x', storageGB: Number.POSITIVE_INFINITY, source: {} });
  const est = await estimate({ usage: dirty, adapters: [fixtureAdapter], fetcher: noopFetch, dataSource: 'pathA-function' });
  for (const tier of est.tiers) {
    for (const quote of tier.quotes) assert.ok(Number.isFinite(quote.confirmedTotal), 'total must be finite');
  }
});
