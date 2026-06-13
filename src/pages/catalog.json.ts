import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

/**
 * Static JSON API of every catalog entry, emitted at build time to /catalog.json.
 * The interactive Catalog Explorer and Build Studio fetch this and filter it
 * entirely client-side — no server round-trips, instant faceting.
 */
const CATALOG_TYPES = new Set(['tool', 'framework', 'library', 'service', 'protocol']);

export const GET: APIRoute = async () => {
  const entries = await getCollection(
    'docs',
    ({ data }) => Boolean(data.entry_type) && CATALOG_TYPES.has(data.entry_type as string),
  );

  const items = entries.map((e) => ({
    name: (e.data.dependency_name as string) ?? e.data.title,
    url: `/${e.id}/`,
    ecosystem: (e.data.ecosystem as string) ?? 'other',
    category: (e.data.category as string) ?? 'Misc & Everything Else',
    protocols: (e.data.protocols as string[]) ?? [],
    license: (e.data.license_spdx as string) ?? 'unknown',
    maintenance: (e.data.maintenance_status as string) ?? 'unknown',
    verification: (e.data.verification_status as string) ?? 'under_review',
    advisory: (e.data.origin_advisory as string) ?? null,
    repo: (e.data.repo_url as string) ?? null,
    registry: (e.data.registry_url as string) ?? null,
    uses: (e.data.aos_repos_using as number) ?? 0,
    pie: (e.data.pie_anchor as string) ?? '',
    desc: (e.data.what_it_does as string) ?? '',
  }));

  items.sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name));

  return new Response(JSON.stringify(items), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
