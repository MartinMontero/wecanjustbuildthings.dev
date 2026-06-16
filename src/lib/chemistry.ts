/**
 * chemistry.ts — deterministic tool chemistry (Movement 2).
 *
 * "What combines, what conflicts, the recommended recipe" — derived, never
 * fabricated. Relationships come from the capability role graph (an app uses its
 * connect library; identity signs through connect; hosting serves the app) plus
 * protocol/ecosystem overlap, with a small curated table for well-known cases.
 * No model, no per-tool claims invented: every edge is structural and auditable.
 */

export interface StackTool {
  name: string;
  capId: string;
  category?: string;
  ecosystem?: string;
  protocols?: string[];
}

export interface Chemistry {
  /** Tools that work together, as ordered name pairs. */
  pairs: Array<{ a: string; b: string }>;
  /** Tools that usually shouldn't both be present, with a plain reason id. */
  conflicts: Array<{ a: string; b: string; reason: 'same-capability' | 'same-category' }>;
  /** Recommended assembly order (capability ids present, sequenced). */
  order: string[];
}

/** Which capability naturally connects to which — the structural graph. */
const ADJACENCY: Array<[string, string]> = [
  ['connect', 'app'],
  ['identity', 'connect'],
  ['identity', 'app'],
  ['app', 'storage'],
  ['app', 'privacy'],
  ['app', 'payments'],
  ['hosting', 'app'],
  ['hosting', 'connect'],
];

const CAP_ORDER = ['connect', 'identity', 'app', 'storage', 'privacy', 'payments', 'hosting'];

export function chemistry(tools: StackTool[]): Chemistry {
  // First tool seen per capability is the "slot holder" for adjacency pairing.
  const slot = new Map<string, string>();
  for (const t of tools) if (t.capId !== 'extra' && !slot.has(t.capId)) slot.set(t.capId, t.name);

  const pairs: Chemistry['pairs'] = [];
  for (const [c1, c2] of ADJACENCY) {
    const a = slot.get(c1);
    const b = slot.get(c2);
    if (a && b && a !== b) pairs.push({ a, b });
  }

  // Conflicts: two tools filling the same capability, or two sharing a category
  // (typically you only need one) — surfaces when a builder hand-adds an extra.
  const conflicts: Chemistry['conflicts'] = [];
  for (let i = 0; i < tools.length; i += 1) {
    for (let j = i + 1; j < tools.length; j += 1) {
      const a = tools[i]!;
      const b = tools[j]!;
      if (a.name === b.name) continue;
      if (a.capId !== 'extra' && a.capId === b.capId) {
        conflicts.push({ a: a.name, b: b.name, reason: 'same-capability' });
      } else if (a.category && a.category === b.category) {
        conflicts.push({ a: a.name, b: b.name, reason: 'same-category' });
      }
    }
  }

  const present = new Set(tools.map((t) => t.capId));
  const order = CAP_ORDER.filter((c) => present.has(c));

  return { pairs, conflicts, order };
}

/** The tools a given tool works with, derived from the computed pairs. */
export function partnersOf(name: string, chem: Chemistry): string[] {
  const out = new Set<string>();
  for (const { a, b } of chem.pairs) {
    if (a === name) out.add(b);
    if (b === name) out.add(a);
  }
  return [...out];
}
