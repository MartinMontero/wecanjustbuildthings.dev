# VERIFICATION.md — measured evidence for the ship milestones

> Created by M6 (D13), 2026-09-06. Extended by M8 (full verification loop), 2026-09-07.
> Numbers are measured, not asserted. Each entry names its tier: **local-sandbox**
> (this workspace, Node 22.12.0, `astro preview`, headless Chromium — indicative,
> not gate-grade) or **CI** (authoritative when it runs there). Re-run after any
> milestone that touches page weight, LCP, or a budget-gated route.

## M8 — full verification loop (two consecutive clean-state passes)

Two independent clean checkouts of `main@4af526e` + the M8 fix (see below),
`npm ci` + `npm run verify:all` on each:

| Pass | Checkout | Result | Log |
|---|---|---|---|
| 1 | clean-state A | `verify:all` **exit 0** | `pass1-verify-all-fixed.log` |
| 2 | clean-state B | `verify:all` **exit 0** | `pass2-verify-all-fixed.log` |

Chain per pass: `check` (astro) → `typecheck:tools` → `typecheck:worker` → full
test suite (incl. enforcement + worker + arabic-face checkpoint tests) →
`enforce` → `enforce:skills` → `build` (with the prebuild Arabic-font assembly,
SHA-256 pinned).

### Flows walked at the full dataset (local-sandbox, headless Chromium)

`scripts/e2e-check.mjs` — all island behaviors pass: catalog add/remove with
tray persistence across reload, Build Studio Goose explain panel + deeplink,
agent-response reflection screened against the catalog, authored-skill folding
into the recipe. Axe `scripts/a11y-check.mjs` — **no serious/critical
violations** on all 13 routes (incl. `/catalog/` at the full 2,186-entry
dataset and `/ar/` RTL pages).

### Lighthouse vs budgets (local-sandbox, `astro preview`, 1 run per route — indicative)

Budgets from `lighthouserc.json`: performance ≥ 0.90, accessibility ≥ 0.95,
LCP ≤ 2500 ms, CLS ≤ 0.1.

| Route | Perf | A11y | LCP (ms) | CLS | Verdict |
|---|---|---|---|---|---|
| `/` | 1.00 | 1.00 | 1513 | 0.000 | within budgets |
| `/start/` | 0.99 | 1.00 | 1668 | 0.000 | within budgets |
| `/pie/cooking/` | 0.97 | 1.00 | 1964 | 0.000 | within budgets (see fix) |
| `/policies/enforcement/` | 0.99 | 1.00 | 1815 | 0.000 | within budgets |
| `/catalog/nostr-tools/` | 1.00 | 1.00 | 1811 | 0.000 | within budgets |
| `/recipes/shakespeare-byok-configuration/` | 0.99 | 1.00 | 1671 | 0.000 | within budgets |

**Fix applied during this loop (M8):** first measurement showed `/pie/cooking/`
at perf 0.88 (TBT 460 ms), driven by the protocol-cluster DOM (380 KB HTML).
Minimal fix: `content-visibility: auto` + `contain-intrinsic-size` on
`CatalogList` items (off-screen items skip layout/paint; stay in the
accessibility tree). Re-measured: **0.93–0.97 perf, TBT 300 ms, LCP 1822–1964
ms**, axe unchanged. The two verify:all passes above were run AFTER the fix.

### Screenshots at 3 widths vs DESIGN intent (local-sandbox)

1280 / 768 / 390 px captures of `/`, `/catalog/`, `/check/`, `/build/`,
`/build/models/`, `/start/`, with `prefers-reduced-motion` **on and off** (36
captures in the session evidence ledger). Reviewed against DESIGN.md: Build
Plate hero + WorkOrderGrid (M5), receipt-card explorer (M3), tokenized
compass cards with honesty chips (M4), register-consistent intros (M5/D7),
reduced-motion produces no layout breakage or missing states.

---

## Page-weight ceilings (local-sandbox, `astro build`, M6 2026-09-06; re-checked M8)

| Metric | main@33a5d8a | M6 | M8 (post-fix) | Ceiling |
|---|---|---|---|---|
| Total `_astro` JS | 419 KB | 419 KB | 419 KB | 460 KB |
| Total `_astro` CSS | 142 KB | 140 KB | 140 KB | 155 KB |
| `/build/models/` page assets | 109 KB | 106 KB | 106 KB | 120 KB |
| Fonts total | 62 KB | 99 KB | 99 KB | 110 KB |
| `/pie/cooking/` HTML | 380 KB | 380 KB | 380 KB (render-cost fixed via content-visibility) | — |

## /catalog/ LCP (local-sandbox, single runs — indicative)

| Build | LCP |
|---|---|
| main@33a5d8a | 2.9 s |
| M6 | 2.7 s |
| M8 | 1.8 s (astro preview tier) |

No `/catalog/` LCP regression across the ship effort. Gate-grade measurement is
`npm run lhci` in CI.

## D12 hydration (M6)

`client:visible` on CostEstimator + ModelCompass (en/es/ar); BuildStudio and
PolicyChecker remain `client:load`. ModelCompass static-render evaluated and
deferred with numbers (see M6 section of this file's history; decision stands).

## M6 console + Arabic face

Console surface: 18 raw hex literals → 0. Arabic display face: Readex Pro
wght 700, **32.6 KB** subset (budget ≤ 45 KB), OFL committed, `:lang(ar)`
heading wiring verified in light + dark. Binary travels text-encoded
(6 parts, SHA-256 pinned prebuild assembly); remote assembly verified
byte-identical to the measured subset.

## Tier disclaimer

Everything above marked **local-sandbox** is indicative evidence gathered in
this workspace (Node 22.12.0, astro preview, headless Chromium, single runs).
It is not a substitute for CI's `lhci` (3 runs, gate infrastructure) or the
production deploy checks — those run on merge per SHIP.md's deploy steps. No
security claim in this file rests on a web-harness observation; enforcement
claims rest on `npm run enforce` / the worker test suite.
