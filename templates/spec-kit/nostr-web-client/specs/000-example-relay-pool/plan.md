# Implementation plan: Resilient relay pool with AT Protocol cross-posting

## Architecture

- `keys.ts` — generate/load a secp256k1 keypair; persist the secret in browser
  storage only (`@noble/curves` for signing; `nostr-tools` for nip19 encoding).
- `pool.ts` — wrap `nostr-tools`'s relay pool; publish to N relays; expose a
  per-relay status stream; honor NIP-42 AUTH challenges.
- `crosspost.ts` — optional AT Protocol mirror via `@atproto/api` (`AtpAgent`),
  with explicit session handling and rate-limit backoff.
- `index.ts` — wire it together behind a small typed API.

## Dependencies (catalog-sourced)

| Package | Ecosystem | Why | Catalog status |
|---|---|---|---|
| nostr-tools | js | NIP-01 events, relay pool, nip19 | verified |
| @noble/curves | js | secp256k1 signing | verified |
| @atproto/api | js | AT Protocol client | in catalog |

Run `npx tsx ../../../enforcement/cli.ts all --tree .` after installing.

## Data & privacy

- The secret key never leaves the device; stored in IndexedDB, never sent to a
  server. Notes are public by design; no analytics, no third-party model calls.

## Operational requirements (Article IV)

- **Rate limiting:** per-relay publish throttle + exponential backoff on AT
  Protocol 429s.
- **Auth test plan:** unit tests for NIP-42 challenge → signed AUTH → success and
  → failure (surfaced, not swallowed).
- **Error surfacing:** every relay result is reported; signing errors throw.

## Risks & mitigations

- A relay silently dropping events → per-relay status + a published-to-≥k quorum
  check.
- AT Protocol session expiry mid-publish → detect 401, refresh, retry once.
- Missing rate limiting (the documented Soapbox failure mode) → it's a Day-1 task
  here, not a later patch.
