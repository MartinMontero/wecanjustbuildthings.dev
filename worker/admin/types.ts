/**
 * The admin runtime's binding surface — a subset of the Worker `Env`. Kept minimal
 * per the admin panel's phased-bindings rule: each feature phase declares only the
 * bindings it actually uses, so a downstream deployer never has to provision idle
 * resources. This slice (Phase 1 scaffold + Phase 2 auth) needs exactly two:
 *   - ADMIN_COORD    — per-identity coordination Durable Object (CSRF nonce +
 *                      rate-limit counter); SQLite-backed, declared in wrangler.jsonc.
 *   - ADMIN_SESSIONS — KV holding opaque admin session records (separate from the
 *                      user-facing SESSIONS namespace).
 *
 * Optional-typed to match the graceful-degradation convention of the main Env:
 * when a binding is absent (local dev, tests, unprovisioned deploy) the admin
 * surface fails closed rather than throwing.
 */
import type { KVNamespace, DurableObjectNamespace } from '../auth/cf.ts';

export interface AdminEnv {
  ADMIN_COORD?: DurableObjectNamespace;
  ADMIN_SESSIONS?: KVNamespace;
}
