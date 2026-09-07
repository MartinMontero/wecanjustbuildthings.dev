#!/usr/bin/env node
/**
 * assemble-arabic-font.mjs — rebuilds public/fonts/readex-pro-arabic-headings.woff2
 * from its text-encoded source (data/fonts/parts/arabic-headings.b64.part-*.txt,
 * concatenated in sorted order).
 *
 * Why: the M6 Arabic display face is a binary asset, and this repo's
 * review lane transports text. The woff2 (32.6 KB, Readex Pro wght 700 subset,
 * OFL — see public/fonts/Readex-Pro-OFL.txt) is therefore committed as base64
 * and reassembled deterministically at prebuild, with a SHA-256 pin so a
 * corrupted or edited source fails the build loudly instead of shipping a
 * mangled font. Idempotent: skips the write when the output already matches.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

import { readdirSync } from 'node:fs';
const SRC_DIR = 'data/fonts/parts';
const parts = readdirSync(SRC_DIR).filter((f) => f.startsWith('arabic-headings.b64.part-')).sort();
const OUT = 'public/fonts/readex-pro-arabic-headings.woff2';
const SHA256 = 'd80553453c7d817c1c47c659ae58c02831934ccb5b54a0092526ed96277cf316';

if (!parts.length) { console.error('no font parts found in ' + SRC_DIR); process.exit(1); }
const b64 = parts.map((f) => readFileSync(`${SRC_DIR}/${f}`, 'utf8')).join('').replace(/\s+/g, '');
const buf = Buffer.from(b64, 'base64');
const digest = createHash('sha256').update(buf).digest('hex');
if (digest !== SHA256) {
  console.error(`arabic font source failed its SHA-256 pin: got ${digest}, want ${SHA256}`);
  process.exit(1);
}
if (existsSync(OUT) && createHash('sha256').update(readFileSync(OUT)).digest('hex') === SHA256) {
  console.log(`arabic font already assembled and pinned (${(buf.length / 1024).toFixed(1)} KB)`);
} else {
  writeFileSync(OUT, buf);
  console.log(`assembled ${OUT} (${(buf.length / 1024).toFixed(1)} KB woff2, sha256 pinned)`);
}
