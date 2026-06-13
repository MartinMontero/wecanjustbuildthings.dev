# Implementation plan: <NAME>

> Derived from the approved spec. The constitution is binding.

## Architecture

<!-- Components and how they fit. Keep the trust path (keys, signing, AUTH) explicit. -->

## Dependencies (catalog-sourced)

| Package | Ecosystem | Why | Catalog status |
|---|---|---|---|
| nostr-tools | js | Nostr primitives | verified |
| @noble/curves | js | signing | verified |
| @atproto/api | js | AT Protocol client | (check catalog) |

> Every dependency must come from, or be addable to, the catalog and pass the
> enforcement engine. Run `npx tsx ../../../enforcement/cli.ts all --tree .`.

## Data & privacy

<!-- What's stored, where, for how long. Keys stay client-side. -->

## Operational requirements (Article IV)

- Rate limiting strategy:
- Auth test plan:
- Error-surfacing strategy (no silent failures on the trust path):

## Risks & mitigations

<!-- Especially long-tail risks: missing rate limits, untested auth, relay crashes. -->
