/**
 * D1 data layer for the runtime admin roster + its insert-only audit log
 * (migrations/0002_admin_roster.sql). Used ONLY by the superadmin management
 * routes in worker/admin/router.ts; per-request AUTH reads go through
 * worker/admin/roles.ts instead, which treats a failing DB as an empty roster.
 * HERE every DB failure THROWS — the management routes surface it as an
 * explicit 5xx and must never render a file-only view as if it were complete
 * (the deliberate availability asymmetry of the two-tier design).
 *
 * INSERT-ONLY AUDIT CONTRACT: admin_audit is written with INSERT and nothing
 * else — no code path in this repository issues UPDATE or DELETE against it
 * (pinned statically by worker/tests/admin-roster.test.ts). Mutations write
 * the roster row and its audit row in one db.batch() so neither can land
 * without the other.
 */
import type { D1Database } from '../auth/cf.ts';

export type AdminProvider = 'nostr' | 'bluesky';
/** How the acting superadmin authenticated the mutation (audit column). */
export type AuditMethod = 'cookie' | 'nip98';

export interface RosterEntry {
  provider: AdminProvider;
  subject: string;
  added_by: string; // acting superadmin, 'provider:subject'
  added_at: number; // epoch ms
  note: string | null;
}

export async function listRosterEntries(db: D1Database): Promise<RosterEntry[]> {
  const { results } = await db
    .prepare('SELECT provider, subject, added_by, added_at, note FROM admin_roster ORDER BY added_at, provider, subject')
    .all<RosterEntry>();
  return results;
}

export async function rosterHas(db: D1Database, provider: AdminProvider, subject: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT subject FROM admin_roster WHERE provider = ? AND subject = ?')
    .bind(provider, subject)
    .first<{ subject: string }>();
  return row !== null;
}

/** Insert a roster row + its 'admin.add' audit row atomically. The caller has
 *  already normalized/validated the subject (shared validator), verified the
 *  actor is a file superadmin, and rejected file-resident/duplicate targets. */
export async function addRosterEntry(
  db: D1Database,
  entry: { provider: AdminProvider; subject: string; actor: string; method: AuditMethod; note: string | null; now: number },
): Promise<void> {
  await db.batch([
    db.prepare('INSERT INTO admin_roster (provider, subject, added_by, added_at, note) VALUES (?, ?, ?, ?, ?)')
      .bind(entry.provider, entry.subject, entry.actor, entry.now, entry.note),
    db.prepare('INSERT INTO admin_audit (id, at, actor, action, provider, subject, method, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), entry.now, entry.actor, 'admin.add', entry.provider, entry.subject, entry.method, entry.note),
  ]);
}

/** Delete a roster row + write its 'admin.remove' audit row atomically. Only
 *  the roster row is ever deleted — the audit trail is append-only history. */
export async function removeRosterEntry(
  db: D1Database,
  entry: { provider: AdminProvider; subject: string; actor: string; method: AuditMethod; now: number },
): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM admin_roster WHERE provider = ? AND subject = ?')
      .bind(entry.provider, entry.subject),
    db.prepare('INSERT INTO admin_audit (id, at, actor, action, provider, subject, method, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), entry.now, entry.actor, 'admin.remove', entry.provider, entry.subject, entry.method, null),
  ]);
}
