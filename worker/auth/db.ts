/**
 * D1 data layer for the identity model (see migrations/0001_auth.sql). Functions
 * take the `D1Database` binding directly (not the whole Env) so they unit-test
 * against a small in-memory fake.
 */
import type { D1Database } from './cf.ts';

export type Provider = 'nostr' | 'bluesky';

export interface User {
  id: string;
  createdAt: number;
  displayName: string | null;
}

interface UserRow {
  id: string;
  created_at: number;
  display_name: string | null;
}

function toUser(row: UserRow): User {
  return { id: row.id, createdAt: row.created_at, displayName: row.display_name };
}

export async function getUserById(db: D1Database, id: string): Promise<User | null> {
  const row = await db
    .prepare('SELECT id, created_at, display_name FROM users WHERE id = ?')
    .bind(id)
    .first<UserRow>();
  return row ? toUser(row) : null;
}

/**
 * Resolve the user behind a proven identity, creating the user+identity pair on
 * first sign-in. The subject (pubkey/DID) is the thing the caller has
 * cryptographically proven — never trust a `subject` that hasn't passed verification.
 *
 * Concurrency-safe (CWE-362): two simultaneous FIRST sign-ins for the same
 * (provider, subject) used to both miss the read, both mint a user, and the second
 * `INSERT OR REPLACE` would repoint the identity — orphaning the first user. Here the
 * identity is claimed with `INSERT OR IGNORE` against its PK, then we re-read the
 * actual owner: the racer that lost deletes its candidate user and adopts the winner,
 * so the flow converges on exactly one user with no orphan.
 */
export async function getOrCreateUserByIdentity(
  db: D1Database,
  provider: Provider,
  subject: string,
  displayName: string | null,
): Promise<User> {
  // Hot path (returning user): one joined read instead of identity-then-user.
  const joined = await db
    .prepare(
      'SELECT u.id, u.created_at, u.display_name FROM identities i ' +
        'JOIN users u ON u.id = i.user_id WHERE i.provider = ? AND i.subject = ?',
    )
    .bind(provider, subject)
    .first<UserRow>();
  if (joined) return toUser(joined);

  // No live user behind this identity: genuine first sign-in, or a rare dangling
  // identity whose user row vanished. Create a candidate and claim the identity
  // idempotently (OR IGNORE — never clobber a concurrent racer's mapping).
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO users (id, created_at, display_name) VALUES (?, ?, ?)').bind(id, now, displayName),
    db.prepare('INSERT OR IGNORE INTO identities (provider, subject, user_id, created_at) VALUES (?, ?, ?, ?)').bind(provider, subject, id, now),
  ]);

  // Who actually owns the identity now?
  const owner = await db
    .prepare('SELECT user_id FROM identities WHERE provider = ? AND subject = ?')
    .bind(provider, subject)
    .first<{ user_id: string }>();
  const winnerId = owner?.user_id ?? id;
  if (winnerId === id) return { id, createdAt: now, displayName };

  // We lost the race (or the identity pre-existed): drop our orphan candidate and
  // adopt the winner.
  await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  const user = await getUserById(db, winnerId);
  if (user) return user;

  // Dangling identity: it points at a user that no longer exists. Repoint it to a
  // fresh user (the one place OR REPLACE is warranted — a deliberate recreate).
  const repairId = crypto.randomUUID();
  const repairNow = Date.now();
  await db.batch([
    db.prepare('INSERT INTO users (id, created_at, display_name) VALUES (?, ?, ?)').bind(repairId, repairNow, displayName),
    db.prepare('INSERT OR REPLACE INTO identities (provider, subject, user_id, created_at) VALUES (?, ?, ?, ?)').bind(provider, subject, repairId, repairNow),
  ]);
  return { id: repairId, createdAt: repairNow, displayName };
}
