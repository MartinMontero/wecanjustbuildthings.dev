/**
 * ADMIN_COORD — the admin coordination Durable Object (SQLite-backed; declared via
 * `new_sqlite_classes` in wrangler.jsonc). It holds the small, strongly-consistent
 * state hardened admin auth needs — a CSRF nonce and a login/action rate-limit
 * counter — scoped PER ADMIN IDENTITY.
 *
 * Hard sequencing rule (design decision 4): a coordinator instance is only ever
 * obtained AFTER an admin identity is verified, keyed on the authenticated
 * pubkey/DID — never from an unauthenticated, attacker-chosen name (unbounded DO
 * creation is a cost/abuse vector). Pre-auth throttling of the login/elevation
 * routes uses the existing AUTH_RATE_LIMITER binding keyed on IP.
 *
 * Storage stays deliberately trivial (KV-style get/put on the DO storage) so the
 * hand-fake test double is a faithful map — no new test runner. Classic DO shape
 * (`(state, env)` + `fetch`) so we stay in the repo's hand-typed-bindings lane and
 * pull in no @cloudflare/workers-types.
 *
 * Phase 1 (this commit) is the runtime scaffold: the class + binding + migration
 * exist so the platform is ready and the DO is bound. The CSRF-nonce and
 * rate-limit methods land in Phase 2 with admin auth, which is the first code that
 * instantiates it. Until then it fails closed.
 */
import type { DurableObjectState } from '../auth/cf.ts';
import type { AdminEnv } from './types.ts';

export class AdminCoordinator {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: AdminEnv,
  ) {}

  /**
   * Coordinator RPC is delivered over fetch() (classic DO shape). No methods are
   * wired in Phase 1, so any call fails closed with 501 — nothing ships as a live,
   * unauthenticated coordinator endpoint before the Phase 2 auth that gates it.
   */
  async fetch(_request: Request): Promise<Response> {
    // `state`/`env` are retained for the Phase 2 methods (storage-backed nonce +
    // counter); referenced here so the scaffold is self-evidently wired.
    void this.state;
    void this.env;
    return new Response(JSON.stringify({ error: 'not implemented' }), {
      status: 501,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
}
