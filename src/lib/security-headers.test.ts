import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  SECURITY_HEADERS,
  CSP_REPORT_PATH,
  CSP_REPORT_MAX_BYTES,
  summariseCspReport,
  buildContentSecurityPolicy,
  renderHeadersFile,
  extractInlineScriptBodies,
  extractInlineScriptHashes,
  hashInlineScript,
} from './security-headers.ts';

/** Independent oracle (node:crypto) for the module's Web Crypto hashing. A CSP hash
 *  source is single-quoted per the grammar — the oracle mirrors that. */
const oracle = (body: string) => "'sha256-" + createHash('sha256').update(body, 'utf8').digest('base64') + "'";

test('SECURITY_HEADERS carry the expected hardening set', () => {
  assert.equal(SECURITY_HEADERS['X-Content-Type-Options'], 'nosniff');
  assert.equal(SECURITY_HEADERS['X-Frame-Options'], 'DENY');
  assert.match(SECURITY_HEADERS['Strict-Transport-Security'] ?? '', /max-age=\d+/);
  assert.ok(SECURITY_HEADERS['Referrer-Policy']);
  assert.ok(SECURITY_HEADERS['Permissions-Policy']);
});

test('hashInlineScript matches an independent SHA-256 implementation', async () => {
  for (const body of ['console.log("hi");', 'StarlightThemeProvider.updatePickers();', '']) {
    assert.equal(await hashInlineScript(body), oracle(body));
  }
});

test('extractInlineScriptBodies hashes executables, skips src + data blocks', () => {
  const html = [
    '<script>A()</script>',
    '<script type="module">B()</script>',
    '<script src="/_astro/app.js"></script>', // external — skip
    '<script type="application/json">{"x":1}</script>', // data — skip
    '<script>A()</script>', // duplicate body
    '<script>  </script>', // empty — skip
  ].join('\n');
  const bodies = extractInlineScriptBodies(html);
  assert.deepEqual(bodies, ['A()', 'B()', 'A()']); // both executables, dup preserved (caller dedupes)
});

test('extractInlineScriptHashes dedupes and uses sha256', async () => {
  const html = '<script>A()</script><script>A()</script><script>B()</script>';
  const hashes = await extractInlineScriptHashes(html);
  assert.deepEqual(new Set(hashes), new Set([oracle('A()'), oracle('B()')]));
  assert.equal(hashes.length, 2);
});

test('buildContentSecurityPolicy is strict, hash-based, with the Pagefind allowances', () => {
  const csp = buildContentSecurityPolicy({ hashes: ["'sha256-abc'", "'sha256-def'"] });
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /script-src 'self' 'wasm-unsafe-eval' 'sha256-abc' 'sha256-def'/);
  // Every hash source must be single-quoted — a bare `sha256-…` is an invalid CSP
  // source the browser drops, which would block the inline scripts under enforce.
  const scriptSrc = csp.split(';').find((d) => d.trim().startsWith('script-src'))!;
  for (const tok of scriptSrc.trim().split(/\s+/).slice(1)) {
    if (tok.includes('sha256-')) assert.ok(/^'sha256-[^']+'$/.test(tok), `hash not single-quoted: ${tok}`);
  }
  assert.ok(!/(?<!')sha256-/.test(csp), 'no bare (unquoted) sha256- in the policy');
  assert.match(csp, /worker-src 'self'/);
  assert.match(csp, /style-src 'self' 'unsafe-inline'/);
  assert.match(csp, /connect-src 'self'(;| )/); // no wildcards
  assert.ok(!csp.includes('https:;') && !/connect-src[^;]*\bhttps:\B/.test(csp), 'no https: wildcard');
  assert.match(csp, new RegExp(`report-uri ${CSP_REPORT_PATH}`));
  assert.ok(!csp.includes("'unsafe-eval'") || csp.includes("'wasm-unsafe-eval'"));
});

test('Plausible is opt-in: hosts appear only when a domain is set', () => {
  const off = buildContentSecurityPolicy({ hashes: [] });
  assert.ok(!off.includes('plausible.io'));
  const on = buildContentSecurityPolicy({ hashes: [], plausibleDomain: 'example.org' });
  assert.match(on, /script-src[^;]*https:\/\/plausible\.io/);
  assert.match(on, /connect-src[^;]*https:\/\/plausible\.io/);
});

/** Split the rendered _headers file into its two rules by path line. */
function splitRules(file: string): { global: string; console: string } {
  const idx = file.indexOf('/console/*');
  assert.ok(idx > 0, 'missing /console/* rule');
  return { global: file.slice(0, idx), console: file.slice(idx) };
}

test('renderHeadersFile emits a single-CSP /* rule, Report-Only by default', () => {
  const file = renderHeadersFile({ hashes: ["'sha256-abc'"] });
  assert.match(file, /^\/\*$/m);
  assert.match(file, /'sha256-abc'/); // quoted hash survives into the _headers file
  assert.match(file, /Content-Security-Policy-Report-Only:/);
  assert.ok(!file.includes('\n  Content-Security-Policy:'), 'default must not enforce');
  assert.match(file, /X-Content-Type-Options: nosniff/);
  const { global, console: consoleRule } = splitRules(file);
  // exactly one CSP line per applied policy (avoid the double-CSP intersection trap):
  // the /* rule SETS once; the /console/* rule DETACHES the inherited one, then SETS once.
  assert.equal((global.match(/Content-Security-Policy/g) ?? []).length, 1);
  assert.match(consoleRule, /^ {2}! Content-Security-Policy-Report-Only$/m);
  assert.equal((consoleRule.match(/^ {2}Content-Security-Policy-Report-Only: /gm) ?? []).length, 1);
  // the console rule must not re-set (and thus duplicate) any non-CSP header
  assert.ok(!consoleRule.includes('X-Content-Type-Options'));
});

test('renderHeadersFile mode=enforce switches the header name in BOTH rules (detach line included)', () => {
  const file = renderHeadersFile({ hashes: ['sha256-abc'], mode: 'enforce' });
  assert.match(file, /\n {2}Content-Security-Policy: /);
  assert.ok(!file.includes('Report-Only'));
  assert.match(splitRules(file).console, /^ {2}! Content-Security-Policy$/m);
});

test('the /console/* rule differs from the global policy ONLY by wss: in connect-src', () => {
  for (const mode of ['report-only', 'enforce'] as const) {
    const name = mode === 'enforce' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only';
    const file = renderHeadersFile({ hashes: ["'sha256-abc'", "'sha256-def'"], plausibleDomain: 'example.org', mode });
    const { global, console: consoleRule } = splitRules(file);
    const globalCsp = global.match(new RegExp(`^ {2}${name}: (.*)$`, 'm'))?.[1];
    const consoleCsp = consoleRule.match(new RegExp(`^ {2}${name}: (.*)$`, 'm'))?.[1];
    assert.ok(globalCsp && consoleCsp, `both rules carry a ${name} policy`);
    // The site-wide policy never gains wss: — only the console page speaks to bunker relays.
    assert.ok(!globalCsp.includes('wss:'), 'global policy must not allow wss:');
    // Byte-identical except connect-src additionally allows wss:. This pins future
    // global-CSP edits (new hashes, new hosts) to flow into the console rule unchanged.
    assert.equal(consoleCsp, globalCsp.replace(/connect-src ([^;]*)/, 'connect-src $1 wss:'));
  }
});

test('summariseCspReport whitelists + truncates a report-uri payload', () => {
  const summary = summariseCspReport(
    JSON.stringify({
      'csp-report': {
        'document-uri': 'https://wecanjustbuildthings.dev/build/',
        'effective-directive': 'script-src-elem',
        'violated-directive': 'script-src-elem',
        'blocked-uri': 'inline',
        'source-file': 'https://wecanjustbuildthings.dev/build/',
        'line-number': 42,
        disposition: 'report',
        'original-policy': 'x'.repeat(5000), // not whitelisted — must be dropped
      },
    }),
  );
  assert.deepEqual(summary, {
    documentUri: 'https://wecanjustbuildthings.dev/build/',
    effectiveDirective: 'script-src-elem',
    blockedUri: 'inline',
    sourceFile: 'https://wecanjustbuildthings.dev/build/',
    lineNumber: 42,
    disposition: 'report',
  });
});

test('summariseCspReport caps field length and prefers effective- over violated-directive', () => {
  const summary = summariseCspReport(
    JSON.stringify({
      'csp-report': { 'blocked-uri': 'z'.repeat(1000), 'effective-directive': 'img-src', 'violated-directive': 'default-src' },
    }),
  );
  assert.equal(summary?.blockedUri?.length, 300);
  assert.equal(summary?.effectiveDirective, 'img-src');
});

test('summariseCspReport returns null for malformed / non-report bodies', () => {
  assert.equal(summariseCspReport('not json'), null);
  assert.equal(summariseCspReport('{}'), null); // no csp-report key
  assert.equal(summariseCspReport(JSON.stringify({ 'csp-report': {} })), null); // no usable fields
  assert.equal(summariseCspReport(JSON.stringify({ 'csp-report': 'x' })), null); // wrong type
  assert.equal(summariseCspReport(''), null);
});

test('CSP_REPORT_MAX_BYTES is a sane, bounded limit', () => {
  assert.ok(CSP_REPORT_MAX_BYTES > 0 && CSP_REPORT_MAX_BYTES <= 64 * 1024);
});
