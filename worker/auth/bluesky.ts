/**
 * Sign in with Bluesky (AT Protocol OAuth). Runs on Cloudflare Workers using the
 * ISOMORPHIC @atproto/oauth-client (NOT the -node build, which hard-imports
 * node:crypto and a node:dns handle resolver). We supply:
 *   - a WebCrypto-backed RuntimeImplementation (no Node built-ins),
 *   - an HTTPS XrpcHandleResolver (handle→DID over HTTPS, no DNS),
 *   - KV-backed state/session stores that rehydrate the DPoP key (a live Key
 *     object, not JSON-serialisable) to/from a JWK on each write/read.
 *
 * Privacy/least-privilege: we request only the base `atproto` scope (identity,
 * nothing more), and as soon as we've extracted the user's DID we REVOKE the
 * AT Proto tokens — sign-in needs identity, not standing access to their account.
 */
import { OAuthClient } from '@atproto/oauth-client';
import type { RuntimeImplementation, OAuthClientMetadataInput, StateStore, SessionStore } from '@atproto/oauth-client';
import { JoseKey } from '@atproto/jwk-jose';
import type { Key } from '@atproto/jwk';
import type { KVNamespace } from './cf.ts';
import { sanitizeDisplayName } from './nostr.ts';

export interface BlueskyEnv {
  ATPROTO: KVNamespace;
  SITE_URL: string;
  BLUESKY_PRIVATE_KEY_JWK: string; // secret: ES256 private key as a JWK JSON string
}

/** Least privilege: identity only. No `transition:generic:*` — we don't act for the user. */
const SCOPE = 'atproto';
/** HTTPS handle→DID resolution (no node:dns). Bluesky entryway implements resolveHandle. */
const HANDLE_RESOLVER = 'https://bsky.social';
const STATE_TTL_SECONDS = 600;          // 10 min to complete the redirect dance
const SESSION_TTL_SECONDS = 60 * 60 * 24; // backstop only — we revoke right after callback

// Value types of the two stores (their `Session`/`InternalStateData` shapes), derived
// without importing private names. Both carry a live `dpopKey: Key`.
type StateValue = NonNullable<Awaited<ReturnType<StateStore['get']>>>;
type SessionValue = NonNullable<Awaited<ReturnType<SessionStore['get']>>>;

/** Crypto runtime over the Worker's native WebCrypto — the whole reason this works
 *  on Workers without Node built-ins. */
const runtime: RuntimeImplementation = {
  createKey: (algs) => JoseKey.generate(algs),
  getRandomValues: (length) => crypto.getRandomValues(new Uint8Array(length)),
  digest: async (data, alg) => {
    const name = alg.name === 'sha256' ? 'SHA-256' : alg.name === 'sha384' ? 'SHA-384' : 'SHA-512';
    return new Uint8Array(await crypto.subtle.digest(name, data));
  },
  // Intentional no-op: Workers lack a cross-request lock primitive. Acceptable for our
  // low-concurrency sign-in flow; a Durable Object lock is the v2 upgrade if we ever
  // do concurrent token refreshes. (Silences the "no requestLock" warning honestly.)
  requestLock: (_name, fn) => fn(),
};

/**
 * Cloudflare's edge runtime (workerd) rejects `redirect: 'error'` on fetch with a
 * TypeError ("won't be implemented … at the edge; use manual and check the response
 * status code"). @atproto/oauth-client's identity/handle/DID resolvers all build
 * their requests with `redirect: 'error'` (did:web, did:plc, the XRPC and
 * well-known handle resolvers), so sign-in dies at identity resolution on Workers —
 * before it ever reaches the PDS. Per workerd's own guidance we translate
 * 'error' → 'manual'; every one of those resolvers already rejects a non-200
 * response, and a manual-mode redirect surfaces as a non-200 opaqueredirect, so the
 * "fail on an unexpected redirect" security intent is preserved. Injected as the
 * client's Fetch, which OAuthClient threads to every resolver it builds.
 * See github.com/bluesky-social/atproto issue #3292.
 */
export const edgeFetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  // The resolvers call fetch as `fetch(url, { redirect: 'error', … })`, and workerd
  // rejects `redirect: 'error'` at Request construction — so the rewrite has to
  // happen on the init BEFORE any Request is built (constructing one here would
  // throw the very TypeError we're avoiding).
  if (init?.redirect === 'error') {
    return globalThis.fetch(input, { ...init, redirect: 'manual' });
  }
  return globalThis.fetch(input, init);
};

/**
 * KV store whose value embeds a live `dpopKey: Key`. We persist the key as its
 * private JWK and rebuild a JoseKey on read, so the rest of the value stays plain JSON.
 */
function dpopKvStore<V extends { dpopKey: Key }>(kv: KVNamespace, prefix: string, ttl: number) {
  return {
    async get(key: string): Promise<V | undefined> {
      const raw = await kv.get(prefix + key);
      if (!raw) return undefined;
      const parsed = JSON.parse(raw) as Record<string, unknown> & { dpopKey: Record<string, unknown> };
      const dpopKey = await JoseKey.fromJWK(parsed.dpopKey);
      return { ...parsed, dpopKey } as unknown as V;
    },
    async set(key: string, value: V): Promise<void> {
      const jwk = value.dpopKey.privateJwk;
      if (!jwk) throw new Error('cannot persist a DPoP key without a private JWK');
      await kv.put(prefix + key, JSON.stringify({ ...value, dpopKey: jwk }), { expirationTtl: ttl });
    },
    async del(key: string): Promise<void> {
      await kv.delete(prefix + key);
    },
  };
}

async function loadKey(env: BlueskyEnv): Promise<JoseKey> {
  return JoseKey.fromJWK(env.BLUESKY_PRIVATE_KEY_JWK);
}

/** The public OAuth client metadata, served at the client_id URL. The authorization
 *  server fetches this; it must publish our public key so it can verify our
 *  private_key_jwt client assertions. */
export async function blueskyClientMetadata(env: BlueskyEnv): Promise<OAuthClientMetadataInput> {
  const key = await loadKey(env);
  const publicJwk = key.publicJwk;
  if (!publicJwk) throw new Error('signing key exposes no public JWK');
  const base = env.SITE_URL;
  return {
    client_id: `${base}/api/auth/bluesky/client-metadata.json`,
    client_name: 'We Can Just Build Things',
    client_uri: base,
    redirect_uris: [`${base}/api/auth/bluesky/callback`],
    scope: SCOPE,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    application_type: 'web',
    token_endpoint_auth_method: 'private_key_jwt',
    token_endpoint_auth_signing_alg: 'ES256',
    dpop_bound_access_tokens: true,
    jwks: { keys: [publicJwk] },
  };
}

async function makeClient(env: BlueskyEnv): Promise<OAuthClient> {
  const key = await loadKey(env);
  return new OAuthClient({
    clientMetadata: await blueskyClientMetadata(env),
    keyset: [key],
    responseMode: 'query',
    handleResolver: HANDLE_RESOLVER,
    runtimeImplementation: runtime,
    fetch: edgeFetch, // workerd rejects the resolvers' redirect:'error' — see edgeFetch
    stateStore: dpopKvStore<StateValue>(env.ATPROTO, 'bsky_state:', STATE_TTL_SECONDS),
    sessionStore: dpopKvStore<SessionValue>(env.ATPROTO, 'bsky_sess:', SESSION_TTL_SECONDS),
  });
}

/** Cheap pre-filter so we don't hand obvious garbage to the resolver. Accepts a
 *  Bluesky handle (dotted domain) or a did:plc/did:web. Normalises a leading '@'. */
export function normalizeHandle(input: string): string {
  return input.trim().toLowerCase().replace(/^@/, '');
}
export function isValidHandle(input: string): boolean {
  const h = normalizeHandle(input);
  if (h.length < 3 || h.length > 253) return false;
  if (h.startsWith('did:')) return /^did:(plc|web):[a-z0-9._:%-]+$/.test(h);
  return /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(h);
}

/** A browser-bound CSRF token (256-bit CSPRNG) used as the OAuth app-level `state`.
 *  Set as an HttpOnly cookie at sign-in start and re-checked on callback so a login
 *  begun in one browser can't be completed in another (login-CSRF defense). */
export function newOAuthState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Begin sign-in: returns the authorization URL AND the app-level `state` to bind to
 *  the initiating browser (the caller stores it in an HttpOnly cookie). Passing our
 *  own `state` makes it round-trip back on the callback so we can verify the browser. */
export async function blueskyAuthorizeUrl(
  env: BlueskyEnv,
  handle: string,
): Promise<{ url: URL; state: string }> {
  const client = await makeClient(env);
  const state = newOAuthState();
  const url = await client.authorize(normalizeHandle(handle), { scope: SCOPE, state });
  return { url, state };
}

/** Best-effort public handle for a DID (public AppView, no auth, no token). Used only
 *  for a friendly display name; null on any failure. */
async function bestEffortDisplayName(did: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`,
      { headers: { accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as { handle?: string; displayName?: string };
    return sanitizeDisplayName(j.displayName || j.handle || null);
  } catch {
    return null;
  }
}

/**
 * Complete sign-in: validate the redirect, extract the DID, then REVOKE the AT Proto
 * tokens (we only needed identity). Returns the DID + a best-effort display name.
 */
export async function blueskyCallback(
  env: BlueskyEnv,
  params: URLSearchParams,
  expectedState: string | undefined,
): Promise<{ did: string; displayName: string | null }> {
  const client = await makeClient(env);
  const { session, state } = await client.callback(params);
  // Login-CSRF defense (CWE-352): the app-level `state` set at authorize() must match
  // the browser-bound cookie the start handler stored. A forged or cross-browser
  // callback carries no matching cookie, so it's rejected before we mint a session —
  // mirroring the GitHub flow's gh_state check. The library already validated the
  // OAuth `state` against its own store; this binds it to *this* browser.
  if (!expectedState || state !== expectedState) {
    try { await session.signOut(); } catch { /* best effort — our rejection stands */ }
    throw new Error('oauth state does not match the initiating browser');
  }
  const did = String(session.did);
  const displayName = await bestEffortDisplayName(did);
  // Sign-in only: don't hoard access/refresh tokens. Best-effort revoke + cleanup.
  try {
    await session.signOut();
  } catch {
    /* token already gone or network blip — our own session is what matters */
  }
  return { did, displayName };
}
