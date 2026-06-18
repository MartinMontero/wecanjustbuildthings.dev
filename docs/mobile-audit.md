# Mobile-responsiveness audit — `wecanjustbuildthings.dev`

Read-only inventory of mobile-responsiveness defects in the **existing** code,
captured before any fix. Branch: `mobile-responsiveness-audit`. This file is the
first commit; code changes land in later commits, traced back to the findings
below.

Method: static review of every stylesheet, Starlight override, and Svelte/Astro
island, plus an empirical harness (`scripts/mobile-audit.mjs`) that drives
headless Chromium over **9 routes × 3 locales (en / es / ar-RTL) × 5 breakpoints
(320 / 360 / 390 / 768 / 840 px)** for the overflow sweep, runs axe-core 4.10
`target-size` (WCAG 2.2 SC 2.5.8) + a full serious/critical WCAG 2.1 A/AA pass,
and Lighthouse mobile (lab) for Core Web Vitals. Raw output: `reports/mobile/`.

> **Scope note / structural divergence (per the brief's "no fabrication" rule).**
> The brief names four components — *Build Studio, Catalog, Mentor Engine, Skills
> Creator*. The repo does not match that 1:1, so this audit adapts to what
> actually ships:
> - **Build Studio** — `src/components/BuildStudio.svelte`, mounted at `/build/`.
> - **Catalog** — `src/components/CatalogExplorer.svelte` (+ `CatalogList.astro`), at `/catalog/`.
> - **"Mentor Engine"** — `src/lib/mentor-engine.ts`: a *deterministic library
>   used inside Build Studio* (Step 1 reflection), **not** a page. This is the
>   pre-existing model-free reflection step the brief says not to touch.
> - **"Skills Creator"** — the skills-capture step *inside* Build Studio (Step 2)
>   plus the `guides/knowledge-to-skills` guide; not a standalone component.
> - Two interactive destinations the brief didn't name also exist and are in
>   scope: **Check a dependency** (`PolicyChecker.svelte`, `/check/`) and
>   **Model Compass** / **Cost Estimator** (`/build/models/`, `/build/cost/`).
>
> The good news from the baseline: the design system (`tokens.css`,
> `theme.css`, `components.css`) is already largely token- and
> logical-property-based, and **Core Web Vitals + axe `target-size` already
> pass**. The defects are concentrated, specific, and fixable without fighting
> Starlight.

---

## 1. Horizontal overflow / fixed widths

**Real page-level overflow** (`documentElement.scrollWidth > clientWidth` — the
page scrolls sideways on a phone), reproduced by the sweep:

| Route | Locale | Widths | Page width | Culprit |
|---|---|---|---|---|
| `/build/models/` | en | 320/360/390 | **392px** | `<select>` in `.mc__filters` |
| `/build/models/` | es | 320/360/390 | **445px** | same `<select>`, longer ES `<option>` text |
| `/build/models/` | ar | 320 | **324px** | same `<select>` (RTL spills left) |
| `/catalog/<entry>/` | en, es | 320/360 | **389px** | long unbreakable link in `.wcb-meta dd` |

- **`ModelCompass.svelte:123-128, 79-87`** — `.mc__filters` is `flex-wrap`, but the
  tier `<select>` sizes to its widest `<option>` and has no `max-inline-size` /
  shrink, so it can't get narrower than ~304px (en) / ~346px (es) and drags the
  whole page wider than the viewport. **The single worst mobile bug.**
- **`theme.css:114-123` (`.wcb-meta`) + catalog entry pages** — registry/source
  URLs render as long unbreakable `<a>` inside `<dd>`; with no `overflow-wrap`,
  one link forces the page to 389px. (`src/components/CatalogList.astro` shares
  the `.wcb-meta`/`.wcb-badge` chrome.)
- **`CatalogExplorer.svelte:424`** — `.layout { grid-template-columns: 16rem 1fr }`.
  The `1fr` track has `min-width:auto`; a long card name (e.g.
  `@radix-ui/react-aspect-ratio`) can force overflow. Needs `minmax(0,1fr)` +
  token wrapping. *(Defensive — did not trip the sweep, but the risk is real.)*
- **`BuildStudio.svelte:1440`** — `.pick label { grid-template-columns: auto 1fr auto }`,
  same `1fr` / `min-width:auto` risk with long tool names. *(Defensive.)*

**Not bugs (verified):**
- `/policies/enforcement/` flags `code` / `.ec-line` / table elements wider than
  the viewport, **but `scrollW == clientW`** — they live inside Expressive Code's
  own `overflow-x:auto` scroller (and Starlight's table wrapper). Internal scroll
  is the correct responsive pattern for code; not page overflow. The harness now
  excludes internal-scroller descendants so the after-run is honest.
- `AccountWidget.astro:249` — the only `100vw` usage is
  `inline-size: min(20rem, calc(100vw - 2rem))`, which is overflow-safe by design.
- No hard-coded pixel page widths, no `100vw` full-bleed, no off-screen negative
  margins.

## 2. Touch targets

**axe-core `target-size` (WCAG 2.2 SC 2.5.8): 0 violations** across all 9 routes ×
3 locales at 390px — the controls already clear the 24px floor via size + spacing
or the inline-link exception. So the *measurable* criterion is already met.

Against the brief's stricter targets (48×48 primary working area; never below the
24px floor), these controls are still smaller than desired (static review;
computed block-size in parentheses) and will be raised in the touch-target pass:

| Control | File:line | ~block-size | Class |
|---|---|---|---|
| `.toggle` (keep/remove piece) | `BuildStudio.svelte:1491` | **~22px** | below 24 floor |
| `.apply` | `BuildStudio.svelte:1469` | ~24px | dense |
| `.lang` (locale toggle) | `BuildStudio.svelte:1418` | ~26px | dense |
| `.wcb-acct__link` (Sign in/out) | `AccountWidget.astro:232` | ~26px | primary chrome |
| `.more` (show more) | `CatalogExplorer.svelte:450` | ~36px | primary |
| `.primary` (run checks) | `PolicyChecker.svelte:156` | ~37px | primary |
| `.primary` / `.nav button` | `BuildStudio.svelte:1514-1515` | ~37px | primary/secondary |
| `.seg button` (yes/no), `.go` | `CostEstimator.svelte:253,257` | ~32–40px | primary |
| `.opt` (filter rows) | `CatalogExplorer.svelte:431` | ~24px | dense list |

Standalone text buttons with `padding:0` — `.link` (`CatalogExplorer.svelte:436`,
`BuildStudio.svelte:1519`) — pass axe via the inline exception but get a ≥24px hit
area where they act as standalone controls.

## 3. Input zoom trap (`font-size < 16px` on form controls → iOS auto-zoom)

| Control | File:line | Computed | Why |
|---|---|---|---|
| `.sort select` | `CatalogExplorer.svelte:423` | **14.4px** | inherits `.sort` `0.9rem` |
| `select` | `PolicyChecker.svelte:151` | **14.4px** | inherits `.controls label` `0.9rem` |
| `.grid input, select` | `CostEstimator.svelte:251,248` | **14.4px** | inherits `.grid label` `0.9rem` |
| `.wcb-acct__input` (Bluesky handle) | `AccountWidget.astro:271` | **13.3px** | `font-size: var(--step--1)` |

OK already: `CatalogExplorer.svelte:418` search `1rem`; `BuildStudio.svelte:1429`
`font: inherit` (resolves to 16px); `ModelCompass` select (inherits 16px). Fix:
set every form control to `font-size: max(16px, 1rem)`. **Do not** use
`maximum-scale=1` / `user-scalable=no`.

## 4. Physical-direction CSS (breaks RTL mirroring)

The status/verification **colour edge** is painted with physical `border-left-*`,
so in Arabic (RTL) it lands on the wrong side of every badge:

- `theme.css:101` `border-left-width: 4px`; `:105-112` `border-left-color` ×8 (`.wcb-badge--*`).
- `CatalogExplorer.svelte:445` `border-left-width`; `:446-449` `border-left-color` ×4 (`.badge--*`).
- `BuildStudio.svelte:1444` `border-left-width`; `:1445-1447` `border-left-color` ×3 (`.vbadge--*`).
- `PolicyChecker.svelte:160` `text-align: left`; `:162` `border-left: 4px solid` (`.tag`).

**Fluid-type accessibility guard:** `components.css:155` —
`font-size: clamp(var(--step-5), 5vw, var(--step-7))` — the preferred term is
**pure `5vw`** with no `rem` component (brief: "always include a `rem` component").
Will become `clamp(var(--step-5), 1.5rem + 2vw, var(--step-7))`.

Everything else already uses logical properties correctly (`inset-inline-*`,
`padding-inline`, `border-inline-start`, `margin-block`, `text-align: start/end`,
`border-start-start-radius`, `inline-size`/`block-size`) — see `components.css`,
`Hero.astro`, `GuidedSteps.astro`, `IndependentChecks.astro`, `CostEstimator.svelte`,
`ModelCompass.svelte`, `AccountWidget.astro`. Starlight already emits
`dir="rtl"` on `/ar/` pages (verified in `dist/ar/index.html`).

Missing RTL niceties to add: `:lang(ar) * { letter-spacing: 0 !important }`
(Arabic must not be letter-spaced), and `:dir(rtl)` mirroring for any directional
glyph. (Most directional arrows are already per-locale strings, e.g. Catalog
`ctaGo` uses `→` for en/es and `←` for ar.)

## 5. Viewport-height bugs

**None.** There is no `100vh` / `vh` *height* anywhere. Every `vh`/`vw` token is
inside `clamp()` / `min()` for fluid type, spacing, or width
(`Hero.astro:99,168,190`, `components.css:155`, `BuildStudio.svelte:1411`,
`AccountWidget.astro:249`). Nothing clips under the mobile address bar. No change
required (no `100svh`/`dvh` retrofit needed).

## 6. Images

The site is text + inline-SVG. The **only** `<img>` is the logo
(`SiteTitle.astro:14`), which already has `width`/`height` and `alt=""`. The hero
seal and all iconography are inline `<svg>`; the social/OG image is a `<meta>`
tag. So `srcset`/`sizes`/`loading` are **not applicable** (and CLS is already 0).
The one safe, future-proofing addition: a global
`img { max-inline-size: 100%; block-size: auto }` so any future markdown image
can't overflow.

## 7. Viewport meta + safe area

Current (built output, all three locales):

```html
<meta name="viewport" content="width=device-width, initial-scale=1" />
```

Missing `viewport-fit=cover` and `interactive-widget=resizes-content`; there is no
`env(safe-area-inset-*)` handling anywhere, and no `Head` override exists
(`src/components/overrides/` has only Hero, PageTitle, SiteTitle, SocialIcons).
Fix: add a Starlight `Head` override emitting
`width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content`,
and pad notch/home-indicator areas with `max(<base>, env(safe-area-inset-*))`
(safe to ship universally — `env()` is 0 where unneeded).

## 8. Mobile navigation between components

Today a phone user reaches the four interactive destinations only through
Starlight's hamburger (`MobileMenuToggle`) → slide-down menu → the full sidebar
tree (`Tools ▸ Build Studio / Check a dependency / Model Compass`, `Catalog`,
…). It works, but every switch is 2–3 taps behind a closed menu, with no
persistent, thumb-reachable way to move between the tools and no sense of "which
tool am I in". Sign-in lives in the mobile-menu footer (`SocialIcons` override →
`AccountWidget`).

Remediation (brief): a **persistent bottom navigation bar** for compact widths
(`<600px`, Material 3 window class), ceding to Starlight's sidebar at
`≥600px`. Destinations (adapted to the real structure, ≤5, intrinsic-width so
ES/AR labels don't collide): **Home · Build · Catalog · Check**. Model Compass
and Cost Estimator are sub-tools reached from Build. *This is navigation only — it
deliberately does not implement the deferred cross-component "build session"
flow.*

## 9. Baseline measurements

### Overflow sweep (per locale; page-level only, internal scrollers excluded)
- **en:** `/build/models/` @320/360/390; `/catalog/<entry>/` @320/360. → 5 combos.
- **es:** `/build/models/` @320/360/390; `/catalog/<entry>/` @320/360. → 5 combos.
- **ar:** `/build/models/` @320. → 1 combo.
- **Total: 11 page-overflow combos over 2 distinct routes.** All other
  route×locale×width combos: clean.

### axe-core 4.10
- **`target-size` (WCAG 2.2 SC 2.5.8): 0 violations** (all routes, all locales).
- Other serious/critical: **`color-contrast` on `/build/models/`** — 89 nodes
  (en/es), 1 (ar). Pre-existing, from `opacity` on `.mc__meta dt/dd` + hardcoded
  badge colour fallbacks. **Not a responsiveness defect**; a11y still ≥ 90 (see
  below). Logged as observed / out-of-scope for this task.

### Lighthouse mobile (lab, single run)
| Route | Perf | A11y | LCP | CLS | TBT |
|---|---|---|---|---|---|
| `/` | 100 | 100 | 1.21s | 0 | 0 |
| `/start/` | 99 | 100 | 1.66s | 0 | 0 |
| `/pie/cooking/` | 99 | 100 | 1.82s | 0 | 0 |
| `/policies/enforcement/` | 100 | 100 | 1.21s | 0 | 0 |
| `/catalog/nostr-tools/` | 99 | 100 | 1.70s | 0 | 0 |
| `/build/` | 100 | 100 | 1.21s | 0 | 62ms |
| `/build/models/` | 100 | **96** | 1.15s | 0 | 67ms |
| `/build/cost/` | 100 | 100 | 1.52s | 0.024 | 0 |
| `/catalog/` | 100 | 100 | 1.37s | 0 | 90ms |
| `/check/` | 100 | 100 | 1.51s | 0 | 0 |

All routes meet the targets already: **A11y ≥ 90, LCP ≤ 2.5s, CLS ≤ 0.1**. The
job is to fix overflow / RTL / input-zoom / nav **without regressing these**.

### RTL
`dir="rtl"` is correctly emitted site-wide on `/ar/` (Starlight built-in). No
hand-rolled RTL exists; the defects above are physical-property leaks, not a
missing RTL system.

---

## Remediation plan (later commits)

1. **Logical properties + RTL** — physical `border-left-*` / `text-align:left` →
   logical; `:lang(ar)` letter-spacing reset; `:dir(rtl)` glyph mirroring.
2. **Input zoom** — `font-size: max(16px, 1rem)` on every form control.
3. **Overflow** — shrink the Model Compass `<select>`; `minmax(0,1fr)` + token
   wrapping on catalog/studio grids; wrap long links in `.wcb-meta`.
4. **Fluid type** — add the `rem` component to the `h1#_top` clamp.
5. **Viewport meta + safe area** — `Head` override + `env(safe-area-inset-*)`.
6. **Touch targets** — 48px working area for primary CTAs; ≥24px floor everywhere.
7. **Mobile navigation** — persistent bottom bar (Home · Build · Catalog · Check)
   for `<600px`, with active-state and safe-area padding.

Every fix is verified by re-running `scripts/mobile-audit.mjs` + Lighthouse in all
three locales (Arabic RTL); results in `MOBILE_FIXES.md`.
