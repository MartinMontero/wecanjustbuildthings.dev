import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

/**
 * Static JSON API of every catalog entry, emitted at build time to /catalog.json.
 * The interactive Catalog Explorer and Build Studio fetch this and filter it
 * entirely client-side — no server round-trips, instant faceting.
 */
const TOOL_TYPES = new Set(['tool', 'framework', 'library', 'service', 'protocol']);
const INDEXED_TYPES = new Set([...TOOL_TYPES, 'dataset']);

export const GET: APIRoute = async () => {
  const entries = await getCollection(
    'docs',
    ({ data }) => Boolean(data.entry_type) && INDEXED_TYPES.has(data.entry_type as string),
  );

  const items = entries.map((e) => ({
    name: (e.data.dependency_name as string) ?? e.data.title,
    url: `/${e.id}/`,
    kind: e.data.entry_type === 'dataset' ? 'dataset' : 'tool',
    ecosystem: (e.data.ecosystem as string) ?? 'other',
    category: (e.data.category as string) ?? 'Misc & Everything Else',
    protocols: (e.data.protocols as string[]) ?? [],
    license: (e.data.license_spdx as string) ?? 'unknown',
    licenseUrl: (e.data.license_source_url as string) ?? null,
    commit: (e.data.license_source_commit_sha as string) ?? null,
    verifiedAt: (e.data.verified_at as string) ?? null,
    maintenance: (e.data.maintenance_status as string) ?? 'unknown',
    version: (e.data.version as string) ?? null,
    verification: (e.data.verification_status as string) ?? 'under_review',
    advisory: (e.data.origin_advisory as string) ?? null,
    blockedReason: (e.data.verification_blocked_reason as string) ?? null,
    providerAgnostic: Boolean(e.data.provider_agnostic),
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
