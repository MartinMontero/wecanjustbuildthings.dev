/**
 * provenance.ts — D8 honesty chips: the shared, pure derivation that decides
 * when a figure must be surfaced as "unverified — awaiting human check"
 * instead of a number.
 *
 * Both data islands (CostEstimator, ModelCompass) carry registry entries whose
 * numbers are `null` until a human confirms them against a primary source
 * (never fabricate to fill the gap). The UI renders those nulls as a
 * provenance chip, localized via each island's string table; this module owns
 * only the yes/no decision so the rule is identical everywhere and unit-tested.
 *
 * Semantics preserved from the pre-D8 UI: a value needs the chip iff it is
 * null/undefined; a quote "needs the chip" iff EVERY line amount is null
 * (an empty list vacuously needs it — same as the old `.every()` behaviour).
 */

/** True when a single figure has no human-confirmed value. */
export function needsProvenanceChip(value: number | string | null | undefined): boolean {
  return value === null || value === undefined;
}

/** True when every figure in the set is unconfirmed (e.g. all line-item
 *  amounts of a quote) — the summary figure then carries the chip too. */
export function allUnconfirmed(values: ReadonlyArray<number | null | undefined>): boolean {
  return values.every((v) => v === null);
}
