import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { eligibleForStack, autoPickable, advisoryRank, pinnedDependencies } from './studio-stack.ts';

test('pinnedDependencies pins to each entry\'s recorded version, not "latest" (#3)', () => {
  const deps = [
    { name: 'nostr-tools', version: '2.23.5' },
    { name: '@noble/hashes', version: '1.4.0' },
    { name: 'v-prefixed', version: 'v1.0.1' }, // leading v stripped
    { name: 'no-version-pkg', version: null },
  ];
  const out = pinnedDependencies(deps);
  assert.equal(out['nostr-tools'], '^2.23.5'); // pinned, not "latest"
  assert.equal(out['@noble/hashes'], '^1.4.0');
  assert.equal(out['v-prefixed'], '^1.0.1'); // not ^v1.0.1
  // only entries with no recorded version fall back
  assert.equal(out['no-version-pkg'], 'latest');
  // when every entry has a version, no "latest" is emitted at all
  const all = pinnedDependencies([{ name: 'a', version: '1.0.0' }]);
  assert.ok(!Object.values(all).includes('latest'));
});

test('pinnedDependencies trims surrounding whitespace before stripping the v prefix', () => {
  const out = pinnedDependencies([
    { name: 'spacey', version: '  v1.2.3  ' }, // trimmed first → v stripped → valid range
    { name: 'blank', version: '   ' }, // whitespace-only → no version → latest
  ]);
  assert.equal(out['spacey'], '^1.2.3'); // not '^v1.2.3' or '^ 1.2.3 '
  assert.equal(out['blank'], 'latest');
});

test('eligibleForStack treats a candidate with no kind/verification as eligible', () => {
  // most catalog tools omit these; absence must not exclude them from a stack
  assert.ok(eligibleForStack({}));
  assert.ok(eligibleForStack({ kind: 'tool' }));
});

test('eligibleForStack admits verified AND under_review, excludes blocked + datasets (#4)', () => {
  assert.ok(eligibleForStack({ kind: 'tool', verification: 'verified' }));
  // under_review passed automated policy screening — eligible, labelled, not excluded
  assert.ok(eligibleForStack({ kind: 'tool', verification: 'under_review' }));
  // blocked failed — never recommended
  assert.ok(!eligibleForStack({ kind: 'tool', verification: 'blocked' }));
  // datasets are never part of a stack
  assert.ok(!eligibleForStack({ kind: 'dataset', verification: 'verified' }));
});

test('autoPickable forbids advisory tools as the default pick (react is never the default)', () => {
  assert.ok(autoPickable({ kind: 'tool', verification: 'verified', advisory: null }));
  assert.ok(autoPickable({ kind: 'tool', verification: 'under_review', advisory: null }));
  // Meta-origin (verified, advisory) — eligible but not auto-picked
  assert.ok(!autoPickable({ kind: 'tool', verification: 'verified', advisory: 'meta' }));
});

test('advisoryRank orders advisory tools last', () => {
  assert.equal(advisoryRank({ advisory: null }), 0);
  assert.equal(advisoryRank({ advisory: 'meta' }), 1);
});

// ---- Phase 5: the Marmot "secure messaging" stack assembles in Build Studio ----
// Build Studio fetches /catalog.json (src/pages/catalog.json.ts maps it from the
// catalog content collection) and keeps only eligibleForStack() entries. This test
// reads the SAME frontmatter, maps it the same way, and asserts the now-nostr-tagged
// Marmot cluster lands in the capability pools the blueprint draws from — so an
// "encrypted group messaging" intent really can assemble an MLS-based stack. It locks
// the Phase-1 protocol tagging: untag or block any of these and Build Studio quietly
// stops offering them, and this fails.
interface CatItem { name: string; category: string; protocols: string[]; verification: string; advisory: string | null; kind: string; }
function loadEntry(file: string): CatItem {
  const path = fileURLToPath(new URL(`../content/docs/catalog/${file}`, import.meta.url));
  const m = readFileSync(path, 'utf8').match(/^---\n([\s\S]*?)\n---/);
  assert.ok(m, `${file} must have YAML frontmatter`);
  const fm = yaml.load(m![1]) as Record<string, unknown>;
  // Mirrors the field mapping in src/pages/catalog.json.ts exactly.
  return {
    name: (fm.dependency_name as string) ?? (fm.title as string),
    category: (fm.category as string) ?? 'Misc & Everything Else',
    protocols: (fm.protocols as string[]) ?? [],
    verification: (fm.verification_status as string) ?? 'under_review',
    advisory: (fm.origin_advisory as string) ?? null,
    kind: fm.entry_type === 'dataset' ? 'dataset' : 'tool',
  };
}
// The pieces an "encrypted group messaging over Nostr" build leans on.
const CLUSTER = {
  ndk: loadEntry('nostr-dev-kit-ndk.mdx'),       // connect: the Nostr transport
  openmls: loadEntry('openmls.mdx'),             // privacy: the Rust MLS core
  marmot: loadEntry('marmot.mdx'),               // privacy: the Marmot protocol
  tsmls: loadEntry('ts-mls.mdx'),                // privacy: the JS MLS option
  blossom: loadEntry('blossom.mdx'),             // storage: encrypted blobs
  blossomServer: loadEntry('blossom-server.mdx'),// hosting: a media/relay server
};

test('Build Studio: every piece of the Marmot secure-messaging stack is eligible for a generated stack', () => {
  for (const [k, it] of Object.entries(CLUSTER)) {
    assert.ok(eligibleForStack(it), `${k} (${it.name}) must be eligibleForStack — Build Studio filters the rest out`);
  }
});

test('Build Studio: a nostr secure-messaging intent finds an auto-pickable MLS privacy layer', () => {
  // The blueprint's `privacy` capability draws from category 'Security & Privacy',
  // ranking nostr-tagged options first. The MLS layer must be in that pool AND be a
  // DEFAULT-able (non-advisory) pick — not buried behind an advisory warning.
  for (const it of [CLUSTER.openmls, CLUSTER.marmot]) {
    assert.equal(it.category, 'Security & Privacy', `${it.name} feeds the privacy capability`);
    assert.ok(it.protocols.includes('nostr'), `${it.name} must be nostr-tagged to rank in a nostr build`);
    assert.ok(autoPickable(it), `${it.name} must be auto-pickable so the blueprint can default to it`);
    assert.equal(advisoryRank(it), 0);
  }
  assert.ok(CLUSTER.tsmls.protocols.includes('nostr')); // the JS-side MLS alternative
});

test('Build Studio: the transport + relay/media hosting pieces are nostr-tagged in their categories', () => {
  assert.ok(CLUSTER.ndk.protocols.includes('nostr'));            // connect (NDK)
  // "if hosting is implied" — relay-served encrypted media (the guide's media path):
  assert.equal(CLUSTER.blossom.category, 'Databases & Storage'); // storage capability
  assert.ok(CLUSTER.blossom.protocols.includes('nostr'));
  assert.equal(CLUSTER.blossomServer.category, 'Hosting Infra & Deploy'); // hosting capability
  assert.ok(CLUSTER.blossomServer.protocols.includes('nostr'));
});
