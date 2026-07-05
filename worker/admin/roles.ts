/**
 * Per-request admin role resolution — THE single authority every authenticated
 * admin route authorizes through (worker/admin/router.ts calls nothing else).
 *
 * Two tiers, resolved in a fixed order:
 *   1. The committed file (worker/admin/allowlist.ts) — role honored as
 *      recorded ('superadmin' | 'admin'). The file is consulted FIRST and
 *      always wins; runtime state can never change or shadow a file
 *      principal's role.
 *   2. The D1 runtime roster (admin_roster, migrations/0002_admin_roster.sql)
 *      — role 'admin' only. The roster can NEVER yield 'superadmin': there is
 *      no runtime path into the superadmin tier, by construction.
 *
 * Availability asymmetry (deliberate): on this AUTH path a missing or
 * unreachable DB binding treats the roster as EMPTY — file principals keep
 * working (a D1 outage can't lock the operator out), roster admins are denied.
 * Fails closed, never degraded-open. The MANAGEMENT routes do the opposite and
 * surface DB unavailability as an explicit 5xx (worker/admin/roster.ts).
 *
 * The role is DERIVED here on every request and never stored: a session record
 * carries only the proven subject + method, so removal — a file commit+deploy
 * or a roster remove — is effective on the principal's next request.
 */
import type { AdminEnv } from './types.ts';
import {
  ADMIN_ALLOWLIST, adminRoleFor, normalizeSubject, isValidSubject,
  type AdminAllowlist, type AdminRole,
} from './allowlist.ts';

/** Compile-time-only test seam (same contract as routeAdmin's deps parameter):
 *  tests must exercise non-empty file tiers without committing real identities.
 *  Runtime callers never pass it; no environment value reaches it. */
export interface AdminDeps {
  allowlist: AdminAllowlist;
}

export const DEFAULT_ADMIN_DEPS: AdminDeps = { allowlist: ADMIN_ALLOWLIST };

/**
 * The role a proven principal holds RIGHT NOW, or null for a non-member.
 * `subject` is normalized (shared normalizer) and validated before either tier
 * is consulted, so a malformed subject can never match anything — the same
 * malformed-entry immunity the file matchers enforce.
 */
export async function resolveAdminRole(
  provider: 'nostr' | 'bluesky',
  subject: string,
  env: AdminEnv,
  deps: AdminDeps,
): Promise<AdminRole | null> {
  const normalized = normalizeSubject(provider, subject);
  if (!isValidSubject(provider, normalized)) return null;

  // Tier 1 — the committed file, role honored as recorded. Always wins.
  const fileRole = adminRoleFor(deps.allowlist, provider, normalized);
  if (fileRole) return fileRole;

  // Tier 2 — the runtime roster: 'admin' only, and silently EMPTY when the DB
  // binding is absent or the query fails (roster principals fail closed while
  // file principals stay unaffected — see the module header).
  if (!env.DB) return null;
  try {
    const row = await env.DB
      .prepare('SELECT subject FROM admin_roster WHERE provider = ? AND subject = ?')
      .bind(provider, normalized)
      .first<{ subject: string }>();
    return row ? 'admin' : null;
  } catch {
    return null;
  }
}
