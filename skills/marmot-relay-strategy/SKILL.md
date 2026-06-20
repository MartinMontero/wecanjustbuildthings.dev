---
name: marmot-relay-strategy
description: >-
  Use when deciding which Nostr relays a Marmot (MLS-over-Nostr) client publishes
  to and reads from — specifically the split between KeyPackage relays (kind:10051)
  and inbox/notification relays (kind:10050). Gets discovery vs delivery right so
  invites and messages actually arrive, without leaking metadata. Triggers: "which
  relays for Marmot", "kind 10050 vs 10051", "Nostr relay strategy for encrypted
  groups", "KeyPackage relays", "Marmot inbox relays".
---

# marmot-relay-strategy

Marmot uses **two distinct relay lists** for two distinct jobs. Mixing them up is the
most common reason invites or messages silently fail to arrive. This skill picks the
right list for the right surface; it does not implement any cryptography.

> The crypto (gift-wrapping a Welcome, encrypting a message) is handled by
> **MDK** / **marmot-ts** — see [`marmot-group-setup`](../marmot-group-setup/SKILL.md).
> This skill is only about **which relay list publishes/serves what**.

## Attribution & sources

- **Protocol:** the [Marmot Protocol](/catalog/marmot/) (`marmot-protocol/marmot`, MIT).
  Kinds pinned from **MIP-00 and MIP-05 at commit `21a67b2`**
  (`21a67b24ffbfe14fc52022769aff77495402d728`); spec is in `review`/`draft`.
- **Reference client:** [White Noise](/catalog/rust-lib-whitenoise/) (AGPL-3.0).
- **Relay conventions:** Nostr [NIP-65](https://github.com/nostr-protocol/nips/blob/master/65.md)
  (relay lists) and [NIP-17](https://github.com/nostr-protocol/nips/blob/master/17.md)
  (DM/inbox relays); gift wrap is [NIP-59](https://github.com/nostr-protocol/nips/blob/master/59.md).

## The two lists (pinned at `21a67b2`)

| Kind | Role | Surface | Source |
|---|---|---|---|
| **`kind:10051`** | **KeyPackage relays** — where you publish your `kind:30443` KeyPackages so anyone can find one to invite you | **Discovery** (public) | MIP-00 |
| **`kind:10050`** | **Inbox / notification relays** — where gift-wrapped events addressed to you (Welcomes, push-notification requests) are delivered | **Delivery** (private) | MIP-05 + NIP-17 |

- **`kind:10051` (discovery).** Tag each relay as `["relay", "wss://…"]`, `content: ""`.
  These SHOULD be readable by anyone you'd accept an invite from. Update the list
  whenever your relay setup changes; stale KeyPackage relays mean nobody can invite you.
- **`kind:10050` (delivery).** Your NIP-17-style inbox: where a `kind:1059` gift wrap
  (a Welcome `kind:444`, or a MIP-05 notification request) lands. In MIP-05 the
  notification server itself advertises its inbox relays as a signed, replaceable
  `kind:10050` event, and senders read it to know where to deliver. Pick reliable,
  well-connected relays here — a missed gift wrap is a missed invite.

## Strategy

1. **Keep the surfaces separate.** Discovery (10051) is public and broad; delivery
   (10050) is your private inbox. Do not collapse them into one list.
2. **Publish KeyPackages only to your 10051 relays**, and make sure the same relays
   are in the `kind:10051` list — others read the list, then fetch the `kind:30443`.
3. **Confirm reachability before relying on it.** When inviting, fetch the invitee's
   `kind:10051`, then their KeyPackage; when sending a Welcome, deliver the gift wrap
   to the recipient's inbox (`kind:10050`) relays.
4. **Group message relays are separate again** — the Welcome's `relays` tag tells a
   new member where to read `kind:445` Group Events; that is group state, not a
   personal relay list.

## Stop-and-ask triggers

- You're about to publish KeyPackages or read Welcomes from a single mixed relay list.
- A pinned kind here disagrees with the live spec — re-pin from a named commit.
- The builder wants to drop inbox relays to "save connections," risking lost invites.

## Definition of done

- KeyPackages are published to, and discoverable via, the user's `kind:10051` list.
- Gift-wrapped Welcomes/notifications target the recipient's `kind:10050` inbox relays.
- The two lists are kept distinct and current; group-event relays come from the
  Welcome, not a personal list.
- `npm run check && npm run enforce` pass; the paired
  [`goose-recipes/marmot-relay-strategy.yaml`](../../goose-recipes/marmot-relay-strategy.yaml)
  stays in sync.
