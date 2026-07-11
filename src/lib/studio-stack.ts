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
 * instead of the unbounded `latest`. We emit an EXACT version (not a `^` range),
 * so a starter installs the same screened version rather than a compatible-but-
 * unscreened newer minor/patch. Entries with no recorded version fall back to
 * `latest`. A leading `v` (some ecosystems tag releases `v1.2.3`) is stripped so
 * the version is a valid npm specifier. NOTE: this pins the DIRECT dependencies;
 * a committed lockfile is still what freezes the full transitive tree.
 */
export function pinnedDependencies(
  jsDeps: { name: string; version?: string | null }[],
): Record<string, string> {
  return Object.fromEntries(
    jsDeps.map((it) => {
      const v = it.version?.trim().replace(/^v/, '');
      return [it.name, v ? v : 'latest']; // exact pin, not a `^` range
    }),
  );
}

/** The license-at-commit facts a catalog entry carries (subset of the Studio's
 *  Item / the session receipt). */
export interface ReceiptFacts {
  license?: string | null;
  commit?: string | null;
  licenseUrl?: string | null;
}

/**
 * Movement 2, "receipts travel" — the license-at-commit receipt rendered for the
 * DOWNLOADED artifacts (README.md, AGENT_PROMPT.txt), so the evidence shown in
 * the blueprint UI travels into the files the builder keeps, not just the screen.
 * Pure + total: an entry with no pinned commit yields an honest "verification
 * pending" note (or nothing), never a fabricated claim.
 *   - 'markdown' (README): links the claim to the recorded license source.
 *   - 'plain' (AGENT_PROMPT): the same facts without markup.
 */
export function receiptLine(r: ReceiptFacts, style: 'markdown' | 'plain'): string {
  const license = r.license?.trim();
  const sha = r.commit?.trim();
  if (!sha) return license ? ` — license ${license} (verification pending)` : '';
  const label = license
    ? `license ${license} verified at ${sha.slice(0, 7)}`
    : `license verified at ${sha.slice(0, 7)}`;
  if (style === 'markdown' && r.licenseUrl) return ` — [${label}](${r.licenseUrl})`;
  return ` — ${label}`;
}
