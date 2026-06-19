import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { buildExtensionAllowlist, type ExtensionEntry } from '../lib/goose-recipe.ts';

/**
 * Static allowlist of VETTED Goose extensions — the MCP trust boundary. The verified-
 * only gate + shaping lives in buildExtensionAllowlist() (pure + unit-tested); here we
 * just feed it the catalog's 'extension' entries. Raw config never reaches a non-dev's
 * screen — it flows from a verified Catalog entry straight into the recipe Goose runs.
 */
export const GET: APIRoute = async () => {
  const entries = await getCollection('docs', ({ data }) => data.entry_type === 'extension');
  const allow = buildExtensionAllowlist(
    entries.map((e) => ({ id: e.id, data: e.data as ExtensionEntry['data'] })),
  );
  return new Response(JSON.stringify(allow), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
