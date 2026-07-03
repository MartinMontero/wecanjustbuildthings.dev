/**
 * The server-side admin allowlist — the single authority on WHO may hold an admin
 * session. Checked on every admin request, after (never instead of) cryptographic
 * verification of the identity.
 *
 * SHIPS EMPTY AND FAILS CLOSED. Zero admins exist until identities are deliberately
 * committed here and deployed; there is no self-registration, no environment
 * override, and no dev/test bypass. An empty list rejects everyone — including a
 * request carrying a perfectly valid signature.
 *
 * Downstream deployers (this is AGPL software — run your own instance): constitute
 * your own admin set by editing the two arrays below in your fork and deploying.
 *   - nostrPubkeys: 64-char lowercase HEX pubkeys (NOT npub…). To convert an npub,
 *     use any NIP-19 decoder (e.g. `nostr-tools/nip19` decode) or your signer's
 *     settings page, which usually shows both forms.
 *   - blueskyDids: full DIDs (did:plc:… or did:web:…), NOT handles. Handles can be
 *     re-registered by someone else; DIDs are stable. Find yours at
 *     https://bsky.social settings or by resolving your handle.
 * Review additions like code (they are code): one identity per line, a comment
 * saying who it is, and two-person review before merge.
 */

export interface AdminAllowlist {
  /** 64-hex Nostr pubkeys (lowercase). */
  readonly nostrPubkeys: readonly string[];
  /** AT-Proto DIDs (did:plc:… / did:web:…). */
  readonly blueskyDids: readonly string[];
}

/** The committed allowlist. EMPTY by design — the operator adds real identities in
 *  their own reviewed commit; the code never invents or defaults any. */
export const ADMIN_ALLOWLIST: AdminAllowlist = {
  nostrPubkeys: [
    // '<64-hex admin pubkey>', // who this is
  ],
  blueskyDids: [
    // 'did:plc:<id>', // who this is
  ],
};

const HEX_PUBKEY = /^[0-9a-f]{64}$/;
const DID = /^did:(plc|web):[a-zA-Z0-9._:%-]+$/;

/** True only for a well-formed pubkey present in the list. Malformed ENTRIES are
 *  ignored (a typo in the allowlist must never accidentally match), and matching is
 *  case-insensitive on hex. */
export function isAllowedNostrPubkey(list: AdminAllowlist, pubkey: string): boolean {
  if (typeof pubkey !== 'string' || !HEX_PUBKEY.test(pubkey.toLowerCase())) return false;
  const needle = pubkey.toLowerCase();
  return list.nostrPubkeys.some((entry) => HEX_PUBKEY.test(entry) && entry === needle);
}

/** True only for a well-formed DID present in the list (exact match — DIDs are
 *  identifiers, not user input to normalize). */
export function isAllowedBlueskyDid(list: AdminAllowlist, did: string): boolean {
  if (typeof did !== 'string' || !DID.test(did)) return false;
  return list.blueskyDids.some((entry) => DID.test(entry) && entry === did);
}
