/**
 * Auth response helper. CRITICAL: unlike the site's `json()` in worker/index.ts,
 * this sets NO `access-control-allow-origin` — auth responses (session state,
 * challenges) must be same-origin only, never readable by a third-party page.
 *
 * `cache-control: no-store` keeps session/challenge data out of any cache;
 * `nosniff` + `no-referrer` are cheap, always-on hardening. A real CSP and the
 * full header set land in Phase 5; these are the auth-response invariants.
 */
const AUTH_HEADERS: Record<string, string> = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

export function authJson(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...AUTH_HEADERS, ...extraHeaders },
  });
}

/** A deliberately vague client error. Auth failures NEVER say which check failed
 *  (unknown pubkey vs bad signature vs expired) — that distinction only helps an
 *  attacker. One shape, one message. */
export function authError(status = 401, message = 'authentication failed'): Response {
  return authJson({ error: message }, status);
}
