# Implementation plan: <NAME>

> Derived from the approved spec. The constitution is binding.

## Architecture

<!-- Components and how they fit. Keep the trust path (keys, MLS state, signing,
     AEAD) explicit, and keep ALL cryptography inside the library boundary. -->

## Dependencies (catalog-sourced)

| Package | Ecosystem | Why | Catalog status |
|---|---|---|---|
| @internet-privacy/marmot-ts | js | Marmot protocol over MLS (the engine) | verified |
| ts-mls | js | MLS core (RFC 9420) | verified |
| nostr-tools | js | Nostr events, relays, nip19 | verified |
| @noble/curves | js | audited signing | verified |
| blossom-client-sdk | js | encrypted media on Blossom (optional, MIP-04) | verified |

> Every dependency must come from, or be addable to, the catalog and pass the
> enforcement engine. Run `npx tsx ../../../enforcement/cli.ts all --tree .`.

## Crypto boundary (Article III — restate explicitly)

- Which library performs each operation (group create, KeyPackage, Welcome,
  encrypt/decrypt) — and confirmation that **no cryptography is implemented here**.
- The Marmot event kinds used, each pinned to a named `marmot-protocol/marmot`
  commit.

## Data & privacy

<!-- What's stored, where, for how long. Keys stay client-side; messages never
     leave the device unencrypted. -->

## Operational requirements (Article IV)

- Rate limiting / relay strategy (`kind:10051` discovery vs `kind:10050` inbox):
- KeyPackage rotation plan:
- Error-surfacing strategy (no silent failures; AEAD failure ⇒ drop, never expose):
- Group-size handling (~150-member Welcome ceiling):

## Risks & mitigations

<!-- Especially long-tail risks: a tempting hand-rolled shortcut, KeyPackage reuse,
     swallowed MLS errors, stale spec numbers. -->
