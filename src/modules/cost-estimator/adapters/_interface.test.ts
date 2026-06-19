import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quantityForLine, makeSnapshotAdapter, QUANTITY_ASSUMPTIONS } from './_interface.ts';
import { ALL_ADAPTERS } from './index.ts';
import { PROVIDERS, getProvider, type LineKey, type PriceUnit, type SnapshotLine } from '../registry/providers.ts';
import type { Fetcher, ResolvedUsage } from '../core/types.ts';

const usage: ResolvedUsage = {
  monthlyActiveUsers: 2000,
  bandwidthGB: 50,
  storageGB: 8,
  compute: 'serverless',
  database: { needed: true, sizeGB: 4 },
};

const line = (key: LineKey, unit: PriceUnit): SnapshotLine => ({ key, label: key, unit, unitPrice: null });
const noopFetch: Fetcher = async () => new Response('{}');

test('quantityForLine maps each line key to the right billable quantity', () => {
  assert.equal(quantityForLine(line('base', 'flat-month'), usage), 1);
  // compute billed per 1M requests: MAU × requests/MAU ÷ 1e6
  const expectedRequests = Math.round((usage.monthlyActiveUsers * QUANTITY_ASSUMPTIONS.requestsPerMauPerMonth) / 1_000_000 * 100) / 100;
  assert.equal(quantityForLine(line('compute', '1M-requests'), usage), expectedRequests);
  // compute billed flat → one instance
  assert.equal(quantityForLine(line('compute', 'flat-month'), usage), 1);
  assert.equal(quantityForLine(line('bandwidth', 'GB-egress'), usage), 50);
  assert.equal(quantityForLine(line('storage', 'GB-month'), usage), 8);
});

test('quantityForLine charges database only when one is needed', () => {
  assert.equal(quantityForLine(line('database', 'GB-month'), usage), 4);
  const noDb: ResolvedUsage = { ...usage, database: { needed: false, sizeGB: 4 } };
  assert.equal(quantityForLine(line('database', 'GB-month'), noDb), 0);
});

test('makeSnapshotAdapter quotes from the registry snapshot (all prices null today)', async () => {
  const cf = getProvider('cloudflare')!;
  const quote = await makeSnapshotAdapter('cloudflare').getQuote(usage, noopFetch);
  assert.equal(quote.providerId, 'cloudflare');
  assert.equal(quote.source, 'snapshot');
  assert.equal(quote.currency, cf.currency);
  assert.equal(quote.sourceUrl, cf.sourceUrl);
  assert.equal(quote.lastVerified, cf.lastVerified);
  assert.equal(quote.lineItems.length, cf.lines.length);
  // Every snapshot price is unconfirmed (null) today → no confirmed amount, flagged.
  assert.ok(quote.lineItems.every((li) => li.unitPrice === null && li.amount === null));
  assert.equal(quote.confirmedTotal, 0);
  assert.equal(quote.hasUnconfirmed, true);
});

test('makeSnapshotAdapter throws for an unknown provider id', () => {
  assert.throws(() => makeSnapshotAdapter('does-not-exist'), /Unknown provider/);
});

test('every shipped adapter maps to a real, unique registry provider', () => {
  const ids = new Set(PROVIDERS.map((p) => p.providerId));
  const seen = new Set<string>();
  for (const a of ALL_ADAPTERS) {
    assert.ok(ids.has(a.providerId), `adapter "${a.providerId}" has no registry snapshot`);
    assert.ok(!seen.has(a.providerId), `duplicate adapter for "${a.providerId}"`);
    seen.add(a.providerId);
  }
});
