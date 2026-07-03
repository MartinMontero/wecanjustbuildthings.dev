/**
 * AdminCoordinator — the admin coordination Durable Object behind ADMIN_COORD
 * (SQLite-backed; declared via `new_sqlite_classes` in wrangler.jsonc; the class is
 * exported from worker/index.ts). It holds the small, strongly-consistent state
 * hardened admin auth needs — CSRF nonces and a login-velocity counter — scoped
 * PER ADMIN IDENTITY.
 *
 * Hard sequencing rule (design decision 4): a coordinator instance is only ever
 * obtained AFTER an admin identity is cryptographically verified AND allowlisted,
 * keyed on the proven identity (idFromName(`${method}:${subject}`)) — never from an
 * unauthenticated, attacker-chosen name (unbounded DO creation is a cost/abuse
 * vector). Pre-auth throttling of the login/elevation routes is the native
 * AUTH_RATE_LIMITER's job (admin-login / admin-elevate buckets keyed on IP).
 *
 * Duties in this slice (the spec's "CSRF nonce + rate-limit counter"):
 *   POST /open  {sessionId}         → post-auth login-velocity gate for this
 *                                     identity, then mint + store the session's
 *                                     CSRF token → {ok, csrf}
 *   POST /csrf  {sessionId}         → re-read the token (browser page reload)
 *   POST /check {sessionId, token}  → constant-time validate → {ok}
 *   POST /close {sessionId}         → drop the token (logout)
 * Anything else fails closed with 404. Strong consistency here (vs KV's eventual)
 * is why CSRF state lives in the DO and not inside the session record.
 *
 * Storage stays deliberately trivial (KV-style get/put on the DO storage) so the
 * hand-fake test double is a faithful map — no new test runner. Classic DO shape
 * (`(state, env)` + `fetch`) so we stay in the repo's hand-typed-bindings lane and
 * pull in no @cloudflare/workers-types.
 */
import type { DurableObjectState } from '../auth/cf.ts';
import type { AdminEnv } from './types.ts';

/** Post-verification velocity cap: interactive admin logins are rare, so a dozen an
 *  hour absorbs flaky signer retries while a farmed (stolen-key) login loop stalls. */
const MAX_LOGINS_PER_HOUR = 12;
const LOGIN_WINDOW_MS = 60 * 60 * 1000;

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

function newCsrfToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Length-then-XOR comparison — no early exit on the first differing byte. */
function tokensEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export class AdminCoordinator {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: AdminEnv,
  ) {}

  async fetch(request: Request): Promise<Response> {
    void this.env; // no bindings needed in this slice — the DO's own storage suffices
    if (request.method !== 'POST') return json({ error: 'not found' }, 404);
    let body: { sessionId?: string; token?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return json({ error: 'invalid body' }, 400);
    }
    const sessionId = body.sessionId;
    if (typeof sessionId !== 'string' || !/^[0-9a-f]{64}$/.test(sessionId)) {
      return json({ error: 'invalid body' }, 400);
    }
    const path = new URL(request.url).pathname;

    if (path === '/open') {
      const now = Date.now();
      const past = (await this.state.storage.get<number[]>('logins')) ?? [];
      const recent = past.filter((t) => now - t < LOGIN_WINDOW_MS);
      if (recent.length >= MAX_LOGINS_PER_HOUR) return json({ ok: false }, 429);
      recent.push(now);
      await this.state.storage.put('logins', recent);
      const csrf = newCsrfToken();
      await this.state.storage.put(`csrf:${sessionId}`, csrf);
      return json({ ok: true, csrf });
    }
    if (path === '/csrf') {
      const csrf = await this.state.storage.get<string>(`csrf:${sessionId}`);
      return csrf ? json({ csrf }) : json({ error: 'not found' }, 404);
    }
    if (path === '/check') {
      const stored = await this.state.storage.get<string>(`csrf:${sessionId}`);
      return json({ ok: Boolean(stored) && tokensEqual(stored ?? '', body.token ?? '') });
    }
    if (path === '/close') {
      await this.state.storage.delete(`csrf:${sessionId}`);
      return json({ ok: true });
    }
    return json({ error: 'not found' }, 404);
  }
}
