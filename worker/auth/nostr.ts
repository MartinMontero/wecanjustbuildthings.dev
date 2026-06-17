/**
 * Nostr sign-in verification (NIP-98 HTTP Auth, kind 27235). The Worker NEVER
 * touches a key or a relay — that's the client's job (NIP-46 remote signer or
 * NIP-07 extension, Phase 4). Here we only (a) issue a single-use challenge and
 * (b) verify the signed event the client returns.
 *
 * We lean on nostr-tools ONLY for the audited crypto (verifyEvent → @noble
 * schnorr) and token parsing; every policy check is implemented explicitly here
 * so we control it — notably a SYMMETRIC ±60s timestamp window, because the lib's
 * own validateEventTimestamp accepts arbitrarily future-dated events.
 */
import { verifyEvent, type Event } from 'nostr-tools/pure';
import { unpackEventFromToken } from 'nostr-tools/nip98';
import type { KVNamespace } from './cf.ts';

const NIP98_KIND = 27235;
const CHALLENGE_TTL_SECONDS = 300; // 5 min to complete the remote-signer round-trip
const TIMESTAMP_SKEW_SECONDS = 60;

export interface ChallengeStore {
  SESSIONS: KVNamespace;
}

/** Cryptographically-random 256-bit challenge (CSPRNG). */
export function newChallenge(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function issueChallenge(store: ChallengeStore): Promise<string> {
  const challenge = newChallenge();
  await store.SESSIONS.put(`chal:${challenge}`, '1', { expirationTtl: CHALLENGE_TTL_SECONDS });
  return challenge;
}

/**
 * Single-use: true only the first time a live challenge is presented, then it's
 * burned. NOTE: KV has no atomic get-and-delete, so a tight concurrent double-use
 * race exists — bounded to the TLS-protected ±60s window and closed further by
 * Phase-5 rate-limiting; the signature already binds the event to this challenge.
 */
export async function consumeChallenge(store: ChallengeStore, challenge: string): Promise<boolean> {
  if (!challenge) return false;
  const key = `chal:${challenge}`;
  const exists = await store.SESSIONS.get(key);
  if (exists === null) return false;
  await store.SESSIONS.delete(key);
  return true;
}

function tagValue(event: Event, name: string): string | undefined {
  const tag = event.tags.find((t) => t[0] === name);
  return tag?.[1];
}

/** sha256 hex of the EXACT request-body bytes (NIP-98 `payload`). Hashing the raw
 *  string — not a re-serialised object — keeps client and server byte-identical. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A display name is user-facing only, never an identifier. Drop C0 control chars
 *  + DEL, trim, and cap length so it can't be abused as a smuggling channel. */
export function sanitizeDisplayName(input?: string | null): string | null {
  if (typeof input !== 'string') return null;
  let cleaned = '';
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x20 && code !== 0x7f) cleaned += ch;
  }
  cleaned = cleaned.trim().slice(0, 64);
  return cleaned.length ? cleaned : null;
}

/**
 * The seven checks. Returns the proven pubkey, or null for ANY failure — the
 * caller maps null to one generic 401 that never reveals which check failed.
 * `nowSeconds` is injectable so tests can exercise the timestamp window.
 */
export async function verifyNostrAuth(
  store: ChallengeStore,
  authHeader: string | null,
  rawBody: string,
  expectedUrl: string,
  challenge: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<{ pubkey: string } | null> {
  if (!authHeader) return null;

  let event: Event;
  try {
    event = (await unpackEventFromToken(authHeader)) as Event;
  } catch {
    return null; // malformed / non-base64 / not an event
  }

  // 1. kind is NIP-98 HTTP Auth
  if (event.kind !== NIP98_KIND) return null;
  // 2. `u` tag is exactly our verify endpoint (binds the event to this server)
  if (tagValue(event, 'u') !== expectedUrl) return null;
  // 3. `method` tag is POST
  if ((tagValue(event, 'method') ?? '').toUpperCase() !== 'POST') return null;
  // 4. created_at within a symmetric ±60s window (rejects stale AND future-dated)
  if (typeof event.created_at !== 'number' || Math.abs(nowSeconds - event.created_at) > TIMESTAMP_SKEW_SECONDS) return null;
  // 5. `payload` tag is sha256 of the exact body (binds the event to this body,
  //    which carries the challenge)
  if (tagValue(event, 'payload') !== (await sha256Hex(rawBody))) return null;
  // 6. schnorr signature is valid (audited crypto). JSON-parsed events carry no
  //    cached verification symbol, so this really verifies.
  if (!verifyEvent(event)) return null;
  // 7. challenge is live + single-use — consumed LAST, only after the event is
  //    proven, so a bad attempt can't burn a good challenge.
  if (!(await consumeChallenge(store, challenge))) return null;

  return { pubkey: event.pubkey };
}
