# PLAN.md — ship the approved backlog + design elevation (Phase 3)

Authority: SHIP-GATE-R1/R2 rulings — G1 approved as marked (+riders a/b),
G2 = Option 2 (+riders), G3 confirmed (paths named), G4 executed (see
`docs/archive/`), G5 confirmed (Astro 7 out), G6 approved (+riders a/b).
Scope = BACKLOG.md SHIP column only: **D1–D13, B1-Option-2, B10, E1–E10**
(E10 already executed). OWNER and DEFER items are out of scope. No further
gates except Rule 9 (destructive/irreversible actions).

Discipline per milestone: vertical slice → its own PR → `npm run verify:all`
+ `npm run enforce` green before close → owner merges (never pushed to main).
One logical change per commit. Every user-facing string lands en/es/ar
together (except the documented console exception).

## Milestones

### M0 — Governance truth (B1-Option-2, E5) — first, it is the P0
- `src/schema/catalog.ts`: add `security_sensitive: z.boolean().optional()`
  to the docs schema extension so the existing flag on the Marmot guide is
  real, validated data (English source only; translations inherit by path).
- CLAUDE.md: rewrite the i18n-governance section to the truth — what exists
  (locales, translate-catalog pipeline, fallback), what is planned (freshness
  stamps, banner, roles, TRANSLATING.md), and the minimal gate below. E5: the
  `TRANSLATING.md` reference is removed/marked planned; no dangling reference
  survives. E9 rides here: constraint 4 names the protected workflow set
  {verify, security-pr, quality}.
- **The minimal gate (mechanism, per G2 rider):** new ADDITIVE workflow
  `.github/workflows/i18n-security-gate.yml`, triggers `pull_request` +
  `pull_request_review`. Steps: diff changed files vs base; select files
  whose frontmatter has `security_sensitive: true` OR that are locale
  variants (`es/…`, `ar/…`) of a flagged English source (path-mapped); if
  any selected, count DISTINCT approving reviewers via the REST reviews API;
  **fail the check while approvals < 2**. It never modifies or weakens
  `operational_advisory` workflows (additive file, constraint 4).
- **B4 dependency, stated plainly:** as a workflow this gate goes red but
  GitHub only *blocks* merge once the check is marked REQUIRED in branch
  protection (OWNER item B4). Until B4 flips, the gate is a loud advisory —
  the P0 is fully closed only by this milestone + B4 together. PLAN records
  this; the owner flips B4.
- Acceptance: schema validates the flagged page; a test PR touching it shows
  the gate red at 0–1 approvals, green at 2; CLAUDE.md contains no claim a
  fresh clone can falsify.
- Non-goals: freshness stamps, banner, CODEOWNERS, TRANSLATING.md content —
  the full layer is its own later effort.

### M1 — System layer (parts of D1, D4, D6)
- tokens.css: `--verdict-ok-bg/--verdict-warn-bg/--verdict-danger-bg` (both
  themes), `--shadow-1`; global `accent-color: var(--structure)`.
- theme.css: explicit `@layer` ordering vs Starlight's `starlight` layer.
- `.workbench` page class (frontmatter-driven) for the five tool pages.
- **Receipt primitive**: shared component (Astro for static surfaces + a
  Svelte twin or class-contract for islands) rendering status as
  icon + word + color (grayscale-correct, WCAG 1.4.1 — G6 rider), stamped
  edge, inline evidence slot, plain-verb line. Variants: ok / warn / danger /
  neutral-pending.
- Footer override (D6): designed, token-native, locale-aware; registered in
  astro.config components.
- Acceptance: tokens exist + consumed by the primitive; footer on all pages
  incl. es/ar/RTL; axe clean; visual check at 3 widths; no `--sl-*` in new code.

### M2 — Receipts on the trust surfaces (D1 complete, D2; closes P0-2, P1-15)
- PolicyChecker: house i18n pattern (`lang` prop + STR en/es/ar); verdict
  band via the receipt primitive — clean / blocked / chain-to-excluded with
  the ownership chain rendered as a chain; CLI detail behind a "for
  developers" disclosure; designed empty/error states.
- Catalog entry badges + `/policies/enforcement/` verdict band + Studio
  policy gate adopt the same primitive.
- Acceptance: D1's ≥4 surfaces met; `/es/check/` + `/ar/check/` fully
  localized (grep: no hardcoded English in the island); axe clean; e2e green.

### M3 — Catalog explorer density (D3)
- Responsive 1→2→3-col receipt-card grid; designed facet groups with counts;
  designed zero-result/empty/error states at the full dataset (count = E6
  generated figure); locale-aware CTA (`buildBase` used at `:358`).
- Acceptance: desktop `/catalog/` no longer a single-column 20k-px page;
  states verified at full dataset; CTA locale-verified on es/ar; LCP budget
  holds (explorer is the LCP element).

### M4 — Island tokenization + honesty chips (D4, D8, D9)
- Retire `--sl-*`/raw hex/off-scale rems from BuildStudio, CostEstimator,
  ModelCompass, CatalogExplorer (the `#d33…` ramp, `0 6px 24px` shadow, etc.).
- D8: `TODO: confirm` → provenance chip ("unverified — awaiting human check",
  localized; semantics unchanged).
- D9: BuildStudio stray strings → STR; AccountWidget ar placeholder; compass
  cautions + estimator labels via i18n keys.
- Acceptance: grep zero `--sl-color` and zero hex literals in island styles;
  `/build/models/` axe color-contrast = 0 (closes the 89-node finding); grep
  finds no user-visible "TODO"; 352+ tests stay green.

### M5 — Landing + register (D5, D7, B10)
- WorkOrderGrid replaces stock CardGrid/LinkCard sections; copy-register pass
  on landing, /build, /check, /build/models, /start intros (en/es/ar in the
  same commit); B10: NIP-07 one-liner (nos2x/Alby) near sign-in docs.
- Acceptance: no Starlight Card/LinkCard on the landing; register rules
  (DESIGN §4) hold; screenshots at 3 widths vs DESIGN intent.

### M6 — Console tokens, Arabic face, hydration, ceilings (D10–D13)
- **CHECKPOINT (G6 rider b, recorded here before implementation):** Arabic
  display face — final pick: _____ ; measured subset woff2 size: _____ KB
  (budget ≤ 45 KB); OFL text committed. Filled in by the M6 PR itself; the
  face does not land until this line is filled.
- D10: console token-compliance only (raw hex → tokens; `.btn`/`.field`);
  CSP wss: invariance test stays green; PANEL-RESPEC-v2 room untouched.
- D12: `client:visible` for below-fold islands; ModelCompass static-render
  evaluated; no `/catalog/` LCP regression (measured).
- D13: page-weight ceilings measured + recorded in VERIFICATION.md.
- Acceptance: zero raw hex in console; `/ar/` headings render the face;
  before/after JS-transfer numbers recorded.

### M7 — Doc-drift closeout (E1–E8; E9 landed in M0, E10 done)
One commit each: ROADMAP through #56+; admin-spec phase ledger; E4 README
deploy section → Workers Builds topology (+ CLAUDE.md "Cloudflare Pages"
phrasing); E6 one generated catalog count everywhere; E7 runbook §B2 = 7
models + maple-ai; E8 mobile-doc headers.
- Acceptance: README claims match built reality line by line (DoD); no doc
  names a file or number a fresh clone can falsify.

### M8 — Verification loop + ship report
Per the ship prompt Phase 5: two consecutive full passes — clean-state
`verify:all`, every flow walked at full dataset, 3-width screenshots vs
DESIGN intent, axe + Lighthouse vs budgets, reduced-motion on/off —
evidence in VERIFICATION.md; failures fixed and re-run. Then SHIP.md:
ledger (item → status → evidence), before/after screens, known limitations,
residual risks, deploy steps. CHANGELOG records MVP → v1 deltas.

## DoD reconciliation (SHIP-GATE-R1 2d — the prompt's DoD, restated against reality)

| Prompt DoD line | Reconciled criterion |
|---|---|
| Fresh clone `npm install && npm run verify:all` passes | Unchanged — as written |
| Backlog ledger 100% shipped-or-BLOCKERS | Scope = BACKLOG SHIP column; OWNER/DEFER items listed in SHIP.md as owner-court, not blockers |
| Design implemented, zero banned defaults, all values via tokens | Unchanged; deviations documented in SHIP.md |
| "All three enforcement layers pass on the repo's own tree (`cli.ts all --tree .`)" | **G3 wording:** Layers 1–2 pass `--tree .` (already CI-enforced, `verify.yml:42-43`); Layer 3 passes on every path except its own definitions/fixtures: `enforcement/excluded-organizations.yaml`, `enforcement/excluded-provider-signals.yaml`, `enforcement/tests/**` |
| Catalog integrity (count, hand-authored untouched, catalog.json consumed) | Unchanged; count asserted via the E6 generated figure |
| Quality gates ≥ budgets | Unchanged + DESIGN §8 page-weight ceilings |
| Privacy: zero third-party requests | Unchanged; Plausible documented as the sole opt-in, off-by-default exception |
| Security: osv-scanner clean/accepted; secrets scan; input validation; CSP+headers; no-secrets build | Unchanged; CSP ENFORCE flip itself = OWNER item B2 (mechanism already shipped) |
| i18n parity or gaps logged | Parity for all SHIP-scope UI; catalog-entry corpus gap = OWNER item B8, logged not shipped |
| Worker `/api/license`+`/api/health` verified; error/rate-limit documented | Unchanged (both live; rate-limit binding GA) |
| Responsive + reduced-motion | Unchanged |
| Docs: README matches reality; CHANGELOG; CONTRIBUTING accurate | Unchanged (M7/M8) |
| **"Deploy-ready: Cloudflare Pages per README (build `npm run build`, output `dist`, NODE_VERSION=22)"** | **Reconciled:** deploy = Cloudflare **Workers** (static assets from `dist/` + `run_worker_first: ["/api/*"]`), auto-deployed by **Workers Builds on merge to main only** — branch pushes upload preview versions, verified against the deployments ledger (SHIP-GATE-R2 item 0). `wrangler.jsonc` is canonical; README's Pages section is fixed by E4. Worker deploy path documented in the runbook |

## Non-goals (whole effort)
Everything in BACKLOG OWNER/DEFER columns; QA-REMEDIATE-v1 and
PANEL-RESPEC-v2 (external, un-consolidated — BACKLOG §D2); Astro 7 (G5);
full i18n governance layer (G2); IA changes; new features; any weakening of
POLICIES.md, the enforcement engine, or CI gates.
