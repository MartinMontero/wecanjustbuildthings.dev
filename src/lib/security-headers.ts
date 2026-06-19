/**
 * One source of truth for the site's security response headers.
 *
 * Two delivery paths, because the site is served two ways:
 *   - Static HTML pages are served by Cloudflare's asset layer and BYPASS the
 *     Worker (assets-first). They get these headers via a generated `dist/_headers`
 *     file — Workers Static Assets reads it natively. The build integration in
 *     astro.config.mjs (`emitSecurityHeaders`) calls renderHeadersFile().
 *   - The Worker's `/api/*` responses never touch the asset layer, so they get
 *     SECURITY_HEADERS attached in code (see worker/index.ts).
 *
 * The Content-Security-Policy is hash-based: every inline <script> the build
 * emits is hashed (extractInlineScriptHashes), so `script-src` can stay 'self'
 * with no 'unsafe-inline'. It ships in Report-Only mode first (see CSP_MODE in
 * the integration) so a missed directive LOGS a violation instead of breaking a
 * page; flip to enforce once the live auth/CMS flows are verified clean.
 *
 * NOTE: keep this module free of Node-only imports — it is bundled into the
 * Cloudflare Worker. Hashing uses Web Crypto (available in the Worker, Node 22,
 * and the build), and the hashing helpers are tree-shaken out of the Worker
 * bundle since the Worker only imports SECURITY_HEADERS + CSP_REPORT_PATH.
 */

/** Same-origin path the Report-Only policy posts violation reports to (Worker route). */
export const CSP_REPORT_PATH = '/api/csp-report';

/**
 * Max bytes of a violation-report body the Worker will parse and log. The report
 * endpoint is unauthenticated, so this bounds the work an anonymous POST can cause;
 * larger bodies are accepted (204) but not processed.
 */
export const CSP_REPORT_MAX_BYTES = 8192;

/** Whitelisted, truncated subset of a CSP violation report kept for logging. */
export interface CspReportSummary {
  documentUri?: string;
  effectiveDirective?: string;
  blockedUri?: string;
  sourceFile?: string;
  lineNumber?: number;
  disposition?: string;
}

const CSP_FIELD_MAX = 300;
const truncField = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value.slice(0, CSP_FIELD_MAX) : undefined;

/**
 * Parse a CSP violation-report body into a compact, whitelisted summary for logging.
 * Handles the `report-uri` payload shape (`{ "csp-report": { … } }`, CSP Level 2/3),
 * which is what our `report-uri` directive elicits. The endpoint is public, so we keep
 * only known keys and cap their length rather than echoing the raw body back into logs.
 * Returns null for anything that isn't a recognisable report.
 */
export function summariseCspReport(rawBody: string): CspReportSummary | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return null;
  }
  const report = (parsed as { 'csp-report'?: Record<string, unknown> } | null)?.['csp-report'];
  if (!report || typeof report !== 'object') return null;
  const line = report['line-number'];
  const summary: CspReportSummary = {
    documentUri: truncField(report['document-uri']),
    effectiveDirective: truncField(report['effective-directive'] ?? report['violated-directive']),
    blockedUri: truncField(report['blocked-uri']),
    sourceFile: truncField(report['source-file']),
    lineNumber: typeof line === 'number' ? line : undefined,
    disposition: truncField(report['disposition']),
  };
  return Object.values(summary).some((value) => value !== undefined) ? summary : null;
}

/**
 * Always-on headers (transport security, clickjacking, isolation, feature lockdown).
 * The CSP is delivered separately because it carries per-build inline-script hashes.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy':
    'accelerometer=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
};

export type CspMode = 'report-only' | 'enforce';

export interface CspOptions {
  /** sha256-… hashes for the inline <script> blocks the build emitted. */
  hashes: string[];
  /** Plausible domain, if analytics is enabled — adds plausible.io to script/connect. */
  plausibleDomain?: string | null;
}

/**
 * The site-wide Content-Security-Policy value (directives only; no header name).
 * connect-src stays 'self': every browser fetch is same-origin (/api/*, /catalog.json);
 * the registry/GitHub/AI-provider calls are all Worker-side, and OAuth to a PDS is a
 * navigation, not a fetch. The privileged /admin/ CMS needs a broader connect-src
 * (GitHub) — handled separately when this flips to enforce (see SECURITY.md).
 */
export function buildContentSecurityPolicy({ hashes, plausibleDomain }: CspOptions): string {
  const plausible = plausibleDomain ? ['https://plausible.io'] : [];
  // 'wasm-unsafe-eval' + worker-src 'self': Starlight's Pagefind search compiles
  // WebAssembly inside a same-origin Web Worker; without these, site search breaks
  // under enforcement. 'wasm-unsafe-eval' permits WASM compilation only — not eval().
  const scriptSrc = ["'self'", "'wasm-unsafe-eval'", ...hashes, ...plausible];
  const connectSrc = ["'self'", ...plausible];
  return [
    "default-src 'none'",
    `script-src ${scriptSrc.join(' ')}`,
    "style-src 'self' 'unsafe-inline'", // ~30 Starlight style="" attributes/page can't be hashed
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connectSrc.join(' ')}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "form-action 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    'upgrade-insecure-requests',
    `report-uri ${CSP_REPORT_PATH}`,
  ].join('; ');
}

const CSP_HEADER_NAME: Record<CspMode, string> = {
  'report-only': 'Content-Security-Policy-Report-Only',
  enforce: 'Content-Security-Policy',
};

export interface HeadersFileOptions extends CspOptions {
  mode?: CspMode;
}

/**
 * Render the full Cloudflare `_headers` file as a single `/*` rule. One rule only:
 * Cloudflare COMBINES (appends) overlapping rules rather than overriding, so a second
 * rule setting Content-Security-Policy would send a second header and the browser would
 * enforce the intersection — verified empirically with `wrangler dev`.
 */
export function renderHeadersFile({ hashes, plausibleDomain, mode = 'report-only' }: HeadersFileOptions): string {
  const lines = ['/*', `  ${CSP_HEADER_NAME[mode]}: ${buildContentSecurityPolicy({ hashes, plausibleDomain })}`];
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) lines.push(`  ${name}: ${value}`);
  return lines.join('\n') + '\n';
}

/**
 * Pull the bodies of executable inline <script> blocks out of an HTML string.
 * Skips external scripts (src=, covered by 'self') and non-executable data blocks
 * (e.g. type="application/json"). Sync + dependency-free so callers can dedupe
 * bodies across thousands of pages before hashing the handful of unique ones.
 */
export function extractInlineScriptBodies(html: string): string[] {
  const bodies: string[] = [];
  const re = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] ?? '';
    const body = m[2] ?? '';
    if (/\bsrc\s*=/i.test(attrs)) continue; // external — covered by script-src 'self'
    const type = (attrs.match(/\btype\s*=\s*["']([^"']*)["']/i)?.[1] ?? '').toLowerCase();
    // Only parser-executed scripts need a hash. A data block is never executed.
    if (type && !['module', 'text/javascript', 'application/javascript'].includes(type)) continue;
    if (body.trim() === '') continue;
    bodies.push(body);
  }
  return bodies;
}

/** CSP source expression (`'sha256-…'`) for one inline script body. */
export async function hashInlineScript(body: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  let binary = '';
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return `sha256-${btoa(binary)}`;
}

/** Convenience: the deduplicated set of inline-script hashes for one HTML string. */
export async function extractInlineScriptHashes(html: string): Promise<string[]> {
  const unique = [...new Set(extractInlineScriptBodies(html))];
  return Promise.all(unique.map(hashInlineScript));
}
