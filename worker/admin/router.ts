/**
 * /api/admin/* sub-router — mirrors the worker/auth/* pattern and is dispatched
 * from worker/index.ts (before the static-asset fallthrough). Pure + exported so
 * the dispatch contract is unit-testable with the existing fake-binding pattern.
 *
 * Phase 1 (this commit) is the runtime scaffold: there are no admin routes yet, so
 * every `/api/admin/*` path FAILS CLOSED with 404. Phase 2 adds the authenticated
 * endpoints here — GET /api/admin/whoami plus the login/elevation routes — each
 * gated by the server-side allowlist. Deny-by-default is the correct scaffold
 * behavior: no admin surface is reachable until auth is deliberately wired.
 */
import type { AdminEnv } from './types.ts';

/** A JSON response with the auth-response invariant (no CORS, no-store). */
function adminJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function routeAdmin(request: Request, env: AdminEnv): Promise<Response> {
  // Phase 2 will branch on the path here (whoami / login / elevate) behind the
  // allowlist check. Until then: deny everything. `request`/`env` are threaded so
  // the signature is the one Phase 2 builds on.
  void request;
  void env;
  return adminJson({ error: 'not found' }, 404);
}
