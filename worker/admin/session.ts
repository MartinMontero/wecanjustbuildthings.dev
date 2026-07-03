/**
 * Admin sessions — separate from user sessions in every dimension: their own KV
 * namespace (ADMIN_SESSIONS), their own __Host- cookie with SameSite=Strict, and a
 * much shorter dual-bound lifetime. A session is an opaque 256-bit CSPRNG id; the
 * record is BOUND to the cryptographically proven identity (pubkey/DID) so every
 * later admin action is attributable to a key, not just to "someone with a cookie".
 *
 * TTL model (both bounds enforced IN CODE; KV eviction is only the backstop):
 *   - IDLE 15 min: a walked-away admin tab dies quickly (standard high-privilege
 *     idle cutoff). Activity refreshes `lastSeen`.
 *   - ABSOLUTE 8 h: a hard cap from login regardless of activity, so a stolen
 *     cookie is bounded to one working day; re-auth is a fresh signature.
 *
 * Two traps deliberately closed here:
 *   - NO-SLIDE: every `lastSeen` refresh rewrites the KV record with the ABSOLUTE
 *     `expiration` (epoch of createdAt + 8 h) — never a fresh relative
 *     expirationTtl, which would slide the hard bound forward on every request.
 *     Inside the final 60 s (KV's minimum expiration window) the rewrite is skipped
 *     entirely; the in-code absolute check governs the tail.
 *   - COALESCED WRITES: `lastSeen` is refreshed only when ≥60 s stale (KV allows
 *     ~1 write/sec/key). Worst-case observed idle window is therefore 15–16 min —
 *     accepted in the design ruling.
 */
import type { KVNamespace } from '../auth/cf.ts';

export const ADMIN_SESSION_COOKIE = '__Host-wcjbt_admin';
export const ADMIN_IDLE_SECONDS = 15 * 60;
export const ADMIN_ABSOLUTE_SECONDS = 8 * 60 * 60;
export const REFRESH_COALESCE_SECONDS = 60;
/** KV rejects expirations less than 60 s in the future; skip the rewrite there. */
const KV_MIN_EXPIRATION_WINDOW_SECONDS = 60;

export type AdminMethod = 'nostr' | 'bluesky';

export interface AdminSessionRecord {
  /** The proven identity: 64-hex Nostr pubkey or AT-Proto DID. */
  subject: string;
  method: AdminMethod;
  createdAt: number; // ms epoch
  lastSeen: number;  // ms epoch
}

const key = (id: string) => `adm:${id}`;
const absoluteExpirySeconds = (createdAtMs: number) =>
  Math.floor(createdAtMs / 1000) + ADMIN_ABSOLUTE_SECONDS;

/** Opaque 256-bit CSPRNG id — a bearer secret, never Math.random. */
export function newAdminSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** SameSite=Strict: the admin cookie never rides ANY cross-site navigation. The
 *  __Host- prefix makes the browser enforce Secure + Path=/ + no Domain. Max-Age
 *  mirrors the absolute bound; the server-side checks remain authoritative. */
export function adminSessionCookie(id: string, maxAge: number = ADMIN_ABSOLUTE_SECONDS): string {
  return `${ADMIN_SESSION_COOKIE}=${id}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

export function clearAdminSessionCookie(): string {
  return `${ADMIN_SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

/** Persist a fresh session for a PROVEN identity under a caller-minted id (the id
 *  is minted before persisting so the per-identity coordinator can gate on it). */
export async function putAdminSession(
  kv: KVNamespace,
  id: string,
  subject: string,
  method: AdminMethod,
  now: number = Date.now(),
): Promise<void> {
  const record: AdminSessionRecord = { subject, method, createdAt: now, lastSeen: now };
  await kv.put(key(id), JSON.stringify(record), { expiration: absoluteExpirySeconds(now) });
}

export async function destroyAdminSession(kv: KVNamespace, id: string): Promise<void> {
  await kv.delete(key(id));
}

/**
 * Resolve + validate a session id against both bounds, refreshing `lastSeen` per
 * the coalescing rules above. Returns null for any break (unknown id, malformed
 * record, idle-expired, absolute-expired); expired records are proactively deleted
 * rather than left for KV eviction. `now` is injectable for the expiry tests.
 */
export async function resolveAdminSessionId(
  kv: KVNamespace,
  id: string | undefined,
  now: number = Date.now(),
): Promise<{ id: string; record: AdminSessionRecord } | null> {
  if (!id) return null;
  let raw: string | null;
  try {
    raw = await kv.get(key(id));
  } catch {
    return null; // transient KV error → unauthenticated, never a bubbled-up 500
  }
  if (!raw) return null;
  let record: AdminSessionRecord;
  try {
    record = JSON.parse(raw) as AdminSessionRecord;
  } catch {
    return null;
  }
  if (!record?.subject || (record.method !== 'nostr' && record.method !== 'bluesky')) return null;
  if (typeof record.createdAt !== 'number' || typeof record.lastSeen !== 'number') return null;

  // Absolute bound first: no amount of activity extends a session past 8 h.
  if (now - record.createdAt >= ADMIN_ABSOLUTE_SECONDS * 1000) {
    await destroyAdminSession(kv, id);
    return null;
  }
  if (now - record.lastSeen >= ADMIN_IDLE_SECONDS * 1000) {
    await destroyAdminSession(kv, id);
    return null;
  }

  // Coalesced, no-slide refresh (see module comment).
  const expiry = absoluteExpirySeconds(record.createdAt);
  const secondsToAbsolute = expiry - Math.floor(now / 1000);
  if (now - record.lastSeen >= REFRESH_COALESCE_SECONDS * 1000 && secondsToAbsolute > KV_MIN_EXPIRATION_WINDOW_SECONDS) {
    const refreshed: AdminSessionRecord = { ...record, lastSeen: now };
    await kv.put(key(id), JSON.stringify(refreshed), { expiration: expiry });
    return { id, record: refreshed };
  }
  return { id, record };
}
