# BACKLOG.md — consolidated ledger (2026-07-11) — FOR GATE APPROVAL

Sources: GitHub (0 open issues, 0 open PRs — verified via API; repo at merged
PR #55), repo grep (TODO/FIXME/HACK/XXX), docs-vs-reality diff (README,
ROADMAP, CLAUDE.md, runbook, specs), CI inventory (10 workflows, none
disabled), the Phase-1 design audit (`audit/AUDIT.md`), and the stack-currency
check. Nothing found was dropped. **Scope key** — the column the gate decides:

- **SHIP** — proposed in-scope for this effort (buildable from the repo alone)
- **OWNER** — needs the owner's data, account access, or sign-off (not code)
- **DEFER** — documented-deliberate future work; stays deferred

## A. Design elevation (from DESIGN.md — all SHIP)

| ID | Item | Source/evidence | Status | Pri | Acceptance criteria |
|---|---|---|---|---|---|
| D1 | Receipt/verdict component system (the signature): shared visual language for checker verdicts, catalog verification badges, Studio policy gate, enforcement page | DESIGN §1; audit P1-4 | absent | P1 | One shared component/token set renders clean/blocked/chain verdicts; used by ≥4 surfaces; axe clean |
| D2 | Checker verdict redesign + island i18n (fixes P0-2/P0-3) | `PolicyChecker.svelte` | broken i18n | **P0** | Island honors `lang` (house STR pattern, es/ar shipped); verdict = receipt band; CLI jargon behind a disclosure; localized empty/error states |
| D3 | Catalog explorer density redesign: responsive 1→2→3-col receipt cards, designed facets w/ counts, `accent-color`, designed zero-result/empty/error states at full 1,359-entry dataset; locale-aware CTA (`:358`) | audit P1-3, P1-8 | default-ish | P1 | Desktop page no longer a 20k-px column; facets on-token; all states designed; CTA locale-aware |
| D4 | Token-only island rule: retire `--sl-*`/raw-hex/off-scale rems from BuildStudio, CostEstimator, ModelCompass, CatalogExplorer; add `--shadow-1`, verdict washes, global `accent-color` | audit P1-5 | split dialects | P1 | grep: zero `--sl-color` refs in island styles; zero raw hex; `/build/models/` axe color-contrast = 0 (closes the 89-node finding) |
| D5 | Landing: replace stock CardGrid/LinkCard sections with bespoke WorkOrderGrid; copy-register pass | `index.mdx:37-99`; audit P1-1, P1-7 | stock | P1 | No Starlight Card/LinkCard on the landing; copy passes the register rules (§4) |
| D6 | Footer override (last stock chrome) | audit P1-2 | stock | P1 | Designed, token-native, locale-aware footer on all pages |
| D7 | Copy-register pass on /build /check /build/models /start intros + island empty/error states (en/es/ar together) | audit P1-7 | jargon | P1 | Register rules met; es/ar land in the same commit as en |
| D8 | `TODO: confirm` → designed provenance chip ("unverified — awaiting human check"), same semantics | audit P1-6 | placeholder register | P1 | No user-visible "TODO"; zero-fabrication semantics preserved; localized |
| D9 | BuildStudio stray strings → STR table; AccountWidget ar placeholder; data-layer prose i18n keys (compass cautions, estimator labels) | audit P1-8 | strays | P1 | grep finds no hardcoded user-facing English in islands with i18n tables |
| D10 | `/console/` joins the token layer (raw hex → tokens, `.btn`/`.field`); stays standalone-CSP, stays English (documented operator exception) | audit P1-10 | off-system | P1 | Zero raw hex in console surfaces; CSP wss: rule unchanged (invariance test stays green) |
| D11 | Arabic display face: self-hosted subset OFL face (Readex Pro candidate) wired via `:lang(ar)` | audit P1-11; DESIGN §2/§7 | absent | P1 | ≤45 KB woff2, OFL license committed, `/ar/` headings render the face; perf budgets hold |
| D12 | Hydration pass: `client:visible` for below-fold islands; ModelCompass considered for static render + filter-only island | audit P1-9 | all-eager | P1 | No LCP regression on /catalog/; JS transferred on /build/models/ drops; e2e stays green |
| D13 | Page-weight ceilings recorded + measured (reading ≤250 KB, tool ≤450 KB, landing ≤350 KB) | DESIGN §8 | new | P2 | Measured per page type in VERIFICATION.md; over-ceiling pages fixed |

## B. Functional backlog

| ID | Item | Source | Status | Pri | Scope | Acceptance criteria |
|---|---|---|---|---|---|---|
| B1 | i18n freshness/governance layer: CLAUDE.md documents it (incl. a 2-review `security_sensitive` gate) but **none of it exists**; one flagged page unprotected; schema lacks the field | CLAUDE.md i18n section vs repo | absent | **P0** | **GATE DECISION** | Option 1: build it (freshness+stamp scripts, additive security-gate workflow, banner, TRANSLATING.md, CODEOWNERS, schema field). Option 2: amend CLAUDE.md to planned-not-built + add the schema field & a minimal 2-review gate for the one flagged page. Recommendation: **Option 2 now (SHIP), full layer as its own later effort** — it is a governance feature, not a design one |
| B2 | CSP Report-Only → Enforce (mechanism complete; flip is env var + log review) | ROADMAP:74; `security-headers.ts` | partial | P1 | OWNER | `[csp-report]` logs reviewed; `CSP_MODE=enforce` set; auth+console+admin verified |
| B3 | Sveltia `/admin` GitHub OAuth backend verified (editors can log in) | runbook Part A | unverifiable from repo | P1 | OWNER | An editor completes `/admin/` login end-to-end |
| B4 | Branch protection: mark `verify`,`quality`,`security-pr`,`path-a`,`e2e`,`skills` required | runbook; ROADMAP:77 | unverifiable from repo | P1 | OWNER | Required-checks list includes all six |
| B5 | Enable GitHub Dependency Graph (dependency-review currently no-ops) | `security-pr.yml:38-42` | setting off | P2 | OWNER | Review job produces results on a test PR |
| B6 | Admin phases 4–8 (portability, content-mgmt UI, moderation+NCMEC w/ legal review, analytics, CI extension) | admin-panel-spec | phases 0–3 done | P1 | DEFER (own track — active, sliced, separately gated) | Per-phase per spec |
| B7 | Staging follow-ups: publish→PR path, enforcement wiring for drafts, expiry job, unabandon decision | LOOP.md findings | deferred | P2 | DEFER (with B6) | Publish slice opens a real PR from a `ready` draft, enforcement green |
| B8 | Catalog prose translation run es+ar (pipeline built; 1 of 1,360 files translated per locale) | TRANSLATIONS.md; runbook §B5 | pipeline ready | P2 | OWNER (needs `ANTHROPIC_API_KEY` + wave sign-off) | Waves run; PRs native-reviewed; `machine_translated: true` |
| B9 | Native-speaker review of ~25 machine-translated narrative pages | TRANSLATIONS.md | open | P2 | OWNER | List emptied |
| B10 | NIP-07 one-liner in public docs (name nos2x/Alby near sign-in) | runbook Part A | open | P2 | SHIP | Line present, localized |
| B11 | Goose live agent loop (`goose serve`/ACP) | runbook §B3; PLAN §5 | deferred | P2 | DEFER | — |
| B12 | Server-side recipe signing / shareable links | runbook §B4; PLAN §5 | deferred | P2 | DEFER | — |

## C. Content/data decisions (owner's data, not engineering)

| ID | Item | Evidence | Pri | Scope | Acceptance criteria |
|---|---|---|---|---|---|
| C1 | Cost Estimator: 12× `unitPrice: null` + 3× `lastVerified: null` (Cloudflare/VEXXHOST/Denvr) — confirm from primary sources **or hide the module** | `providers.ts:62-97`; worksheet | P1 | OWNER | Prices transcribed + stamped, tests green — or module hidden |
| C2 | Cost Estimator tier bands / scale multipliers / `requestsPerMauPerMonth` product decisions | `tiers.ts:26-30`; `_interface.ts:10-30` | P1 | OWNER | Sign-off recorded, values updated |
| C3 | Model Compass: 7 models `score: null` + maple-ai pricing (runbook says 3 — undercount) | `models.ts:37-235` | P1 | OWNER | Filled from cited sources or annotated "vendor does not publish" |
| C4 | Alfred's PWA scope/repo decision | ROADMAP:69-70 | P2 | OWNER | Decision recorded |
| C5 | Dependabot remainder (5 dev-only) + the **Astro 7 coupled upgrade** (astro 7.0.7 + starlight 0.41.3 + @astrojs/svelte 9; breaking list verified, none of the removed APIs used here; fixes the low esbuild dev advisory) | stack report | P2 | **GATE DECISION** — recommend: not in this effort (identity work shouldn't ride a major framework jump); schedule as its own slice after | If taken later: coupled upgrade in one slice, verify:all + screens diff green |

## D. Doc-drift cleanups (all SHIP, one commit each)

| ID | Item | Pri |
|---|---|---|
| E1 | ROADMAP refreshed through PR #55 (Done/Decisions/date) | P2 |
| E2 | admin-panel-spec header → per-phase status ledger (0–3 built, 4–8 open) | P2 |
| E3 | PLAN.md footer → executed-status note (slices A–E shipped, broker retired) | P2 |
| E4 | README deploy section → Workers Builds topology (currently describes Pages dashboard) | P2 |
| E5 | CLAUDE.md `TRANSLATING.md` reference fixed (or file created per B1 decision) | P2 |
| E6 | One authoritative catalog count (generated figure) used everywhere (1,355 vs ~2,182 vs 1,360 on disk) | P2 |
| E7 | Runbook §B2 corrected to 7 models + maple-ai | P2 |
| E8 | MOBILE_FIXES/mobile-audit headers note "merged"; only the contrast item remains (closed by D4) | P2 |
| E9 | CLAUDE.md constraint 4: one line naming the protected workflow set {verify, security-pr, quality} (doc-only; mapping currently lives only in guard.py) | P2 |
| E10 | `LOOP.md` + `audit/` working artifacts: propose committing `audit/` (screens are the before-record) and deleting `LOOP.md` after harvesting B7 (items already captured here) | P2 |

## D2. External backlogs, named — NOT consolidated (no silent third backlog)

Two owner-side backlogs are referenced in session context but have **zero
matches anywhere in this repository** (grep verified 2026-07-11):
**QA-REMEDIATE-v1** (remediation backlog) and **PANEL-RESPEC-v2** (admin-panel
re-spec). They live outside the repo (owner's project workspace) and therefore
are NOT consolidated into this document. Status: **explicitly out-of-scope
until the owner supplies their contents**, at which point they merge here as
their own section with the same columns. D10 (console) is already fenced to
token-compliance-only so nothing in this effort preempts PANEL-RESPEC-v2.

## E. Gate questions (the decisions this document exists to get)

- **G1** — Approve scope column as marked? (SHIP = D1–D13, B1-Option-2, B10, E1–E10.)
- **G2** — B1: Option 1 (build the full i18n governance layer now) or Option 2
  (truthful CLAUDE.md + schema field + minimal gate now; full layer later)?
- **G3** — Ship-prompt DoD correction: full-tree enforcement "passes" is
  unsatisfiable (engine's own fixtures); accept "zero hits outside
  enforcement's own definitions/fixtures" as the criterion?
- **G4** — Name collisions: root `AUDIT.md`/`PLAN.md` are completed Goose-pivot
  records. Proposal: move to `docs/archive/`, promote `audit/AUDIT.md` and the
  Phase-3 PLAN.md to root. Approve the move (Rule 9: file moves listed here)?
- **G5** — C5: confirm Astro 7 upgrade is OUT of this effort.
- **G6** — DESIGN.md direction approved? (Extend civic-workshop; receipt as
  signature; §10 self-critique includes the palette-honesty call.)
