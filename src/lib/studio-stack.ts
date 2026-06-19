/**
 * studio-stack.ts — eligibility + reproducibility rules for Build Studio's
 * GENERATED stacks (issues #3 and #4).
 *
 * The catalog displays far more than the Studio should ever recommend: datasets,
 * `under_review` entries, `blocked` entries, and permissively-licensed-but-
 * flagged (`origin_advisory`) entries. Showing them in the catalog is fine;
 * silently folding them into a starter the Studio calls "verified, policy-clean"
 * is not. These pure helpers encode the rule once so the blueprint, the add-tool
 * search, and the Catalog "Build with this" seed all agree — and so it is testable.
 */

export interface StackCandidate {
  kind?: string;
  verification?: string;
  advisory?: string | null;
}

/**
 * #4 — eligibility for a generated stack. Every catalog entry has already passed
 * the automated Meta/OpenAI/xAI screening (it could not publish otherwise), so it
 * is genuinely policy-clean; `verified` is the *additional* human-review bar.
 * Generated stacks therefore admit both `verified` and `under_review` entries —
 * the Studio labels which is which (★) rather than silently presenting all as
 * fully vetted — but never `blocked` (failed) entries or datasets.
 */
export function eligibleForStack(it: StackCandidate): boolean {
  return it.kind !== 'dataset' && it.verification !== 'blocked';
}

/**
 * Whether an eligible tool may be the DEFAULT auto-pick. Advisory entries
 * (Meta/OpenAI/xAI-origin, permissively licensed) are eligible and selectable as
 * an explicit, warning-labelled alternative, but must never be auto-selected — so
 * e.g. `react` is never the default app framework over Svelte.
 */
export function autoPickable(it: StackCandidate): boolean {
  return !it.advisory;
}

/** Sort key: 0 for clean entries, 1 for advisory ones — orders advisory tools
 *  last among a capability's options. */
export function advisoryRank(it: StackCandidate): number {
  return it.advisory ? 1 : 0;
}

/**
 * #3 — pin a generated package.json's dependencies to the concrete, license-
 * verified version recorded for each catalog entry (frontmatter `version`),
 * instead of the unbounded `latest`, so a starter installs the same tree that was
 * screened. Entries with no recorded version fall back to `latest`. A leading `v`
 * (some ecosystems tag releases `v1.2.3`) is stripped so the npm range is valid.
 */
export function pinnedDependencies(
  jsDeps: { name: string; version?: string | null }[],
): Record<string, string> {
  return Object.fromEntries(
    jsDeps.map((it) => {
      const v = it.version?.trim().replace(/^v/, '');
      return [it.name, v ? `^${v}` : 'latest'];
    }),
  );
}
