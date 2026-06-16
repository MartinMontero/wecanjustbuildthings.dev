/**
 * App sessions. A session is an OPAQUE 256-bit random id (not a JWT — nothing is
 * encoded in it, so nothing leaks and it can't be forged offline). The id is the
 * only thing in the cookie; the mapping id → userId lives server-side in KV and
 * expires on its own. Resolving a session means cookie → KV → D1 user.
 */
import type { KVNamespace, D1Database } from './cf.ts';
import { getUserById, type User } from './db.ts';

/** `__Host-` prefix: the browser enforces Secure + Path=/ + no Domain, so the
 *  cookie can't be overwritten by a sibling subdomain or downgraded to http. */
export const SESSION_COOKIE = '__Host-wcjbt_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

interface SessionRecord {
  userId: string;
  createdAt: number;
}

export interface AuthEnv {
  SESSIONS: KVNamespace;
  DB: D1Database;
}

/** Cryptographically-random opaque id (CSPRNG, 256-bit → 64 hex). This is a
 *  bearer secret, so it must come from crypto.getRandomValues, never Math.random. */
export function newSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Set-Cookie for a fresh session. SameSite=Lax lets the post-OAuth top-level
 *  redirect carry it back while still blocking cross-site POST/CSRF. */
export function sessionCookie(id: string, maxAge: number = SESSION_TTL_SECONDS): string {
  return `${SESSION_COOKIE}=${id}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

/** Set-Cookie that immediately expires the session cookie (logout). Must match the
 *  attributes of the set cookie (sans value) for the browser to clear it. */
export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

/** Read one cookie value from the request. Local (not imported from index.ts) so
 *  the auth modules never import the Worker entry — that would be a cycle. */
export function readCookie(request: Request, name: string): string | undefined {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/** Mint a session for an authenticated user and return its id (for the cookie). */
export async function createSession(env: AuthEnv, userId: string): Promise<string> {
  const id = newSessionId();
  const record: SessionRecord = { userId, createdAt: Date.now() };
  await env.SESSIONS.put(`sess:${id}`, JSON.stringify(record), { expirationTtl: SESSION_TTL_SECONDS });
  return id;
}

export async function destroySession(env: AuthEnv, id: string): Promise<void> {
  await env.SESSIONS.delete(`sess:${id}`);
}

/** cookie → KV → D1. Returns the live user, or null for any break in the chain
 *  (no cookie, expired/unknown session, or a session pointing at a deleted user). */
export async function resolveSession(
  request: Request,
  env: AuthEnv,
): Promise<{ sessionId: string; user: User } | null> {
  const id = readCookie(request, SESSION_COOKIE);
  if (!id) return null;
  const raw = await env.SESSIONS.get(`sess:${id}`);
  if (!raw) return null;
  let record: SessionRecord;
  try {
    record = JSON.parse(raw) as SessionRecord;
  } catch {
    return null;
  }
  if (!record?.userId) return null;
  const user = await getUserById(env.DB, record.userId);
  if (!user) return null;
  return { sessionId: id, user };
}
