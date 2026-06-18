import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODELS, EXCLUDED_PROVIDER_IDS, EXCLUDED_PROVIDER_ALIASES } from './models.ts';
import { sortBySovereignty } from '../core/sort.ts';
import type { ModelEntry } from '../core/types.ts';

/**
 * CI guard for the Model Compass registry. Mirrors the cost-estimator's
 * providers.test.ts: it fails the build if an excluded vendor is ever surfaced,
 * if a number was filled in without a verification date, or if a caution label
 * is internally inconsistent.
 */

const EXCLUDED = [...EXCLUDED_PROVIDER_IDS, ...EXCLUDED_PROVIDER_ALIASES].map((s) => s.toLowerCase());

function mentions(text: string, token: string): boolean {
  const esc = token.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  return new RegExp(`(^|[^a-z])${esc}([^a-z]|$)`, 'i').test(text);
}

/** Every number an entry carries, with a label for assertion messages. */
function numbers(m: ModelEntry): Array<[string, number | null]> {
  return [
    ['contextWindow', m.contextWindow],
    ['costPerMTok.input', m.costPerMTok?.input ?? null],
    ['costPerMTok.output', m.costPerMTok?.output ?? null],
    ['codingBenchmark.score', m.codingBenchmark?.score ?? null],
  ];
}

test('no excluded vendor (Meta/OpenAI/xAI/AWS/Oracle) appears in the registry', () => {
  const excludedSet = new Set(EXCLUDED);
  for (const m of MODELS) {
    assert.ok(!excludedSet.has(m.id.toLowerCase()), `excluded id in registry: ${m.id}`);
    for (const token of EXCLUDED) {
      assert.ok(!mentions(m.developer, token), `developer "${m.developer}" references excluded vendor "${token}"`);
      assert.ok(!mentions(m.displayName, token), `displayName "${m.displayName}" references excluded vendor "${token}"`);
    }
  }
});

test('ids are unique', () => {
  const seen = new Set<string>();
  for (const m of MODELS) {
    assert.ok(!seen.has(m.id), `duplicate id: ${m.id}`);
    seen.add(m.id);
  }
});

test('every entry (and benchmark) cites a real https primary source', () => {
  for (const m of MODELS) {
    assert.match(m.sourceUrl, /^https:\/\/\S+$/, `entry sourceUrl must be https: ${m.id}`);
    if (m.codingBenchmark) {
      assert.match(m.codingBenchmark.sourceUrl, /^https:\/\/\S+$/, `benchmark sourceUrl must be https: ${m.id}`);
    }
  }
});

test('numbers are finite or explicitly null; a confirmed number needs lastVerified', () => {
  for (const m of MODELS) {
    for (const [label, value] of numbers(m)) {
      const ok = value === null || (typeof value === 'number' && Number.isFinite(value));
      assert.ok(ok, `bad number ${m.id}/${label} (no NaN/undefined; null means TODO: confirm)`);
      if (value !== null) {
        assert.ok(m.lastVerified, `confirmed number ${m.id}/${label} must carry lastVerified`);
      }
    }
  }
});

test('caution labels are internally consistent', () => {
  for (const m of MODELS) {
    const c = m.caution;
    if (c.level === 'none') {
      assert.equal(c.reason, null, `caution.none must have null reason: ${m.id}`);
      assert.equal(c.jurisdiction, null, `caution.none must have null jurisdiction: ${m.id}`);
      assert.equal(c.mitigation, null, `caution.none must have null mitigation: ${m.id}`);
    } else {
      assert.ok(c.reason && c.reason.length > 0, `caution.${c.level} must give a reason: ${m.id}`);
      assert.ok(c.mitigation && c.mitigation.length > 0, `caution.${c.level} must give a mitigation: ${m.id}`);
    }
  }
});

test('sovereignty-first sort puts a self-hostable, low-caution entry on top and a hosted warning at the bottom', () => {
  const sorted = sortBySovereignty(MODELS);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  assert.ok(first.selfHostable, `top entry should be self-hostable, got ${first.id}`);
  assert.notEqual(first.caution.level, 'warning', `top entry should not carry a warning, got ${first.id}`);
  assert.equal(last.caution.level, 'warning', `bottom entry should carry a warning, got ${last.id}`);
});

test('a hosted-API entry is flagged; self-hostable open weights carry a real SPDX license', () => {
  for (const m of MODELS) {
    if (m.kind === 'frontier-hosted-api') {
      assert.notEqual(m.caution.level, 'none', `hosted API ${m.id} must carry a caution`);
    }
    if (m.kind === 'open-weight-self-hostable') {
      assert.ok(m.selfHostable, `open-weight entry ${m.id} must be selfHostable`);
      assert.ok(m.licenseSpdx && m.licenseSpdx.length > 0, `open-weight entry ${m.id} needs an SPDX license`);
    }
  }
});
