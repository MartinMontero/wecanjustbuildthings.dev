# Feature spec: A minimal encrypted group — publish, invite, message

## Problem

A small organizing crew needs a private group chat that no relay operator,
platform, or network observer can read — using their existing Nostr identities,
with no phone numbers and no central server. They want the smallest possible
working slice: stand up a two-person encrypted group and exchange one message,
end to end.

## Users & their goal

Two organizers, each with their own Nostr keypair. One creates a group and invites
the other; both can send and read messages that only group members can decrypt.

## Scope

- In scope: publish a KeyPackage (`kind:30443`) + KeyPackage relay list
  (`kind:10051`); create an MLS group with the Marmot Group Data Extension
  (`0xF2EE`); invite a member via a NIP-59 gift-wrapped Welcome (`kind:444`); send
  and receive one encrypted Group Event (`kind:445`).
- Out of scope: media (MIP-04), push notifications (MIP-05), groups larger than a
  handful of members, a full UI, key backup/recovery.

## Requirements

- [ ] Generate/load each user's Nostr keypair client-side; use it as the MLS
      identity. Secret keys never leave the device.
- [ ] Publish a `kind:30443` KeyPackage with a random `d` slot, and a `kind:10051`
      relay list pointing at the relays that hold it.
- [ ] Create an MLS group (via `@internet-privacy/marmot-ts` / `ts-mls`) carrying
      the `0xF2EE` extension; all crypto done by the library.
- [ ] Invite the second user: fetch their `kind:30443`, build the Welcome, and
      deliver it NIP-59-gift-wrapped (`kind:1059` → `13` → `444`) to their inbox.
- [ ] Exchange one `kind:445` Group Event each user can decrypt; an AEAD failure
      drops the event and is surfaced, never exposing unauthenticated plaintext.
- [ ] After joining, the invitee rotates their KeyPackage.

## Constitution checks

- [ ] No dependency owned by Meta / OpenAI / xAI (Article I)
- [ ] All deps OSI-licensed, verified at a commit (Article II)
- [ ] **No hand-rolled cryptography** — MLS / AEAD / gift-wrap via the library;
      Marmot kinds pinned from the spec at a commit (Article III)
- [ ] KeyPackage rotation; keys client-side; no silent failures; group small
      (Article IV)

## Open questions (stop-and-ask)

- Which relays are the crew's defaults for KeyPackages (`kind:10051`) and inbox
  (`kind:10050`)? (operator decision)
- Where is each user's secret key stored on their device, and is that store
  acceptable for their threat model? (privacy decision)
