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
 * first sign-in. The two inserts run in a single `batch()` so a half-written
 * identity (user with no identity, or vice-versa) can never exist. The subject
 * (pubkey/DID) is the thing the caller has cryptographically proven — never trust
 * a `subject` that hasn't passed verification.
 */
export async function getOrCreateUserByIdentity(
  db: D1Database,
  provider: Provider,
  subject: string,
  displayName: string | null,
): Promise<User> {
  const existing = await db
    .prepare('SELECT user_id FROM identities WHERE provider = ? AND subject = ?')
    .bind(provider, subject)
    .first<{ user_id: string }>();

  if (existing) {
    const user = await getUserById(db, existing.user_id);
    if (user) return user;
    // identity row points at a vanished user — fall through and recreate cleanly.
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  await db.batch([
    db.prepare('INSERT INTO users (id, created_at, display_name) VALUES (?, ?, ?)').bind(id, now, displayName),
    db
      .prepare('INSERT OR REPLACE INTO identities (provider, subject, user_id, created_at) VALUES (?, ?, ?, ?)')
      .bind(provider, subject, id, now),
  ]);
  return { id, createdAt: now, displayName };
}
