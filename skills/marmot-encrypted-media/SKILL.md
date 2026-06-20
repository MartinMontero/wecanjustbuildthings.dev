---
name: marmot-encrypted-media
description: >-
  Use when adding encrypted images, video, or files to a Marmot (MLS-over-Nostr)
  group — MIP-04 media: encrypt with a key derived from the MLS exporter secret,
  store the blob on a Blossom media server, and share it via an imeta tag in a group
  message. Delegates all cryptography to MDK / marmot-ts. NOTE: MIP-04 is a DRAFT
  (optional). Triggers: "send an encrypted image in a Marmot group", "Marmot media",
  "MIP-04 Blossom media", "encrypted attachments on Nostr".
---

# marmot-encrypted-media

Attach media to a Marmot group without putting plaintext (or a re-usable key) on a
public media server. The file is encrypted with a key derived from the group's MLS
exporter secret, the ciphertext is stored on **Blossom**, and only an `imeta` tag —
URL, hash, and nonce — travels in the group message.

> **MIP-04 is `draft` `optional`.** Treat the format as not-yet-stable and gate it
> behind a capability check. And as always: **do not implement the AEAD or key
> derivation yourself** — call **MDK** / **marmot-ts**. This skill choreographs
> upload + `imeta`, not cryptography.

## Attribution & sources

- **Protocol:** [Marmot Protocol](/catalog/marmot/) — **MIP-04 at commit `21a67b2`**
  (`21a67b24ffbfe14fc52022769aff77495402d728`), status `draft` `optional`.
- **Storage:** the [Blossom protocol](/catalog/blossom/) (Unlicense) and a
  [Blossom server](/catalog/blossom-server/) (MIT) to host blobs; the
  [`blossom-client-sdk`](/catalog/blossom-client-sdk/) (MIT) to talk to it.
- **Libraries:** MDK ([`mdk-core`](/catalog/mdk-core/), MIT) / marmot-ts
  ([`@internet-privacy/marmot-ts`](/catalog/internet-privacy-marmot-ts/), MIT) for the crypto.
- **Conventions:** [NIP-92](https://github.com/nostr-protocol/nips/blob/master/92.md)
  `imeta` tags; messages ride MIP-03 `kind:445` Group Events.

## The flow (pinned at `21a67b2`, version `mip04-v2`)

1. **Derive the media key (library does this).** Distinct from the message key, it
   comes from `exporter_secret = MLS-Exporter("marmot", "encrypted-media", 32)`, then
   `file_key = HKDF-Expand(exporter_secret, "mip04-v2" ‖ … ‖ "key", 32)` bound to the
   file's SHA-256, canonical MIME type, and filename. **Always `mip04-v2`** — reject
   `mip04-v1` (its deterministic nonce is nonce-reuse-vulnerable).
2. **Encrypt.** `encrypted_content = ChaCha20-Poly1305.encrypt(file_key, nonce, plaintext, aad)`
   with a fresh cryptographically-random **12-byte nonce** per file (the library
   generates it). The AAD binds version, file hash, MIME, and filename.
3. **Upload to Blossom.** Store the ciphertext on a Blossom server; the blob is
   content-addressed by `SHA256(encrypted_content)`. Uploads are authenticated with a
   Nostr-signed authorization, so the media layer never sees your plaintext or your
   group keys. Use [`blossom-client-sdk`](/catalog/blossom-client-sdk/).
4. **Share via `imeta`.** Put a NIP-92 `imeta` tag on the `kind:445` Group Message:
   `url` (Blossom URL), `m` (MIME), `x` (file SHA-256), **`n` (the random nonce, hex)**,
   `v mip04-v2`, plus optional `dim`/`blurhash`. The nonce MUST travel in `n` — it is
   not derivable.
5. **Receive & decrypt (library does this).** Fetch the blob by hash, verify it,
   re-derive `file_key` from the current exporter secret + the `imeta` metadata, and
   ChaCha20-Poly1305-decrypt using the `n` nonce. Authentication failure ⇒ discard.

## Crypto you MUST delegate (never reconstruct)

- Exporter-secret + HKDF key derivation, ChaCha20-Poly1305 AEAD, nonce generation →
  MDK / marmot-ts. This skill only orchestrates the Blossom upload and the `imeta` tag.

## Stop-and-ask triggers

- You're about to derive the key, run the AEAD, or generate the nonce by hand.
- A producer emits `mip04-v1`, or omits the `n` nonce field — reject and warn.
- A number here disagrees with the live (draft) MIP-04 — re-pin from a named commit.
- The builder wants to store plaintext media, or reuse a nonce/key across files.

## Definition of done

- Media is ChaCha20-Poly1305-encrypted with a library-derived key, stored on Blossom
  by `SHA256(encrypted_content)`, and shared via a `mip04-v2` `imeta` tag carrying the
  random `n` nonce — all crypto done by MDK / marmot-ts.
- `mip04-v1` is rejected; the draft status is surfaced to the builder.
- `npm run check && npm run enforce` pass; the paired
  [`goose-recipes/marmot-encrypted-media.yaml`](../../goose-recipes/marmot-encrypted-media.yaml)
  stays in sync.
