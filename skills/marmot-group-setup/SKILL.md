---
name: marmot-group-setup
description: >-
  Use when building end-to-end-encrypted group messaging on Nostr with the Marmot
  protocol (MLS over Nostr) — the protocol behind the White Noise client. Walks the
  six-step flow (identity → KeyPackage → group → Welcome invite → send → receive)
  using the correct Nostr event kinds, and delegates ALL cryptography to the
  Marmot Development Kit (MDK) / marmot-ts, never reconstructing MLS by hand.
  Triggers: "encrypted group chat on Nostr", "build a Marmot group", "MLS over
  Nostr", "White Noise style messaging", "set up a Marmot group".
---

# marmot-group-setup

Orchestrate the Marmot group-messaging flow end to end. Marmot layers the IETF
**MLS** protocol (RFC 9420) over Nostr: MLS provides the forward-secret group
cryptography; Nostr provides identity (your keypair) and transport (relays).

> **This skill choreographs Nostr events. It does NOT implement cryptography.**
> Never hand-roll MLS, the ChaCha20-Poly1305 encryption, the exporter-secret
> derivation, or the gift-wrapping. Call a vetted implementation:
> **MDK** (Rust: [`mdk-core`](/catalog/mdk-core/) on [`openmls`](/catalog/openmls/))
> or **marmot-ts** ([`@internet-privacy/marmot-ts`](/catalog/internet-privacy-marmot-ts/)
> on [`ts-mls`](/catalog/ts-mls/)). Reconstructing crypto from a model is a
> stop-and-ask, not a step.

## Attribution & sources

- **Protocol:** the [Marmot Protocol](/catalog/marmot/) — spec repo
  `marmot-protocol/marmot`, MIT. Every event kind and identifier below is pinned
  from **MIP-00 … MIP-05 at commit `21a67b2`** (`21a67b24ffbfe14fc52022769aff77495402d728`).
  Re-verify against the spec before relying on a number; the spec is in `review`.
- **Reference client:** [White Noise](/catalog/rust-lib-whitenoise/) (`parres-hq/whitenoise`
  + `marmot-protocol/whitenoise-rs`, AGPL-3.0) — the production Marmot client.
- **Libraries:** MDK ([`mdk-core`](/catalog/mdk-core/), MIT),
  [`openmls`](/catalog/openmls/) (MIT), [`@internet-privacy/marmot-ts`](/catalog/internet-privacy-marmot-ts/)
  (MIT), [`ts-mls`](/catalog/ts-mls/) (MIT).
- **Underlying standards:** MLS = [RFC 9420](https://www.rfc-editor.org/rfc/rfc9420.html);
  Nostr [NIP-59](https://github.com/nostr-protocol/nips/blob/master/59.md) (gift wrap),
  [NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md) (encryption),
  [NIP-40](https://github.com/nostr-protocol/nips/blob/master/40.md) (expiration).

## The six-step flow (kinds pinned at `21a67b2`)

1. **Identity → MLS credential.** Use the builder's existing Nostr keypair. The MLS
   `BasicCredential` carries the 32-byte x-only Nostr public key (MIP-00). The
   builder brings their own key; the platform never holds it.

2. **Publish a KeyPackage.** Generate an MLS KeyPackage and publish it as a
   **`kind:30443`** addressable event (MIP-00), with a random 32-byte hex `d`-tag
   "slot" so it can be rotated in place. Advertise where your KeyPackages live with
   a **`kind:10051`** relay-list event. (Legacy note: `kind:443` is the old,
   non-replaceable KeyPackage event; publish/consume it **only** during an active
   migration window, preferring `kind:30443`.)

3. **Create the group.** Build the MLS group with the **Marmot Group Data Extension
   `0xF2EE`** (MIP-01) registered in both `LeafNode.capabilities` and
   `GroupContext.extensions`. Mandatory ciphersuite:
   `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519` (`0x0001`). `required_capabilities`
   MUST include `self_remove` (`0x000a`). Let MDK / marmot-ts construct this — do
   not assemble MLS structures by hand.

4. **Invite via a Welcome.** Fetch the invitee's `kind:30443` KeyPackage, build the
   MLS Welcome, and deliver it as an unsigned **`kind:444`** Welcome rumor
   gift-wrapped per NIP-59: inner `kind:444` rumor → `kind:13` seal → outer
   **`kind:1059`** gift wrap (MIP-02). The `e` tag references the consumed
   KeyPackage event id. After joining, the invitee rotates their KeyPackage
   (publishes a fresh `kind:30443` under the same `d`).

5. **Send a message.** Derive the per-epoch key with the MLS exporter —
   `exporter_secret = MLS-Exporter("marmot", "group-event", 32)` — and let the
   library ChaCha20-Poly1305-encrypt the serialized `MLSMessage`. Publish the
   result as a **`kind:445`** Group Event whose `content` is
   `base64(nonce ‖ ciphertext)` (MIP-03). If the group sets `disappearing_message_secs`,
   the library auto-applies a NIP-40 `expiration` tag.

6. **Receive & decrypt.** Subscribe to **`kind:445`** for the group, hand each event
   to MDK / marmot-ts to authenticate and decrypt (AEAD failure ⇒ drop the event,
   never expose unauthenticated plaintext), and process the MLS message to advance
   the group epoch.

## Crypto you MUST delegate (never reconstruct)

- MLS group state, epochs, commits, proposals → `openmls` / `ts-mls` via MDK / marmot-ts.
- KeyPackage generation, Welcome construction, exporter-secret derivation → the library.
- ChaCha20-Poly1305 AEAD and NIP-59 gift-wrapping → the library.

This skill's job is the **Nostr-event choreography** (which kind, which relays, what
order) and wiring the builder's Goose to the right library — not the math.

## Stop-and-ask triggers

- You're tempted to implement MLS, AEAD, key derivation, or gift-wrapping yourself
  instead of calling MDK / marmot-ts. Stop — that is never in scope.
- A pinned number here disagrees with the live spec (it is in `review`). Re-pin from
  `marmot-protocol/marmot` at a named commit; never guess.
- The builder asks to weaken forward secrecy, skip the Welcome, or reuse a KeyPackage
  beyond its `last_resort` allowance.

## Definition of done

- Two members exchange a `kind:445` message that each can decrypt, with all crypto
  performed by MDK / marmot-ts (no hand-rolled cryptography in the diff).
- KeyPackages are `kind:30443` with rotation; the Welcome is NIP-59 gift-wrapped
  (`1059` → `13` → `444`); relay lists are `kind:10051`.
- Every protocol number traces to a cited MIP at a pinned commit.
- `npm run check && npm run enforce` pass; the paired
  [`goose-recipes/marmot-group-setup.yaml`](../../goose-recipes/marmot-group-setup.yaml)
  stays in sync with this file.
