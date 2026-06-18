# Mobile responsiveness — fixes summary

Branch `mobile-responsiveness-audit`. Full findings + baseline in
[`docs/mobile-audit.md`](docs/mobile-audit.md); this is the before/after.

The design system was already in good shape (token-based, mostly logical
properties, CWV already green). The work was a focused set of fixes — RTL leaks,
an input-zoom trap, two real overflow bugs, viewport/safe-area, touch-target
sizing, and a persistent mobile nav — verified across **en / es / ar (RTL)**.

## What was broken → what changed

| # | Broken | Fix | Commit |
|---|---|---|---|
| 1 | Status/verification colour edge used physical `border-left-*` / `text-align:left` → wrong side in Arabic | Logical props (`border-inline-start-*`, `text-align:start`); `:lang(ar)` letter-spacing reset; `.mirror-rtl`; `img` overflow safety net | `fix(rtl)` |
| 2 | Form controls inheriting 13–14px → iOS focus auto-zoom (4 islands) | `font-size: max(16px,1rem)` on every control; no `user-scalable` hack | `fix(forms)` |
| 3 | **Model Compass `<select>` forced the page to 392px (en) / 445px (es), RTL spill (ar)** | Override `<fieldset>` `min-content` floor + full-width tier row + zero-basis select | `fix(overflow)` ×2 |
| 4 | Catalog entry pages: long unbreakable links forced 389px | `.wcb-meta` `minmax(0,1fr)` + `overflow-wrap:anywhere` | `fix(overflow)` |
| 5 | `h1#_top` clamp used pure `vw` (no `rem`) → 200%-zoom unsafe | `clamp(step-5, 1.5rem + 2vw, step-7)` | `fix(overflow)` |
| 6 | Viewport meta lacked `viewport-fit=cover`; no safe-area handling | Override viewport meta via Starlight `head` (deduped); `env(safe-area-inset-*)` on the bottom nav | `feat(viewport)` |
| 7 | Sub-24px control (`.toggle` ~22px); primaries < 48px | `min-block-size` 48/44px primaries, ≥28px dense | `fix(touch-targets)` |
| 8 | No persistent way to switch tools on a phone (buried in hamburger) | Persistent bottom nav (Home · Build · Catalog · Check), <600px, locale-aware, active marker, RTL-mirrored, safe-area | `feat(nav)` |

## Before → after (measured; `npm run audit:mobile` + Lighthouse mobile)

### Overflow sweep — 9 routes × en/es/ar × 320/360/390/768/840px
| | Before | After |
|---|---|---|
| Page-overflow combos | **11** over 2 routes (Model Compass ×3 locales, catalog entries ×2) | **0** |

### axe-core 4.10 `target-size` (WCAG 2.2 SC 2.5.8)
| | Before | After |
|---|---|---|
| Violations | 0 | **0** (and primaries now hit 44–48px) |

### Lighthouse mobile (lab)
| Route | Perf | A11y | LCP | CLS | | Perf | A11y | LCP | CLS |
|---|---|---|---|---|---|---|---|---|---|
| | **before** | | | | | **after** | | | |
| `/` | 100 | 100 | 1.21 | 0 | | 100 | 100 | 1.07 | 0 |
| `/build/` | 100 | 100 | 1.21 | 0 | | 100 | 100 | 1.52 | 0 |
| `/build/models/` | 100 | 96 | 1.15 | 0 | | 100 | 96 | 1.21 | 0 |
| `/build/cost/` | 100 | 100 | 1.52 | 0.024 | | 100 | 100 | 1.21 | 0.024 |
| `/catalog/` | 100 | 100 | 1.37 | 0 | | 98 | 100 | 1.98 | 0 |
| `/catalog/nostr-tools/` | 99 | 100 | 1.70 | 0 | | 99 | 100 | 1.81 | 0 |
| `/check/` | 100 | 100 | 1.51 | 0 | | 99 | 100 | 1.67 | 0 |

All routes meet the targets in all three locales: **A11y ≥ 90, LCP ≤ 2.5s,
CLS ≤ 0.1**. The bottom nav adds **no CLS** (fixed-position) and no a11y
regression. `astro build` is clean (6634 pages); `astro check`: 0 errors.

## Out of scope (reported, not changed)
- **`color-contrast` on `/build/models/`** (89 nodes): pre-existing, from `opacity`
  on the meta `dt/dd` + hardcoded badge colour fallbacks. It is a *contrast*
  defect, not a *responsiveness* one, and Lighthouse a11y there is already **96
  (≥ 90)**. Left untouched to respect scope discipline; flagged here for a future
  pass.
- **Structural divergence:** the brief's "Mentor Engine" is a deterministic
  library inside Build Studio (the do-not-touch reflection step) and "Skills
  Creator" is a step inside Build Studio, not standalone pages — so the bottom
  nav surfaces the real destinations (Home · Build · Catalog · Check). See
  `docs/mobile-audit.md`.

## Reproduce
```sh
npm run build
npm run audit:mobile        # overflow sweep + axe target-size, en/es/ar × 5 widths
CHROME_PATH=<chromium> npx lhci collect --staticDistDir=./dist ...
```
