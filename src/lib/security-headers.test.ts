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

/** Independent oracle (node:crypto) for the module's Web Crypto hashing. */
const oracle = (body: string) => 'sha256-' + createHash('sha256').update(body, 'utf8').digest('base64');

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
  const csp = buildContentSecurityPolicy({ hashes: ['sha256-abc', 'sha256-def'] });
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /script-src 'self' 'wasm-unsafe-eval' sha256-abc sha256-def/);
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

test('renderHeadersFile emits one /* rule, Report-Only by default', () => {
  const file = renderHeadersFile({ hashes: ['sha256-abc'] });
  assert.match(file, /^\/\*$/m);
  assert.match(file, /Content-Security-Policy-Report-Only:/);
  assert.ok(!file.includes('\n  Content-Security-Policy:'), 'default must not enforce');
  assert.match(file, /X-Content-Type-Options: nosniff/);
  // exactly one CSP line (avoid the double-CSP intersection trap)
  assert.equal((file.match(/Content-Security-Policy/g) ?? []).length, 1);
});

test('renderHeadersFile mode=enforce switches the header name', () => {
  const file = renderHeadersFile({ hashes: ['sha256-abc'], mode: 'enforce' });
  assert.match(file, /\n {2}Content-Security-Policy: /);
  assert.ok(!file.includes('Report-Only'));
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
