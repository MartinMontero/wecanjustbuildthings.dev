# VERIFICATION.md — measured evidence for the ship milestones

> Created by M6 (D13), 2026-09-06. Numbers are measured, not asserted. Each entry
> names its tier: **local-sandbox** (this workspace, Node 22.12.0, python http.server,
> single Lighthouse run — indicative, not gate-grade) or **CI** (authoritative when
> it runs there). Re-run after any milestone that touches page weight or LCP.

## Page-weight ceilings (local-sandbox, `astro build`, 2026-09-06)

Measured from `dist/` output. Ceilings = current measured value + 10% headroom;
a PR that crosses a ceiling must justify itself in its body.

| Metric | main@33a5d8a (before) | m6 (after) | Ceiling | Δ |
|---|---|---|---|---|
| Total `_astro` JS (site-wide) | 419 KB | 419 KB | 460 KB | 0 KB |
| Total `_astro` CSS (site-wide) | 142 KB | 140 KB | 155 KB | −2 KB |
| `/build/models/` page-referenced assets | 109 KB | 106 KB | 120 KB | −3 KB |
| Self-hosted fonts total | 62 KB | 99 KB | 110 KB | +37 KB (Arabic subset 32.6 KB + OFL text) |
| Pages built | 6,653 | 6,653 | — | 0 |

Method (repeatable): sum of `dist/_astro/**/*.js|css` bytes; page-referenced
assets = every `/_astro/*` URL named in the page's HTML; fonts = `dist/fonts/`.

## /catalog/ LCP (local-sandbox, single run each, python http.server — indicative)

| Build | LCP | Perf score |
|---|---|---|
| main@33a5d8a (before) | 2.9 s | 0.79 |
| m6 (after) | 2.7 s | 0.77 |

**No LCP regression on /catalog/ (D12 acceptance).** Local absolute values are
indicative only — the gate-grade measurement is `npm run lhci` in CI
(`lighthouserc.json`: performance ≥ 0.9, LCP ≤ 2500 ms on CI infrastructure).

## D12 hydration changes

- `client:visible` applied to the below-fold data islands: CostEstimator and
  ModelCompass (en/es/ar). BuildStudio and PolicyChecker remain `client:load`
  (the page's primary interactive element, above the fold; PolicyChecker is also
  exercised by `scripts/e2e-check.mjs` + `scripts/a11y-check.mjs` paths).
- JS transfer is unchanged by hydration timing (same bundles, deferred
  execution) — the before/after numbers above show it explicitly.
- **ModelCompass static-render evaluation (D12):** current state — the island
  ships the 11-entry registry as eager JS and hydrates filters, RTL, caution
  chips, and the D8 provenance chips. Static render would need the table split
  into Astro markup + a filter-only mini-island. Decision: **deferred** — the
  island is small (its page-referenced assets measured at 106 KB including the
  shared runtime), the chip logic is shared with CostEstimator, and a split
  adds a second source of truth for the table. Revisit if the registry grows
  past ~50 entries or the compass page becomes a top-traffic surface.

## M6 console + Arabic face

- Console (`/console/` + AdminConsole island): 18 raw hex literals → 0, all
  values from `tokens.css` (the page now imports it; light palette applies via
  the tokens' new prefers-color-scheme block — the page runs no theme script).
- Arabic display face: Readex Pro wght 700, subset = measured /ar/ heading
  alphabet + digits/punct, **32.6 KB woff2** (budget ≤ 45 KB), OFL committed,
  wired to `:lang(ar)` headings in theme.css. PLAN.md checkpoint line filled in
  the same PR (G6 rider satisfied). The binary travels text-encoded
  (`data/fonts/parts/*.b64.part-*.txt`, 6 parts) and is reassembled at prebuild
  by `scripts/assemble-arabic-font.mjs` with a SHA-256 pin — the assembled
  output is verified byte-identical to the measured subset.
- CSP `wss:` invariance: covered by the existing worker/security-headers tests
  in the suite (green in this run).
