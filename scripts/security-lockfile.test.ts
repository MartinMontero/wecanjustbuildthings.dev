import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Lockfile assertion for actionable CRITICALs that were fixed by a version
// bump. A pinned entry here asserts the locked version is OUTSIDE the
// advisory's vulnerable range, so a lockfile regression (a re-resolution that
// reintroduces the vulnerable version) fails `npm test` even if the nightly
// OSV re-scan is missed. Mirrors the osv-critical-gate.sh posture: only
// fix-available CRITICALs get pinned here — accepted risks live in
// security/vex/ + osv-scanner.toml instead.

interface Pin {
  id: string; // advisory id the pin tracks
  pkg: string; // lockfile package name
  minimum: [number, number, number]; // first patched version (inclusive)
  note: string;
}

const PINS: Pin[] = [
  {
    id: 'GHSA-jqcg-44mw-7w3h',
    pkg: 'proxy-addr',
    minimum: [2, 0, 8], // <2.0.8 vulnerable (>= 1.1.0); CVSS 9.1; issue #77
    note: 'IPv4-mapped IPv6 trust-subnet spoofing; fix landed as proxy-addr 2.0.8 via express ~2.0.7 range',
  },
];

function parseVersion(v: string): [number, number, number] {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
  assert.ok(m, `unparseable version: ${v}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function gte(a: [number, number, number], b: [number, number, number]): boolean {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return true;
}

const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));

for (const pin of PINS) {
  test(`lockfile pin: ${pin.pkg} is outside the ${pin.id} vulnerable range (>= ${pin.minimum.join('.')})`, () => {
    const entry = lock.packages?.[`node_modules/${pin.pkg}`];
    assert.ok(entry, `${pin.pkg} not present in package-lock.json`);
    const version = parseVersion(entry.version);
    assert.ok(
      gte(version, pin.minimum),
      `${pin.pkg}@${entry.version} is vulnerable to ${pin.id} (${pin.note}); needs >= ${pin.minimum.join('.')}`,
    );
  });
}
