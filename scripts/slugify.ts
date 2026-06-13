/**
 * Deterministic, collision-detected slug derivation (Part 3 Step 2).
 * The same input row always produces the same slug, so re-running the catalog
 * generator overwrites cleanly — no random suffixes, no UUIDs.
 */
import type { Ecosystem } from '../enforcement/types.ts';

export function baseSlug(name: string, ecosystem: Ecosystem): string {
  let s = name.toLowerCase();

  // npm scoped packages: @scope/name -> scope-name
  if (ecosystem === 'js' && s.startsWith('@') && s.includes('/')) {
    s = s.slice(1).replace('/', '-');
  }
  // Maven coordinates group:artifact -> group-dotted-to-dashes + artifact
  if (ecosystem === 'kotlin' && s.includes(':')) {
    const [group, artifact] = s.split(':');
    s = `${group!.replace(/\./g, '-')}-${artifact}`;
  }
  // Go module paths github.com/owner/repo -> owner-repo (drop host)
  if (ecosystem === 'go' && s.includes('/')) {
    const parts = s.split('/');
    s = parts.slice(1).join('-');
  }

  s = s
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return s || 'entry';
}

/**
 * Resolve a unique slug given a set of already-used slugs. On collision across
 * a different ecosystem, append `-<ecosystem>`; if still colliding, append a
 * numeric counter. Records the chosen slug in `used`.
 */
export function uniqueSlug(name: string, ecosystem: Ecosystem, used: Set<string>): string {
  const base = baseSlug(name, ecosystem);
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  const withEco = `${base}-${ecosystem}`;
  if (!used.has(withEco)) {
    used.add(withEco);
    return withEco;
  }
  let n = 2;
  while (used.has(`${withEco}-${n}`)) n += 1;
  const final = `${withEco}-${n}`;
  used.add(final);
  return final;
}
