/**
 * bunker-login.ts — pure helpers for the /console/ NIP-46 remote-bunker sign-in
 * (AdminConsole.svelte). Extracted so the security-relevant logic is unit-tested:
 * the Svelte island can't be imported by the node test runner, a plain module can.
 *
 * Design rules (these are the fix for the "silent bunker hang" class of failure):
 *   - Every remote-signer await is BOUNDED (withTimeout) — an unanswered on-phone
 *     approval or a dead relay must become a visible, explained error, never a
 *     spinner that lives forever.
 *   - Error → message mapping (bunkerReason) returns STATIC strings only. Bunker
 *     and relay errors are attacker-influenceable text; they are matched against,
 *     never echoed into the DOM.
 *   - Approval URLs (NIP-46 `auth_url`, used by web bunkers like nsec.app; Amber
 *     and other push-approval signers never send one) are signer-provided input:
 *     sanitized to http(s) and length-capped before the UI may open or render one.
 *   - Anything that looks like key material is refused before any of this runs.
 */

/** Bound on the bunker `connect()` round-trip — includes the human tapping
 *  "approve" on their signer, so generous; but never infinite. */
export const BUNKER_CONNECT_TIMEOUT_MS = 60_000;
/** Bound on the remote `signEvent()` round-trip (a second approval on most signers). */
export const BUNKER_SIGN_TIMEOUT_MS = 60_000;

export class TimeoutError extends Error {
  constructor(what: string, ms: number) {
    super(`${what} timed out after ${Math.round(ms / 1000)}s`);
    this.name = 'TimeoutError';
  }
}

/** Resolve/reject with `p`, or reject with TimeoutError after `ms`. On timeout the
 *  late settlement of `p` is swallowed so it can never surface as an unhandled
 *  rejection minutes later. */
export function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      p.catch(() => { /* late failure after timeout — already reported */ });
      reject(new TimeoutError(what, ms));
    }, ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/** Sanitize a signer-provided NIP-46 `auth_url` before the UI opens or renders it.
 *  http(s) only — never javascript:, data:, blob:, or custom schemes — and
 *  length-capped. Returns the normalized href, or null to drop it. */
export function safeApprovalUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  return url.href;
}

/**
 * Map a bunker sign-in failure to a human explanation. STATIC strings only —
 * `e` may carry relay/bunker-authored text (nostr-tools rejects with the bunker's
 * error string verbatim), so it is pattern-matched, never rendered.
 */
export function bunkerReason(e: unknown): string {
  if (e instanceof TimeoutError) {
    return 'The bunker didn’t answer in time. Approve the request in your signer app and try again — '
      + 'and note that a bunker:// secret is SINGLE-USE: paste a fresh connection string for each attempt.';
  }
  const msg = typeof e === 'string' ? e : e instanceof Error ? e.message : '';
  if (msg === 'challenge') return 'Couldn’t get a login challenge from the server — try again in a moment.';
  if (msg === 'verify') return 'The server refused the sign-in. Only allowlisted admin keys are accepted.';
  if (/secret|already|unauthorized|forbidden|denied|reject|invalid/i.test(msg)) {
    return 'The bunker refused the connection. bunker:// secrets are single-use — '
      + 'get a FRESH connection string from your signer app and try again.';
  }
  return 'Bunker sign-in didn’t complete. Check the connection string, approve the request in your signer, '
    + 'and make sure only allowlisted admin keys are used.';
}

/** Anything that looks like key material is refused outright — the console's
 *  bunker input is ONLY for a bunker:// connection string or a NIP-05 name. */
export function looksLikeKeyMaterial(s: string): boolean {
  const t = s.trim().toLowerCase();
  return t.startsWith('nsec1') || t.startsWith('ncryptsec1') || /^[0-9a-f]{64}$/.test(t);
}
