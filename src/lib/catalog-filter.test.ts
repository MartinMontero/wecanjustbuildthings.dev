import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogMatches, compareItems, facetCounts, type CatalogQuery, type FilterableItem } from './catalog-filter.ts';

function item(p: Partial<FilterableItem>): FilterableItem {
  const base: FilterableItem = {
    kind: 'tool', protocols: [], ecosystem: 'js', category: 'Misc',
    verification: 'verified', uses: 0, name: 'x', _hay: '',
  };
  const merged = { ...base, ...p };
  merged._hay = `${merged.name} ${merged.ecosystem} ${merged.category} ${merged.protocols.join(' ')}`.toLowerCase();
  return merged;
}

const NONE: CatalogQuery = { text: '', facets: { kind: new Set(), protocol: new Set(), ecosystem: new Set(), category: new Set(), verification: new Set() } };
const withFacets = (f: Partial<CatalogQuery['facets']>): CatalogQuery => ({ text: '', facets: { ...NONE.facets, ...f } });

test('an empty query matches everything (empty facet ≠ match-nothing)', () => {
  assert.equal(catalogMatches(item({ name: 'anything' }), NONE), true);
});

test('text search hits the precomputed _hay haystack, case-insensitively', () => {
  const it = item({ name: 'Nostr Relay', ecosystem: 'go' });
  assert.equal(catalogMatches(it, { ...NONE, text: '  NOSTR ' }), true);
  assert.equal(catalogMatches(it, { ...NONE, text: 'rust' }), false);
});

test('facets are AND-across dimensions, OR-within a dimension', () => {
  const it = item({ kind: 'tool', protocols: ['nostr', 'atproto'] });
  // OR-within: matching any selected protocol passes
  assert.equal(catalogMatches(it, withFacets({ protocol: new Set(['atproto']) })), true);
  assert.equal(catalogMatches(it, withFacets({ protocol: new Set(['lightning']) })), false);
  // AND-across: a non-matching second dimension fails the whole predicate
  assert.equal(catalogMatches(it, withFacets({ kind: new Set(['tool']), protocol: new Set(['nostr']) })), true);
  assert.equal(catalogMatches(it, withFacets({ kind: new Set(['dataset']), protocol: new Set(['nostr']) })), false);
});

test('skip excludes one dimension (so a facet is not narrowed by its own selection)', () => {
  const it = item({ kind: 'dataset' });
  const q = withFacets({ kind: new Set(['tool']) }); // would exclude this dataset
  assert.equal(catalogMatches(it, q), false);
  assert.equal(catalogMatches(it, q, 'kind'), true); // its own dimension skipped
});

test('compareItems sorts by uses desc (name tiebreak) or by name', () => {
  const a = { uses: 10, name: 'Beta' };
  const b = { uses: 10, name: 'Alpha' };
  const c = { uses: 99, name: 'Zeta' };
  assert.deepEqual([a, b, c].sort((x, y) => compareItems('uses', x, y)), [c, b, a]); // c first, then name tiebreak
  assert.deepEqual([a, b, c].sort((x, y) => compareItems('name', x, y)), [b, a, c]); // Alpha, Beta, Zeta
});

test('facetCounts tallies the matching items and sorts by count then value', () => {
  const items = [
    item({ ecosystem: 'js', protocols: ['nostr'] }),
    item({ ecosystem: 'js', protocols: ['nostr', 'atproto'] }),
    item({ ecosystem: 'go', protocols: ['atproto'] }),
  ];
  assert.deepEqual(facetCounts(items, NONE, 'ecosystem', (it) => [it.ecosystem]), [['js', 2], ['go', 1]]);
  // protocols are multi-valued; nostr(2) before atproto(2) → count tie broken A–Z
  assert.deepEqual(facetCounts(items, NONE, 'protocol', (it) => it.protocols), [['atproto', 2], ['nostr', 2]]);
});

test('facetCounts for a dimension ignores that dimension’s own active selection', () => {
  const items = [item({ kind: 'tool' }), item({ kind: 'tool' }), item({ kind: 'dataset' })];
  const q = withFacets({ kind: new Set(['tool']) });
  // Even with 'tool' selected, the kind facet still shows the dataset option (skip='kind').
  assert.deepEqual(facetCounts(items, q, 'kind', (it) => [it.kind]), [['tool', 2], ['dataset', 1]]);
});
