import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

/**
 * Static allowlist of VETTED Goose extensions — the MCP trust boundary. Only
 * entry_type 'extension' entries that are verification_status 'verified' are exposed to
 * the client recipe serializer, shaped as { byId: { [slug]: GooseExtensionRef } } so
 * buildGooseRecipe() can resolve a session's extension references to vetted config.
 * Raw config never reaches a non-dev's screen — it flows from here straight into the
 * recipe Goose runs.
 */
export const GET: APIRoute = async () => {
  const entries = await getCollection(
    'docs',
    ({ data }) => data.entry_type === 'extension' && data.verification_status === 'verified',
  );

  const byId: Record<string, unknown> = {};
  for (const e of entries) {
    const type = e.data.goose_extension_type as 'builtin' | 'stdio' | 'sse' | undefined;
    if (!type) continue;
    const name = (e.data.dependency_name as string) ?? e.data.title;
    const timeout = e.data.goose_extension_timeout as number | undefined;

    let ref: Record<string, unknown> | null = null;
    if (type === 'builtin') ref = { type, name };
    else if (type === 'stdio') ref = { type, name, cmd: e.data.goose_extension_command, args: (e.data.goose_extension_args as string[]) ?? [] };
    else if (type === 'sse') ref = { type, name, uri: e.data.goose_extension_uri };
    if (!ref) continue;
    if (timeout != null) ref.timeout = timeout;
    byId[e.id] = ref;
  }

  return new Response(JSON.stringify({ byId }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
