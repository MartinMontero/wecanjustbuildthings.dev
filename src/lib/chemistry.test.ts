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
