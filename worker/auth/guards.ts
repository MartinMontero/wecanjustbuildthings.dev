/**
 * Request guards shared by the user-auth routes (worker/index.ts) and the admin
 * routes (worker/admin/router.ts). Extracted from worker/index.ts unchanged so the
 * admin router can reuse them without importing the Worker entry (which imports the
 * admin router — a cycle).
 */
import type { RateLimit } from './cf.ts';

/** Client IP for rate-limit keying. `cf-connecting-ip` is set by Cloudflare's edge
 *  and can't be spoofed by the client; fall back to a shared bucket if it's absent. */
export function clientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip') || 'unknown';
}

/** True when this request should be rejected for exceeding the rate limit. No-ops
 *  (never limits) when the binding is unprovisioned, so unauthenticated abuse is
 *  bounded in production without breaking dev/test or an unconfigured deploy. */
export async function overRateLimit(
  limiter: RateLimit | undefined,
  request: Request,
  bucket: string,
): Promise<boolean> {
  if (!limiter) return false;
  try {
    const { success } = await limiter.limit({ key: `${bucket}:${clientIp(request)}` });
    return !success;
  } catch {
    return false; // limiter failure must never take sign-in down
  }
}

/** True when a browser marks this request as coming from a different site. Prefers
 *  the unspoofable Fetch-Metadata `Sec-Fetch-Site` header; falls back to comparing
 *  `Origin` against the canonical site origin. Absent both signals (non-browser
 *  client), returns false — CSRF is an ambient-cookie, browser-only threat. */
export function crossSiteRequest(request: Request, siteUrl?: string): boolean {
  const site = request.headers.get('sec-fetch-site');
  if (site) return site === 'cross-site';
  const origin = request.headers.get('origin');
  if (origin) {
    const expected = siteUrl ?? new URL(request.url).origin;
    try { return new URL(origin).origin !== new URL(expected).origin; } catch { return true; }
  }
  return false;
}
