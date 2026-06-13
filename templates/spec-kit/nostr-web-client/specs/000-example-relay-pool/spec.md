# Feature spec: Resilient relay pool with cross-posting to AT Protocol

## Problem

A community needs to publish public-interest notices (e.g. eviction-defense
alerts) that stay available even when individual relays go down or are blocked,
and to mirror them to Bluesky so reach isn't limited to Nostr users. They cannot
depend on any single server, and they cannot route content through surveillance
infrastructure.

## Users & their goal

A community organizer publishes a signed notice once; it propagates to several
Nostr relays and is optionally mirrored to an AT Protocol account, with clear
feedback about where it landed.

## Scope

- In scope: a relay pool that publishes to N relays with per-relay status; NIP-42
  AUTH handling; optional AT Protocol cross-post; client-side key storage.
- Out of scope: a full UI, media uploads, DMs, payments.

## Requirements

- [ ] Publish a NIP-01 event to a configurable set of relays.
- [ ] Report per-relay accept/reject/timeout status (no silent failures).
- [ ] Handle NIP-42 AUTH challenges; surface failures.
- [ ] Optional: mirror the note to AT Protocol via `@atproto/api`.
- [ ] Keys are generated/stored client-side; never transmitted to a server.

## Constitution checks

- [ ] No dependency owned by Meta / OpenAI / xAI (Article I)
- [ ] All deps OSI-licensed, verified at a commit (Article II)
- [ ] NIP-01 / NIP-42 correctness; audited crypto (Article III)
- [ ] Rate limiting per relay; AUTH paths tested; errors surfaced; data minimized (Article IV)

## Open questions (stop-and-ask)

- Which relays are the community's defaults? (operator decision)
- Is AT Protocol mirroring on by default or opt-in? (privacy/reach trade-off)
