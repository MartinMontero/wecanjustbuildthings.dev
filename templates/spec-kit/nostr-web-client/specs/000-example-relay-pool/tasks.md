# Tasks: Resilient relay pool with AT Protocol cross-posting

## Setup
- [ ] T0 — Scaffold (Node ≥ 22, TypeScript, Vite); add `nostr-tools`,
      `@noble/curves`, `@atproto/api`; wire enforcement into CI.

## Implementation
- [ ] T1 — `keys.ts`: generate/load keypair; persist secret to IndexedDB only.
      Acceptance: secret never appears in any network request (test asserts it).
- [ ] T2 — `pool.ts`: publish a NIP-01 event to N relays; return per-relay status.
      Acceptance: a down relay yields a `timeout`/`error` status, others succeed.
- [ ] T3 — `pool.ts`: NIP-42 AUTH challenge handling.
      Acceptance: AUTH success path and failure path both covered by tests; failure
      is surfaced, not swallowed.
- [ ] T4 — `crosspost.ts`: optional AT Protocol mirror with session refresh and
      429 backoff. Acceptance: a 401 mid-publish triggers one refresh+retry.

## Operational hardening (Article IV)
- [ ] T5 — Per-relay publish throttle + AT Protocol exponential backoff.
- [ ] T6 — Tests for every auth path (NIP-42 + AT Protocol session).
- [ ] T7 — Audit: no swallowed exceptions on the trust path.

## Verification gate
- [ ] `npx tsx ../../../enforcement/cli.ts all --tree .` exits 0
- [ ] All tests green
- [ ] No Meta / OpenAI / xAI dependency (direct or transitive)
