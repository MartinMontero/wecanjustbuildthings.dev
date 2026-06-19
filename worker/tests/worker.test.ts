import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRepo, safeLocalPath, cookie } from '../index.ts';

test('safeLocalPath rejects open-redirect targets', () => {
  // Legitimate same-origin paths pass through unchanged.
  assert.equal(safeLocalPath('/build/'), '/build/');
  assert.equal(safeLocalPath('/build/?x=1'), '/build/?x=1');
  // Anything that could leave the origin falls back to the safe default.
  assert.equal(safeLocalPath('https://evil.com'), '/build/');
  assert.equal(safeLocalPath('//evil.com'), '/build/');
  assert.equal(safeLocalPath('/\\evil.com'), '/build/');
  assert.equal(safeLocalPath('javascript:alert(1)'), '/build/');
  assert.equal(safeLocalPath('build/'), '/build/'); // no leading slash
  assert.equal(safeLocalPath(null), '/build/');
  assert.equal(safeLocalPath(undefined), '/build/');
  assert.equal(safeLocalPath(''), '/build/');
  assert.equal(safeLocalPath('/x', '/y'), '/x');
  assert.equal(safeLocalPath('bad', '/y'), '/y'); // custom fallback honored
});

test('normalizeRepo canonicalizes git/shorthand forms to https URLs', () => {
  assert.equal(normalizeRepo('git+https://github.com/a/b.git'), 'https://github.com/a/b');
  assert.equal(normalizeRepo('git://github.com/a/b.git'), 'https://github.com/a/b');
  assert.equal(normalizeRepo('a/b'), 'https://github.com/a/b');
  assert.equal(normalizeRepo('https://github.com/a/b.git#main'), 'https://github.com/a/b#main');
  assert.equal(normalizeRepo(undefined), undefined);
  assert.equal(normalizeRepo('not a url'), undefined);
});

test('cookie parses a named value from the Cookie header', () => {
  const req = new Request('https://x/', { headers: { cookie: 'gh_state=abc; gh_back=%2Fbuild%2F; other=1' } });
  assert.equal(cookie(req, 'gh_state'), 'abc');
  assert.equal(cookie(req, 'gh_back'), '/build/'); // URL-decoded
  assert.equal(cookie(req, 'missing'), undefined);
  assert.equal(cookie(new Request('https://x/'), 'gh_state'), undefined);
});
