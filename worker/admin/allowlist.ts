/**
 * The server-side admin allowlist — the single authority on WHO may hold an admin
 * session. Checked on every admin request, after (never instead of) cryptographic
 * verification of the identity.
 *
 * FAILS CLOSED. There is no self-registration, no environment override, and no
 * dev/test bypass. An identity absent from this list is rejected — including a
 * request carrying a perfectly valid signature — and removal revokes any live
 * session on its next request (per-request enforcement in worker/admin/router.ts).
 *
 * GOVERNANCE (the role field is genesis DATA, not a runtime capability switch):
 *   - role: "superadmin" — governance authority over THIS list, exercised through
 *     repository merge rights (add/remove admin = PR; revocation = commit +
 *     deploy). Never an in-app power: there is NO runtime write-path to the admin
 *     set. Also the highest capability tier when Phases 5–6 (catalog management,
 *     moderation) differentiate capabilities.
 *   - role: "admin" — assigned by superadmins via PR.
 *   TODAY all allowlisted identities pass the same gate; differentiated
 *   enforcement lands with the features that need it — nothing speculative here.
 *
 * Downstream deployers (this is AGPL software — run your own instance):
 * constitute your own admin set by editing the two arrays below in your fork.
 *   - nostr: 64-char lowercase HEX pubkeys (NOT npub…). Convert an npub with any
 *     NIP-19 decoder (e.g. `nostr-tools/nip19` decode) or your signer's settings.
 *   - bluesky: full DIDs (did:plc:… / did:web:…), NOT handles — handles are
 *     mutable pointers someone else can later hold; DIDs are stable.
 * Review additions like code (they are code): one identity per line, a comment
 * saying who it is, and review before merge.
 */

export type AdminRole = 'superadmin' | 'admin';

export interface AdminNostrEntry {
  /** 64-hex Nostr pubkey (lowercase). */
  readonly pubkey: string;
  readonly role: AdminRole;
}

export interface AdminBlueskyEntry {
  /** AT-Proto DID (did:plc:… / did:web:…). */
  readonly did: string;
  readonly role: AdminRole;
}

export interface AdminAllowlist {
  readonly nostr: readonly AdminNostrEntry[];
  readonly bluesky: readonly AdminBlueskyEntry[];
}

/** The committed allowlist. The operator adds identities in their own reviewed
 *  commit; the code never invents or defaults any. */
export const ADMIN_ALLOWLIST: AdminAllowlist = {
  nostr: [
    // { pubkey: '<64-hex admin pubkey>', role: 'admin' }, // who this is
  ],
  bluesky: [
    // { did: 'did:plc:<id>', role: 'admin' }, // who this is
  ],
};

const HEX_PUBKEY = /^[0-9a-f]{64}$/;
const DID = /^did:(plc|web):[a-zA-Z0-9._:%-]+$/;
const ROLES: readonly AdminRole[] = ['superadmin', 'admin'];

/** True only for a well-formed entry (malformed entries can never match — a typo
 *  in the allowlist must never accidentally grant access). */
export function isWellFormedNostrEntry(entry: AdminNostrEntry): boolean {
  return HEX_PUBKEY.test(entry.pubkey) && ROLES.includes(entry.role);
}
export function isWellFormedBlueskyEntry(entry: AdminBlueskyEntry): boolean {
  return DID.test(entry.did) && ROLES.includes(entry.role);
}

/** True only for a well-formed pubkey present in the list. Matching is
 *  case-insensitive on hex. */
export function isAllowedNostrPubkey(list: AdminAllowlist, pubkey: string): boolean {
  if (typeof pubkey !== 'string' || !HEX_PUBKEY.test(pubkey.toLowerCase())) return false;
  const needle = pubkey.toLowerCase();
  return list.nostr.some((entry) => isWellFormedNostrEntry(entry) && entry.pubkey === needle);
}

/** True only for a well-formed DID present in the list (exact match — DIDs are
 *  identifiers, not user input to normalize). */
export function isAllowedBlueskyDid(list: AdminAllowlist, did: string): boolean {
  if (typeof did !== 'string' || !DID.test(did)) return false;
  return list.bluesky.some((entry) => isWellFormedBlueskyEntry(entry) && entry.did === did);
}

/** The role recorded for an allowlisted identity, or null if not a member. Today
 *  this is informational (whoami/audit); Phases 5–6 gate capabilities on it. */
export function adminRoleFor(
  list: AdminAllowlist,
  provider: 'nostr' | 'bluesky',
  subject: string,
): AdminRole | null {
  if (provider === 'nostr') {
    if (!isAllowedNostrPubkey(list, subject)) return null;
    return list.nostr.find((e) => e.pubkey === subject.toLowerCase())?.role ?? null;
  }
  if (!isAllowedBlueskyDid(list, subject)) return null;
  return list.bluesky.find((e) => e.did === subject)?.role ?? null;
}
