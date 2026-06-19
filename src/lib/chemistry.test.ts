import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chemistry, partnersOf } from './chemistry.ts';

const stack = [
  { name: 'ndk', capId: 'connect', category: 'Frameworks & Libraries' },
  { name: 'svelte', capId: 'app', category: 'Frameworks & Libraries' },
  { name: 'nip07', capId: 'identity', category: 'Auth Identity & Keys' },
  { name: 'sqlite', capId: 'storage', category: 'Databases & Storage' },
];

test('chemistry pairs follow the capability role graph', () => {
  const c = chemistry(stack);
  const has = (a: string, b: string) => c.pairs.some((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a));
  assert.ok(has('ndk', 'svelte')); // connect ↔ app
  assert.ok(has('nip07', 'ndk')); // identity ↔ connect
  assert.ok(has('svelte', 'sqlite')); // app ↔ storage
});

test('order is the present capabilities, sequenced', () => {
  const c = chemistry(stack);
  assert.deepEqual(c.order, ['connect', 'identity', 'app', 'storage']);
});

test('partnersOf reads both directions of a pair', () => {
  const c = chemistry(stack);
  const partners = partnersOf('svelte', c);
  assert.ok(partners.includes('ndk'));
  assert.ok(partners.includes('sqlite'));
});

test('a hand-added tool sharing a category flags a same-category conflict', () => {
  const c = chemistry([...stack, { name: 'react', capId: 'extra', category: 'Frameworks & Libraries' }]);
  assert.ok(c.conflicts.some((x) => x.reason === 'same-category' && (x.a === 'react' || x.b === 'react')));
});

test('no conflicts in a clean one-per-capability stack', () => {
  const c = chemistry([
    { name: 'a', capId: 'connect', category: 'X' },
    { name: 'b', capId: 'app', category: 'Y' },
  ]);
  assert.equal(c.conflicts.length, 0);
});

test('two tools filling the same capability flag a same-capability conflict', () => {
  const c = chemistry([
    { name: 'svelte', capId: 'app', category: 'Frameworks & Libraries' },
    { name: 'vue', capId: 'app', category: 'Other' }, // same capId, different category
  ]);
  assert.ok(c.conflicts.some((x) => x.reason === 'same-capability'
    && ((x.a === 'svelte' && x.b === 'vue') || (x.a === 'vue' && x.b === 'svelte'))));
  // same-capability takes precedence; it is not also double-reported as same-category
  assert.equal(c.conflicts.length, 1);
});

test('"extra" is not a real capability slot: two extras never conflict on capability', () => {
  const c = chemistry([
    { name: 'x', capId: 'extra', category: 'A' },
    { name: 'y', capId: 'extra', category: 'B' }, // different categories ⇒ no conflict at all
  ]);
  assert.equal(c.conflicts.length, 0);
  assert.deepEqual(c.pairs, []); // extras hold no adjacency slot
});

test('order follows CAP_ORDER regardless of input order', () => {
  const c = chemistry([
    { name: 's', capId: 'storage' },
    { name: 'a', capId: 'app' },
    { name: 'c', capId: 'connect' },
  ]);
  assert.deepEqual(c.order, ['connect', 'app', 'storage']); // sequenced, not input order
});

test('partnersOf returns [] for a tool that pairs with nothing', () => {
  const c = chemistry([
    { name: 'lonely', capId: 'payments', category: 'Z' }, // payments has no slotted adjacency here
  ]);
  assert.deepEqual(partnersOf('lonely', c), []);
  assert.deepEqual(partnersOf('not-in-stack', c), []);
});
