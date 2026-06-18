/**
 * Model Compass core types — pure, framework-free, safe to import in the browser
 * island or a Worker. No DOM, no session dependency.
 *
 * This module is an INFORMATIONAL comparison surface, not a model picker: it never
 * calls a model and never proxies a key. It surfaces, for each tool/model, where
 * it runs, who runs it, under whose law, and how self-hostable it is — so a builder
 * can weigh capability against sovereignty.
 *
 * Honesty rule (mirrors registry/providers.ts): every NUMBER — context window,
 * price, benchmark score — is `null` until a human confirms it against `sourceUrl`,
 * and `lastVerified` stays null until then. Never fabricate a plausible value to
 * fill a gap. Categorical facts (developer, jurisdiction, license, tier) carry a
 * primary `sourceUrl`.
 */

/** Where an entry sits in the two-tier hybrid (plus the non-model runtime/harness rows). */
export type Tier = 'frontier' | 'execution' | 'both' | 'runtime' | 'harness';

/** How the thing is consumed — drives the sovereignty story more than the tier does. */
export type ModelKind =
  | 'frontier-hosted-api'
  | 'open-weight-self-hostable'
  | 'local-runtime'
  | 'orchestration'
  | 'confidential-service';

export type CautionLevel = 'none' | 'advisory' | 'warning';

/**
 * Structured (not free-text) so labels are translatable and filterable.
 * `reason`/`mitigation` are null only when `level === 'none'`.
 */
export interface Caution {
  level: CautionLevel;
  /** Country/region under whose law data is processed, or null for self-host/local. */
  jurisdiction: string | null;
  reason: string | null;
  mitigation: string | null;
}

export interface CodingBenchmark {
  name: string; // e.g. "SWE-bench Verified", "Aider polyglot"
  score: number | null; // percentage/points; null ⇒ TODO: confirm
  sourceUrl: string; // primary source the score must be confirmed against
  vendorReported: boolean; // true ⇒ the vendor's own number, not independently measured
}

export interface ModelEntry {
  id: string;
  displayName: string;
  developer: string;
  /** HQ / data-processing jurisdiction (country or region). */
  jurisdiction: string;
  tier: Tier;
  kind: ModelKind;
  /** SPDX id for open weights/code; null for proprietary/closed. */
  licenseSpdx: string | null;
  selfHostable: boolean;
  /** Tokens. null ⇒ TODO: confirm. */
  contextWindow: number | null;
  /** Hosted API price per million tokens, or null when self-hosted-only / unconfirmed. */
  costPerMTok: { input: number | null; output: number | null } | null;
  codingBenchmark: CodingBenchmark | null;
  caution: Caution;
  /** Primary source the entry's categorical facts were read from (verified-real URL). */
  sourceUrl: string;
  /** ISO date the NUMBERS were last human-confirmed. null ⇒ TODO: confirm. */
  lastVerified: string | null;
}
