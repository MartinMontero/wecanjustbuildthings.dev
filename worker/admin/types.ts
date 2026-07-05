/**
 * The admin runtime's binding surface — a structural subset of the Worker `Env`
 * (worker/index.ts), so the dispatch passes its env straight through. Kept minimal
 * per the admin panel's phased-bindings rule: each feature phase declares only the
 * bindings it actually uses, so a downstream deployer never has to provision idle
 * resources.
 *
 * Optional-typed to match the graceful-degradation convention of the main Env —
 * but for admin, absence means FAIL CLOSED (503 on the auth routes), never a
 * degraded-but-open surface.
 */
import type { KVNamespace, D1Database, DurableObjectNamespace, RateLimit } from '../auth/cf.ts';

export interface AdminEnv {
  /** Per-identity coordination DO: CSRF nonces + post-auth login velocity. */
  ADMIN_COORD?: DurableObjectNamespace;
  /** Admin sessions (adm:*) + admin login challenges (chal:*) + NIP-98 replay guards (nip98:*). */
  ADMIN_SESSIONS?: KVNamespace;
  /** USER sessions — read-only here, for the Bluesky reuse-then-elevate flow. */
  SESSIONS?: KVNamespace;
  /** Identity model (elevation reads the proven DID) + the runtime admin roster
   *  and its insert-only audit (migrations/0002_admin_roster.sql). Absent on the
   *  AUTH path ⇒ roster treated as empty (file principals unaffected); absent on
   *  the MANAGEMENT routes ⇒ explicit 503. */
  DB?: D1Database;
  /** Canonical origin: pins the NIP-98 `u` tag + origin checks to config, not Host. */
  SITE_URL?: string;
  /** Shared native rate limiter; admin uses its own buckets (admin-login / admin-elevate). */
  AUTH_RATE_LIMITER?: RateLimit;
}
