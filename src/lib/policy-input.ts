/**
 * policy-input.ts — parse the PolicyChecker textarea into dependencies to screen.
 *
 * Pure + framework-free so the parsing is unit-testable apart from the island. The
 * actual policy decision is made by enforcement/matcher.ts (matchDependency); this
 * only turns pasted text into { name, ecosystem } records.
 */
import type { Ecosystem } from '../../enforcement/types.ts';

export interface ParsedDep {
  name: string;
  ecosystem: Ecosystem;
}

const PACKAGE_JSON_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

/**
 * Accepts either a pasted package.json — every name across its dependency blocks,
 * all treated as the 'js' ecosystem — or a plain list, one dependency per line as
 * "name" or "name <ecosystem>". Lines starting with '#' are ignored, surrounding
 * quotes/commas are stripped (so pasted JSON lines work), and empty names are dropped.
 */
export function parseDependencyInput(raw: string, defaultEcosystem: Ecosystem): ParsedDep[] {
  const text = raw.trim();
  if (!text) return [];

  // package.json first: only when it parses AND yields at least one dependency.
  if (text.startsWith('{')) {
    try {
      const json = JSON.parse(text) as Record<string, unknown>;
      const out: ParsedDep[] = [];
      for (const field of PACKAGE_JSON_FIELDS) {
        const block = json[field];
        if (block && typeof block === 'object') {
          for (const name of Object.keys(block as Record<string, unknown>)) out.push({ name, ecosystem: 'js' });
        }
      }
      if (out.length) return out;
    } catch {
      /* not valid JSON — fall through to line parsing */
    }
  }

  // Otherwise: one dependency per line.
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const [name, eco] = l.split(/\s+/);
      return { name: (name ?? '').replace(/[",]/g, ''), ecosystem: (eco as Ecosystem) || defaultEcosystem };
    })
    .filter((d) => d.name.length > 0);
}
