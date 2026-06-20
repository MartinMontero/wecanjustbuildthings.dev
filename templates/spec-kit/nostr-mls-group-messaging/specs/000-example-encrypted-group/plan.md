# Implementation plan: A minimal encrypted group

## Architecture

- `keys.ts` — generate/load a secp256k1 Nostr keypair; persist the secret in
  browser storage only (`@noble/curves` for signing, `nostr-tools` for nip19).
  This keypair is the MLS identity (BasicCredential).
- `keypackage.ts` — use `@internet-privacy/marmot-ts` to build an MLS KeyPackage;
  publish it as a `kind:30443` event with a random `d` slot via `nostr-tools`, and
  publish a `kind:10051` KeyPackage relay list.
- `group.ts` — create the MLS group through the library (Marmot Group Data
  Extension `0xF2EE`); build the Welcome for an invitee from their fetched
  `kind:30443`; the library does all MLS/crypto.
- `welcome.ts` — deliver the Welcome NIP-59-gift-wrapped (`kind:1059` → `13` →
  `444`) to the invitee's inbox relays; on the receiving side, unwrap and join,
  then rotate the consumed KeyPackage.
- `messages.ts` — send/receive `kind:445` Group Events; hand each event to the
  library to encrypt/decrypt; on AEAD failure, drop and surface.
- `index.ts` — wire it together behind a small typed API.

> No file in this list implements cryptography. Every MLS, AEAD, key-derivation,
> and gift-wrap operation is a call into `@internet-privacy/marmot-ts` / `ts-mls`.

## Dependencies (catalog-sourced)

| Package | Ecosystem | Why | Catalog status |
|---|---|---|---|
| @internet-privacy/marmot-ts | js | Marmot protocol engine over MLS | verified |
| ts-mls | js | MLS core (RFC 9420) | verified |
| nostr-tools | js | events, relay pool, nip19, NIP-59 helpers | verified |
| @noble/curves | js | secp256k1 signing | verified |

Run `npx tsx ../../../enforcement/cli.ts all --tree .` after installing.

## Crypto boundary (Article III)

- **Group create / KeyPackage / Welcome / encrypt / decrypt:** `@internet-privacy/marmot-ts`
  (on `ts-mls`). Implemented here: **nothing cryptographic.**
- **Marmot kinds**, pinned to `marmot-protocol/marmot` at a named commit:
  `30443` (KeyPackage), `10051`/`10050` (relay lists), `444`+`1059`/`13` (Welcome,
  NIP-59), `445` (Group Event), `0xF2EE` (Group Data Extension). Re-verify before use.

## Data & privacy

- The secret key never leaves the device (browser storage / IndexedDB), never sent
  to a server. Message plaintext exists only on-device; only `kind:445` ciphertext
  touches relays. No analytics, no third-party model calls.

## Operational requirements (Article IV)

- **Relay strategy:** publish/read KeyPackages via `kind:10051`; deliver/receive
  gift-wrapped Welcomes via the recipient's `kind:10050` inbox relays.
- **KeyPackage rotation:** the invitee publishes a fresh `kind:30443` (same `d`)
  immediately after joining.
- **Error surfacing:** an AEAD/authentication failure drops the event and is
  reported; MLS processing errors throw, never swallowed.
- **Group size:** keep the example to 2–3 members; surface the ~150 ceiling in docs.

## Risks & mitigations

- A tempting "just XOR it" shortcut → forbidden by Article III; all crypto stays in
  the library. Reconstructing MLS is a stop-and-ask.
- KeyPackage reuse → rotate after join; never reuse beyond `last_resort`.
- Stale spec numbers → kinds are pinned to a commit and re-verified (the spec
  already moved `443` → `30443`).
- A relay dropping a gift wrap → deliver the Welcome to multiple inbox relays.
