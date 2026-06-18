/**
 * Sovereignty-first ordering. Self-hostable options with the lowest caution rank
 * float to the top; US/China hosted APIs (caution: warning, not self-hostable)
 * sink to the bottom. Pure and framework-free so the UI and tests share it.
 */
import type { ModelEntry } from './types.ts';

const CAUTION_RANK: Record<ModelEntry['caution']['level'], number> = { none: 0, advisory: 1, warning: 2 };

/** Lower is more values-aligned. */
export function sovereigntyRank(m: ModelEntry): number {
  return (m.selfHostable ? 0 : 10) + CAUTION_RANK[m.caution.level];
}

export function sortBySovereignty(models: readonly ModelEntry[]): ModelEntry[] {
  return [...models].sort(
    (a, b) => sovereigntyRank(a) - sovereigntyRank(b) || a.displayName.localeCompare(b.displayName),
  );
}
