import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROVIDERS, EXCLUDED_PROVIDER_IDS, EXCLUDED_PROVIDER_ALIASES, getProvider,
  type LineKey, type PriceUnit,
} from './providers.ts';

/**
 * CI guard (registry half). The dependency-tree half — no Meta/OpenAI/xAI package
 * anywhere in node_modules — is already enforced by the three-layer enforcement
 * engine (`verify.yml`: `enforcement/cli.ts layer1/layer2 --tree .`). This test
 * fails the build if an excluded vendor is ever added as a *provider*.
 */

const EXCLUDED = [...EXCLUDED_PROVIDER_IDS, ...EXCLUDED_PROVIDER_ALIASES].map((s) => s.toLowerCase());

function nameMentions(name: string, token: string): boolean {
  const esc = token.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  return new RegExp(`(^|[^a-z])${esc}([^a-z]|$)`, 'i').test(name);
}

test('no excluded vendor (Meta/OpenAI/xAI/AWS/Oracle) appears as a provider', () => {
  const excludedSet = new Set(EXCLUDED);
  for (const p of PROVIDERS) {
    assert.ok(!excludedSet.has(p.providerId.toLowerCase()), `excluded provider id in registry: ${p.providerId}`);
    for (const token of EXCLUDED) {
      assert.ok(!nameMentions(p.providerName, token), `provider name "${p.providerName}" references excluded vendor "${token}"`);
    }
  }
});

test('every provider cites a real https primary source', () => {
  for (const p of PROVIDERS) {
    assert.match(p.sourceUrl, /^https:\/\/\S+$/, `provider sourceUrl must be a real https URL: ${p.providerId}`);
  }
});

test('prices are a finite number or an explicit null; a confirmed price needs a verification date', () => {
  for (const p of PROVIDERS) {
    for (const line of p.lines) {
      const ok = line.unitPrice === null || (typeof line.unitPrice === 'number' && Number.isFinite(line.unitPrice));
      assert.ok(ok, `bad unitPrice for ${p.providerId}/${line.key} (no NaN/undefined; null means TODO: confirm)`);
      if (line.unitPrice !== null) {
        assert.ok(p.lastVerified, `confirmed price for ${p.providerId} must carry lastVerified`);
      }
    }
  }
});

test('getProvider resolves a known id and returns undefined otherwise', () => {
  assert.equal(getProvider('cloudflare')?.providerId, 'cloudflare');
  assert.equal(getProvider('nope-not-a-provider'), undefined);
});

test('provider ids are unique, so getProvider can never be ambiguous', () => {
  const ids = PROVIDERS.map((p) => p.providerId);
  assert.equal(new Set(ids).size, ids.length, 'duplicate providerId in the registry');
});

test('each price line uses a unit the quantity logic understands (registry ↔ math coupling)', () => {
  // quantityForLine in _interface.ts keys off line.key and (for compute) line.unit;
  // a drifted unit would silently mis-bill. Lock the pairings the math assumes.
  const VALID: Record<LineKey, PriceUnit[]> = {
    base: ['flat-month'],
    compute: ['flat-month', '1M-requests'],
    bandwidth: ['GB-egress'],
    storage: ['GB-month'],
    database: ['GB-month'],
  };
  for (const p of PROVIDERS) {
    for (const line of p.lines) {
      assert.ok(VALID[line.key].includes(line.unit), `${p.providerId}/${line.key} has unexpected unit "${line.unit}"`);
    }
  }
});
