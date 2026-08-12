# AUDIT.md — SHIP Phase-1 findings (2026-07-11)

Read-only research pass for the backlog-ship + design-elevation effort.
Placed at `audit/AUDIT.md` because root `AUDIT.md` is the (historical,
completed) Goose-pivot audit — promotion/renaming is a gate decision.
Companion docs: `BACKLOG.md` (consolidated ledger), `DESIGN.md` (direction),
`audit/screens/` (39 screenshots, 13 flows × 3 widths).

## Baselines (executed this session)

- `npm run verify:all` — **green**: astro check 0 errors/0 warnings, both
  typechecks clean, **352/352 tests**, enforce + enforce:skills green,
  production build 6,653 pages.
- `npx tsx enforcement/cli.ts all --tree .` — exits 1, but **every hit is
  self-referential**: the engine's own signal-definition YAMLs and its
  negative-test fixtures. **Zero hits in `src/`, `worker/`, `scripts/`,
  `public/`.** Refinement (SHIP-GATE-R1 2c): CI **already dogfoods Layers 1–2
  full-tree** (`verify.yml:42-43`, green); only Layer 3 full-tree is
  unsatisfiable by construction. Exact exempt paths, enumerated:
  `enforcement/excluded-organizations.yaml`,
  `enforcement/excluded-provider-signals.yaml`,
  `enforcement/tests/**`.
  DoD-prose fix suffices — no engine change needed — gate item G3.
- `npm audit --omit=dev` — 4 low (esbuild via astro; Windows-dev-server-only,
  prod unaffected). Full audit: 14 (7 low/6 moderate/1 high) — the high is
  `tmp` via `@lhci/cli`, CI-tooling only.
- Enforcement full-tree + verify baselines contradict nothing in CI (10
  workflows, none disabled; the only two `continue-on-error` are
  documented-deliberate: `security-pr.yml:42`, `security-cron.yml:58`).

## P0 — security / broken / binding-doc conflicts

| # | Finding | Evidence |
|---|---|---|
| P0-1 | **CLAUDE.md documents an i18n freshness/security-gate layer that does not exist** — incl. a 2-review gate for `security_sensitive` pages. One page carries the flag today (`guides/encrypted-group-messaging-marmot.mdx:10`) and gets **no extra protection**; the schema doesn't even define the field. CLAUDE.md is binding session instructions, so this is the highest-risk doc/reality conflict. | No `scripts/i18n-freshness.mjs`, `scripts/i18n-security-gate.mjs`, `i18n:stamp` script, `TranslationStatus.astro`, `src/config/i18n.mjs`, `TRANSLATING.md`, `.github/CODEOWNERS`, or i18n workflows (verified absent) |
| P0-2 | **PolicyChecker island ignores its `lang` prop** — the verdict surface (the product's thesis) renders English-only inside `/es/check/` and `/ar/check/`. | `src/components/PolicyChecker.svelte` (no `$props()`); pages pass `lang="es|ar"` (`es/check.mdx:18`, `ar/check.mdx:17`); hardcoded strings `:83-127` |

(P0-3 in the first revision — CLI jargon in the checker verdict — is
**reclassified to P1-15** per the prompt's severity ladder: P0 is
security/broken/policy; copy register is UX. Reclassification requested and
ruled at SHIP-GATE-R1 2b.)

## P1 — correctness / UX / design debt

Kill-list hits (each with file:line; full table in the design-audit record):

| # | Finding | Evidence |
|---|---|---|
| P1-1 | Landing feature sections are stock Starlight `CardGrid`/`Card icon=…` + 3 `LinkCard` grids | `src/content/docs/index.mdx:37-99` |
| P1-2 | Footer chrome is untouched Starlight default (only un-overridden chrome left) | `astro.config.mjs:146-153` |
| P1-3 | Catalog explorer: 1,359 entries as a single-column card wall, 60/page (desktop page renders 20,562px tall); native checkboxes in a scroll box; no `accent-color` anywhere in src | `CatalogExplorer.svelte:513,505-510,298`; screenshot `catalog-explorer-desktop.png` |
| P1-4 | Checker verdict = text line + default-styled table | `PolicyChecker.svelte:101-123` |
| P1-5 | Island style dialects split: token-native vs raw `--sl-*`/hex/off-scale rems. Worst: ModelCompass hex ramp (`#d33 #e80 …`), CostEstimator all-`--sl-*`, BuildStudio mixes both in one stylesheet, lone raw box-shadow | `ModelCompass.svelte:144-152`; `CostEstimator.svelte:240-276`; `BuildStudio.svelte:1355` vs `:1360-1364`; `CatalogExplorer.svelte:536` |
| P1-6 | `TODO: confirm` is user-visible product copy (zero-fabrication semantics, placeholder register) | `model-compass/ui/i18n.ts:73`; rendered `CostEstimator.svelte:220`, `ModelCompass.svelte:48,53,62`; advertised `build/cost.mdx:13`, `build/models.mdx:13` |
| P1-7 | Dev-jargon first-contact copy on organizer surfaces (landing, /build, /check, /build/models, /start) | `index.mdx:87,89`; `build.mdx:13-16`; `check.mdx:12-14`; `models.mdx:10-12`; `start/index.mdx:11-13` |
| P1-8 | i18n strays: BuildStudio hardcoded English beside its own STR table (`:1074,1027,1036,1084,1265,1272,1314-1322`); catalog CTA hardlinks English `/build/` from es/ar (`CatalogExplorer.svelte:358` — locale-aware `buildBase` exists at `:287` unused); AccountWidget ar placeholder (`:79`); English data-layer prose rendered in localized UIs (compass `models.ts:57`, estimator `providers.ts:64-68`, `CatalogList.astro:55-62`) | as cited |
| P1-9 | All 16 island mounts `client:load`; zero `client:visible/idle`. ModelCompass ships its whole registry as eager JS with no no-JS render | grep `client:`; `build/models.mdx:16` |
| P1-10 | `/console/` styled with raw hex outside the token system (own dark-mode media query) | `AdminConsole.svelte:470-523`; `console/index.astro:33-44` |
| P1-11 | Arabic gets no display face (identity absent for RTL readers) | `tokens.css:12-13` |
| P1-12 | CSP still Report-Only (mechanism complete; operator flip pending) | `astro.config.mjs:63`; `security-headers.ts:112-180` |
| P1-13 | Cost Estimator: 12× `unitPrice: null` + 3× `lastVerified: null`; tier bands/scale placeholders. Model Compass: 7 models `score: null` (runbook undercounts as 3) | `providers.ts:62-97`; `tiers.ts:26-30`; `models.ts:37-182` |
| P1-14 | Admin panel phases 4–8 unbuilt (per spec + wrangler binding comments); staging follow-ups (publish→PR, enforcement wiring, expiry job) logged | `docs/admin-panel-spec.md:73-136`; `wrangler.jsonc:48-62` |
| P1-15 | CLI jargon inside the checker verdict aimed at non-developers: "run `npx tsx enforcement/cli.ts all --tree .` on a real project." (reclassified from P0 at SHIP-GATE-R1 2b) | `PolicyChecker.svelte:126-127` |

## P2 — polish / docs / deferred

- Doc drift set: ROADMAP Done stops at #35 (repo at #55); admin-spec header
  says "not yet built"; PLAN.md footer says "no feature code written"; README
  describes Pages-dashboard deploy vs actual Workers Builds topology
  (`README.md:127-148`); `TRANSLATING.md` referenced but file is
  `TRANSLATIONS.md`; catalog-count disagreement (CLAUDE.md 1,355 / TRANSLATIONS
  ~2,182 / disk 1,360); runbook §B2 undercount; MOBILE_FIXES header cites a
  merged branch; `operational_advisory` name→workflow mapping lives only in
  guard.py.
- `/build/models/` color-contrast: 89 axe nodes (en/es) from opacity + hex
  fallbacks (a11y score still ≥ budget) — folds into P1-5's tokenization.
- Catalog prose translation run (pipeline built, needs `ANTHROPIC_API_KEY` +
  waves); native-speaker review of ~25 machine-translated pages.
- Dependabot remainder (5 dev-only alerts); the **Astro 7 coupled upgrade**
  (astro 7.0.7 + starlight 0.41.3 + @astrojs/svelte 9 — 0.40 is the newest
  Starlight compatible with Astro 6; breaking-change list verified, none of
  the removed APIs used in-repo) — a decision, not an obligation.
- NIP-07 one-line note in public docs; Plausible remains the only sanctioned
  (opt-in, off-by-default) third-party origin.
- Stack otherwise current: wrangler `ratelimits` GA (not beta),
  `run_worker_first` current, no deprecated Astro/nostr-tools API usage found.

## What is NOT broken (verified, for the record)

Intentional identity system exists and is substantial (tokens/theme/components
+ 5 overrides + Build Plate + self-hosted subset fonts). No purple gradients,
no glassmorphism, no lorem, no stock illustration, no font CDNs. Path A holds
(broker retired; CI-gated). Mobile fixes 1–8 merged. `/api/health`,
`/api/license`, auth, admin auth+staging all live and tested (352 tests).

---

## Resumption addendum (2026-08-12)

Baseline at HEAD (95e5be9) — all gates green, re-run this pass (Node 22.12.0,
`npm ci` from the lockfile):
- `astro check` 0 errors/0 warnings (67 files) · `typecheck:tools` ✓ ·
  `typecheck:worker` ✓ · **366/366 tests** (352 at the Phase-1 baseline +14:
  M0 gate, B13, policy-input, bunker suites) · `enforce` ✓ · `enforce:skills` ✓ ·
  build **6,653 pages** in ~75 s.
- e2e (`scripts/e2e-check.mjs`, real hydrated islands, headless Chromium):
  **all island behaviors pass**.
- a11y (`scripts/a11y-check.mjs`, axe-core): **no serious/critical** across the
  22 canonical pages.

### Ledger vs HEAD
- **P0-1 FIXED** (M0, PRs #58–60): `security_sensitive` is real validated data
  (`src/schema/catalog.ts`), the 2-review gate exists
  (`.github/workflows/i18n-security-gate.yml` + `scripts/i18n-security-gate.mjs`),
  CLAUDE.md's i18n section is truthful; live-acceptance PR #60.
- **P0-2 STANDING** (re-verified: `PolicyChecker.svelte` declared no
  `$props`/`lang`; `es/check.mdx:18` + `ar/check.mdx:17` pass `lang`) — fix in
  flight: PR #62.
- **P1-1…P1-15 STANDING** (spot-verified: `index.mdx:22,37-99` stock
  CardGrid/LinkCard; no Footer override registered; `CatalogExplorer.svelte`
  single-column + raw `box-shadow` :536; `TODO: confirm` user-visible
  (`cost-estimator/ui/i18n.ts:84`, model-compass); all island mounts
  `client:load`; `/console/` raw hex; no Arabic display face; CSP emitted
  report-only per the build log). Fixes ship in milestone order M1–M6.
- P2 set unchanged.

### New findings this pass
- **N-1 (P1, security hygiene): 34 osv advisories at HEAD, 0 CRITICAL** — the
  blocking gate (`scripts/osv-critical-gate.sh`) stays green. All transitive:
  `astro@6.4.6` (3 advisories; fixes only in 7.x — **G5 blocks; owner
  re-ruling question**), `nanoid@3.3.12` (8.2 HIGH → 3.3.16+), `js-yaml@4.2.0`
  (7.5 → 4.3.x), `postcss@8.5.15` (6.3), `esbuild@0.27.7` (2.5); the rest
  dev-only (brace-expansion, ip-address, fast-uri, undici, uuid, yaml,
  body-parser, js-yaml@3.15.0). None reach the static runtime. Several fixable
  inside Astro 6 via lockfile refresh/overrides — recommend a dedicated
  dependency-hygiene slice (owner-aware).
- **N-2 (P2): gitleaks false positives.** `gitleaks dir` 4 / `gitleaks git` 2
  hits, all benign: the algorithm name `ChaCha20-Poly1305` in
  `goose-recipes/marmot-encrypted-media.yaml:21` and
  `skills/marmot-encrypted-media/SKILL.md:60` (present since 1e443d78), plus
  minified bundles in uncommitted `dist/`. No `.gitleaks.toml` exists; CI's
  gitleaks steps are advisory (documented-deliberate `continue-on-error`).
  **No secrets anywhere.** Recommend a two-line allowlist for the algorithm
  string (doc-only slice).
