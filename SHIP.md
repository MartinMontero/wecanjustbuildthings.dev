# SHIP.md — ship report: MVP → v1

> M8 deliverable, 2026-09-07. The ledger of what shipped, the evidence behind it,
> what is knowingly left open, and how to deploy. Scope = BACKLOG.md SHIP column
> (D1–D13, B1-Option-2, B10, E1–E10) per PLAN.md. Every claim traces to evidence:
> a merge commit, a measured run (tier named), or an explicit UNVERIFIED label.

## Ship ledger

| Milestone | Content | Status | Evidence |
|---|---|---|---|
| M0 — Governance truth (B1-Option-2, E5) | `security_sensitive` schema flag; i18n security gate (2 distinct approvals, trusted-base checkout); CLAUDE.md truth pass | **SHIPPED** | PRs #56–60 (2026-07-11/12); gate live-acceptance tested |
| B13 — guard.py stale-ref false fires | recognizes GitHub's own commits, with test | **SHIPPED** | PR #59 |
| M1 — System layer (D1, D4, D6) | verdict tokens, cascade layers, workbench class, Receipt primitive (Astro + Svelte), Footer override | **SHIPPED** | PR #61 |
| M2a — Checker receipts (P0-2) | PolicyChecker receipt verdict band + full island i18n | **SHIPPED** | PR #62 |
| M2b — Trust receipts (D1 complete) | catalog badges + `/policies/enforcement/` verdict band + Studio policy gate adopt the receipt language | **SHIPPED** | PRs #63, #64 |
| M3 — Catalog explorer density (D3) | 1→2→3-col receipt-card grid, facet groups w/ counts, designed loading/error/zero-result states, locale-aware CTA | **SHIPPED** | PR #67; e2e evidence in M8 loop |
| F-8 — Dependency hygiene (Astro 6 only) | 34→16 advisories (HIGH 19→7, CRITICAL 0); nanoid/js-yaml/postcss/sharp fixed; Astro-7-only remainder accepted-with-evidence in AUDIT.md | **SHIPPED** | PR #66; before/after npm audit pair |
| M4 — Island tokenization + honesty chips (D4, D8, D9) | all `--sl-*`/hex retired from 5 islands; provenance chip replaces `TODO: confirm`; STR tables en/es/ar with compile-enforced parity | **SHIPPED** | PR #68; suite 373+19 green w/ failure-proofs |
| M5 — Landing + register (D5, D7, B10) | WorkOrderGrid replaces 18 stock CardGrid/LinkCard usages; register pass on 5 surfaces ×3 locales; NIP-07 line (nos2x/Alby) | **SHIPPED** | PR #69; visual evidence 3 widths × light/dark |
| M6 — Console tokens, Arabic face, hydration, ceilings (D10–D13) | console tokenized (18 hex → 0); Readex Pro Arabic subset 32.6 KB ≤ 45 KB budget (G6 checkpoint filled); `client:visible` on data islands; VERIFICATION.md created | **SHIPPED** | PR #70; sha256-pinned font assembly |
| M7 — Doc-drift closeout (E1–E8) | ROADMAP current, admin-spec phase ledger, README/CLAUDE.md Workers topology, catalog counts unified, runbook model list, mobile-doc headers | **SHIPPED** | PR #65 |
| M8 — Verification loop + ship report | two consecutive clean-state `verify:all` exit 0; e2e + axe green; Lighthouse budgets green after the `/pie/cooking/` perf fix (content-visibility) | **THIS PR** | VERIFICATION.md (measured, tier-named) |

## What v1 is (delta from MVP)

- A designed system, not a stock theme: token layer (dark/light), Build Plate
  hero, WorkOrderGrid landing, Receipt primitive across ≥4 trust surfaces,
  verdict washes, mono work-order/badging language, self-hosted faces
  (Bricolage Grotesque + Readex Pro Arabic subset), RTL-correct Arabic.
- A guided build flow end-to-end: intent → blueprint → handoff (ZIP / GitHub /
  Goose deeplink) with deterministic Mentor Engine, skills capture, and
  in-browser policy re-verification pausing handoff on any exclusion hit.
- Trust infrastructure: 3-layer enforcement in CI and in-browser, receipts at
  commits, provenance chips instead of silent nulls, i18n security gate,
  supply-chain stack (OSV/Grype/SBOM/VEX/zizmor), dependency hygiene ledgered.
- Console + auth: Nostr (NIP-07/NIP-46) and Bluesky sign-in, admin console
  with roster management (superadmin), token-compliant standalone page.
- Locales: en/es/ar for the product surface (catalog corpus translation =
  owner item B8).

## Before / after (screens)

36 captures in the session evidence ledger (1280/768/390, light + dark,
reduced-motion on/off): landing WorkOrderGrid vs stock CardGrid; explorer
receipt-grid vs single-column card wall; compass token cards + honesty chips
vs hex ramp + `TODO: confirm`; console token compliance vs raw hex.

## Known limitations (honest, labeled)

- **All M8 measurements are local-sandbox tier** (Node 22.12.0, astro preview,
  headless Chromium, single runs) — indicative, not gate-grade. CI's `lhci`
  (3 runs) and the production deploy checks are the authoritative tier.
- `/pie/cooking/` carries 380 KB of HTML by design (full protocol clusters);
  render cost is mitigated (content-visibility), not removed. If it crosses a
  CI budget, paginate or collapse the protocol sections.
- es/ar copy beyond the landing/tools layer is a careful first pass; catalog
  corpus is English-only (B8); native review is tracked in BACKLOG (B9).
- es-locale `emptyAction` and the Arabic sign-in strings came from
  non-native review — acceptable per repo convention, flagged.
- Model Compass numbers are intentionally honesty-chipped (null until a human
  verifies against the linked source); 7 of 8 models currently carry the chip.
- gate.ps1/RECIPE.md (kickoff Step 1.5) do not exist yet — the local-clone
  session that creates them hasn't run.

## Residual risks

- **Astro-7-only advisories** (3) + esbuild LOW + @lhci/cli chain remain,
  accepted-with-evidence in AUDIT.md (G5 blocks Astro 7). Owner re-ruling
  question stands recorded.
- The sharp override sits beyond astro's declared range (F-8) — build-verified
  on Node ≥22, carried as a note for the next astro bump.
- a11y-check.mjs does not cover `/build/models/` today; the 89-node contrast
  finding's code causes are fixed (M4), and the targeted re-measure is queued
  for the CI axe run (route list needs a one-line addition).
- Browser-tier claims (axe-zero, LCP, visual) rest on sandbox Chromium; any
  environment-specific rendering issue would surface there first, not here.

## OWNER items — listed, not shipped (owner-court)

- **B2 — CSP ENFORCE flip:** mechanism shipped (report-only + report sink);
  the flip itself is an owner decision.
- **B3 — Sveltia CMS OAuth (GitHub backend):** admin CMS path exists; OAuth
  backend provisioning is owner's.
- **B4 — branch protection flip:** the i18n gate is Required already
  (M0-R1); any further protection changes are owner's.
- **B8 — catalog corpus translation (es/ar, ~2,186 entries):** pipeline
  built; the run needs owner keys + wave sign-off.
- **B9 — native-speaker review of ~25 machine-translated pages.**
- **B11/B12 — Goose live agent loop; server-side recipe signing:** DEFER.

## Deploy steps

1. Owner merges this PR (never a direct push to main). Workers Builds
   auto-deploys production on merge to main only — no manual deploy step, no
   `wrangler deploy` in CI.
2. Post-merge smoke (owner or next agent): `/api/health` + `/api/license` 200;
   `/`, `/catalog/`, `/ar/` (Arabic face), `/console/` render; one
   add-to-build flow end-to-end.
3. Watch the Cloudflare Workers Builds bot report on the merge commit; a
   "Deployment successful" comment on the *production* URL is the real signal
   (branch-build comments are cosmetic previews per the item-0 finding).
4. If a rollback is needed: revert the merge commit; Workers Builds redeploys
   the previous main state on the next merge.
