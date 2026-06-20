---
name: marmot-push-notifications
description: >-
  Use when wiring privacy-preserving push notifications for a Marmot (MLS-over-Nostr)
  group through Apple/Google push services — MIP-05: the token lifecycle (kind:447
  request / 448 list / 449 removal) and the gift-wrapped notification request
  (kind:446) to a notification server discovered via kind:10050. Delegates all
  cryptography to MDK / marmot-ts. NOTE: MIP-05 is a DRAFT (optional). Triggers:
  "Marmot push notifications", "APNs/FCM for encrypted Nostr groups", "MIP-05",
  "notification tokens kind 447/448/449".
---

# marmot-push-notifications

Deliver "you have a new message" to phones via APNs/FCM **without** letting the
notification server learn who is talking to whom. Marmot does this with ephemeral
keypairs at every layer and a small in-group token protocol. This skill choreographs
those events; it implements no cryptography.

> **MIP-05 is `draft` `optional`** — clearly the least-stable Marmot surface; gate it
> behind a capability check and label it Draft to the builder. **Never reconstruct
> the gift-wrapping or encryption** — call **MDK** / **marmot-ts**.

## Attribution & sources

- **Protocol:** [Marmot Protocol](/catalog/marmot/) — **MIP-05 at commit `21a67b2`**
  (`21a67b24ffbfe14fc52022769aff77495402d728`), status `draft` `optional`.
- **Reference client:** [White Noise](/catalog/rust-lib-whitenoise/) (AGPL-3.0).
- **Libraries:** MDK ([`mdk-core`](/catalog/mdk-core/), MIT) / marmot-ts
  ([`@internet-privacy/marmot-ts`](/catalog/internet-privacy-marmot-ts/), MIT).
- **Conventions:** gift wrap [NIP-59](https://github.com/nostr-protocol/nips/blob/master/59.md)
  (`kind:1059`); inbox relays [NIP-17](https://github.com/nostr-protocol/nips/blob/master/17.md).

## The token lifecycle (kinds pinned at `21a67b2`)

In-group token messages are **unsigned application messages** carried inside the
group (MIP-03 `kind:445`); the privacy comes from MLS, not a signature.

| Kind | Purpose |
|---|---|
| **`kind:447`** | **Token Request** — a device announces/refreshes its push token to the group |
| **`kind:448`** | **Token List Response** — a member shares its full view of active tokens (in reply to a 447) |
| **`kind:449`** | **Token Removal** — a device disables notifications / is leaving |
| **`kind:446`** | **Notification Request rumor** — the per-message payload gift-wrapped to the notification server |
| **`kind:10050`** | the notification **server's inbox relay list**, which senders read to reach it |

- **Enroll / refresh:** on enabling notifications or joining, send `kind:447` in each
  group; members reply with `kind:448`. Refresh periodically (the spec recommends
  ~25–35 days with random jitter) and on OS token rotation. Replace a sender's stored
  token when you see a newer `kind:447` from them.
- **Leave / disable:** send `kind:449` before leaving or when disabling.
- **Notify:** to push a message, build a `kind:446` Notification Request rumor with an
  **ephemeral keypair**, gift-wrap it (`kind:1059`, NIP-59) to the notification
  server's pubkey, and deliver it to the server's `kind:10050` inbox relays. The
  server's Nostr pubkey is typically **hardcoded in the client** at build time (the
  iOS APNs bundle binding) — treat it as configuration, not a secret.
- **Privacy invariant:** ephemeral keys at every layer (token encryption, the
  `kind:446` rumor pubkey, the gift wrap) prevent the server from linking any
  notification to a user identity. Do not weaken this.

## Crypto you MUST delegate (never reconstruct)

- Gift-wrapping, ephemeral-key handling, token encryption → MDK / marmot-ts. This skill
  sequences the 447/448/449 lifecycle and the 446 dispatch — not the cryptography.

## Stop-and-ask triggers

- You're tempted to sign a token message, or to reuse a stable key where MIP-05 says
  ephemeral — that breaks the privacy invariant; stop.
- A pinned kind disagrees with the live (draft) MIP-05 — re-pin from a named commit.
- The builder wants the notification server to receive anything that links a message
  to a sender/recipient identity.

## Definition of done

- A device enrolls (`kind:447`), peers respond (`kind:448`), and removal
  (`kind:449`) works; per-message pushes go out as gift-wrapped `kind:446` rumors to
  the server's `kind:10050` inbox, with ephemeral keys throughout — all crypto by
  MDK / marmot-ts.
- The draft status is surfaced and the feature is capability-gated.
- `npm run check && npm run enforce` pass; the paired
  [`goose-recipes/marmot-push-notifications.yaml`](../../goose-recipes/marmot-push-notifications.yaml)
  stays in sync.
