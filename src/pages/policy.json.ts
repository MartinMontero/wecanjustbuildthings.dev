import type { APIRoute } from 'astro';
import { join } from 'node:path';
import { loadExcludedOrgs, loadProviderSignals } from '../../enforcement/config.ts';

/**
 * The exclusion policy, emitted at build time to /policy.json so the browser-side
 * dependency checker can run the exact same offline matcher the CI engine uses.
 * Paths are resolved from the project root (cwd) because the default
 * import.meta.url-relative lookup doesn't survive bundling.
 */
export const GET: APIRoute = () => {
  const root = process.cwd();
  return new Response(
    JSON.stringify({
      orgs: loadExcludedOrgs(join(root, 'enforcement/excluded-organizations.yaml')),
      signals: loadProviderSignals(join(root, 'enforcement/excluded-provider-signals.yaml')),
      generated_at: new Date().toISOString(),
    }),
    { headers: { 'content-type': 'application/json; charset=utf-8' } },
  );
};
