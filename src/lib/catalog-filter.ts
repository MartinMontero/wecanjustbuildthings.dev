/**
 * catalog-filter.ts — the Catalog Explorer's pure search/facet/sort logic.
 *
 * The island fetches /catalog.json once and filters ~2k entries entirely
 * client-side. This module holds the deterministic predicate, the faceting, and the
 * sort comparator so they are unit-testable outside Svelte. No DOM, no network.
 */

/** The minimal item shape the filter reads (`_hay` is a precomputed lowercase
 *  search string: name + desc + ecosystem + category + license + protocols). */
export interface FilterableItem {
  kind: string;
  protocols: string[];
  ecosystem: string;
  category: string;
  verification: string;
  uses: number;
  name: string;
  _hay: string;
}

export interface CatalogFacets {
  kind: ReadonlySet<string>;
  protocol: ReadonlySet<string>;
  ecosystem: ReadonlySet<string>;
  category: ReadonlySet<string>;
  verification: ReadonlySet<string>;
}

export type FacetDim = keyof CatalogFacets;

export interface CatalogQuery {
  /** Raw search text; trimmed + lowercased here. */
  text: string;
  facets: CatalogFacets;
}

export type SortMode = 'uses' | 'name';

/**
 * Does an item pass the current query? An empty facet set means "no constraint on
 * that dimension" (not "match nothing"). `skip` excludes one dimension so a facet's
 * own counts aren't narrowed by its own selection (OR-within / AND-across faceting).
 */
export function catalogMatches(it: FilterableItem, query: CatalogQuery, skip?: FacetDim): boolean {
  const text = query.text.trim().toLowerCase();
  if (text && !it._hay.includes(text)) return false;
  const f = query.facets;
  if (skip !== 'kind' && f.kind.size && !f.kind.has(it.kind)) return false;
  if (skip !== 'protocol' && f.protocol.size && !it.protocols.some((p) => f.protocol.has(p))) return false;
  if (skip !== 'ecosystem' && f.ecosystem.size && !f.ecosystem.has(it.ecosystem)) return false;
  if (skip !== 'category' && f.category.size && !f.category.has(it.category)) return false;
  if (skip !== 'verification' && f.verification.size && !f.verification.has(it.verification)) return false;
  return true;
}

/** Sort comparator: by usage (desc, name-tiebreak) or by name (A–Z). */
export function compareItems(sort: SortMode, a: { uses: number; name: string }, b: { uses: number; name: string }): number {
  return sort === 'uses' ? b.uses - a.uses || a.name.localeCompare(b.name) : a.name.localeCompare(b.name);
}

/**
 * Count facet values across the items that match the query with this dimension
 * skipped, sorted by count (desc) then value (A–Z). `get` extracts the value(s) an
 * item contributes (one for single-valued dims, many for protocols).
 */
export function facetCounts<T extends FilterableItem>(
  items: readonly T[],
  query: CatalogQuery,
  dim: FacetDim,
  get: (it: T) => string[],
): [string, number][] {
  const counts = new Map<string, number>();
  for (const it of items) {
    if (!catalogMatches(it, query, dim)) continue;
    for (const v of get(it)) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
