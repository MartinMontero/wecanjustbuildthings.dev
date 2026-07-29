# The Design Field Manual — Apple HIG × Google Material Design

**Status:** v1.0 · restructured 2026-07-07 from the source-verified field manual. Facts checked current as of 2026; the standards below shipped in 2025 unless noted.
**Provenance:** imported into the repo 2026-07-29 from Google Drive (`design-field-manual-project-knowledge.md`, doc id `1Y5EG1FXqwDsl3cJufAHmFNvVsWotK5yjYLob_bNXwjU`, created 2026-07-07). Content unchanged; tables and escapes normalised for markdown. Cited as governing authority by `Alfred/LOOP-DESIGN.md` Pass 5.
**Companions:** `DESIGN.md` (repo root — the executable spec; governs implementation) and the Claude Code kickoff prompt.
**Purpose:** full comparative knowledge plus the corrections ledger (Appendix A), so QA and planning never re-litigate settled facts.

**Epistemic labels:** VERIFIED (primary-source) · INFORMAL (real term, unofficial) · LORE (credible reporting, not citable spec) · EXPERIMENTAL (real, unstable) · UNCONFIRMED (do not assert) · OUT-OF-SCOPE (real, irrelevant here).

---

## 0 · Decision layer — what this project takes

Both systems are user-centred; they optimize for different things. Apple: **curated intuition**. Google: **systemic adaptability**.

| Dimension | Apple — HIG | Google — M3 / Expressive | This build takes |
|---|---|---|---|
| Primary goal | Deference — the UI recedes so content leads | Personalization — the UI adapts to the user | Deference as default, token-driven theming underneath |
| Core material | Liquid Glass — translucency, depth, refraction | Material You — surfaces with weight and elevation | Subtle depth via `backdrop-filter`; restraint over spectacle |
| Driving force | Taste & vision — leadership-led design reviews | Data & scale — research, A/B testing, algorithmic color | Opinionated defaults; instrument later (HEART, §6) |
| Source of truth | Aesthetic guidance (no web tokens) | CSS design tokens — web-native, open source | Material tokens are the implementable system |

Aesthetic shorthand: Apple is *liquid glass* — tiles of glass floating over content, using light, reflection, and refraction for hierarchy. Google is *digital paper* — layered surfaces using elevation (tonal color + shadow) and ink ripples for interaction. For the web: borrow Apple's restraint and Google's structural rigor.

---

## 1 · Apple — the Human Interface approach

- **Liquid Glass** — VERIFIED. Announced WWDC, June 9 2025. Official description: a material that "reflects and refracts its surroundings"; in-session: a "digital meta-material that dynamically bends and shapes light." Applies across the **"26" OS family** (iOS 26, iPadOS 26, macOS Tahoe 26, …) — Apple aligned all version numbers to a model-year scheme, jumping iOS 18 → 26.
- **San Francisco (SF)** — VERIFIED. The system **variable** font family: SF Pro, SF Mono, SF Compact (plus SF Pro Rounded and the New York serif). Web reality: SF is **not** a general webfont — the license limits it to mockups of Apple-platform UIs, and it won't render on Windows/Android. Use the system stack (§3).
- **SF Symbols** — VERIFIED. Over **7,000** vector icons (SF Symbols 7), nine weights, three scales, designed to sit alongside SF. Web reality: not directly usable — choose a permissively licensed open SVG set and match weight/optical size.
- **Continuous corner curvature** — VERIFIED as the formal concept. SwiftUI: `RoundedRectangle(style: .continuous)`. "Squircle" / "superellipse" — INFORMAL nicknames. Web reality: CSS `border-radius` is a circular arc, not a true superellipse; approximate, or use `clip-path`/SVG for the real curve if it matters.
- **Dynamic Type** — VERIFIED. User-controlled text scaling the UI must respect. Web parallel: size in `rem`, respect the user's base font size, stay legible at 200% zoom (WCAG SC 1.4.4).
- **Materials & Vibrancy** — VERIFIED. Translucent blur materials: Ultra Thin, Thin, Regular, Thick, Chrome, plus Vibrancy for labels/fills/separators. Under Liquid Glass, a glass layer sits atop these. Web parallel: `backdrop-filter: blur()` with a solid fallback and a performance budget.
- **Accessibility Traits** — VERIFIED. How an element reports itself to VoiceOver (button, header, adjustable, …). Web parallel: semantic HTML + ARIA roles.
- **Patterns** — VERIFIED. Tab Bar (bottom) and Sidebar (iPad/Mac) for navigation; under iOS 26, tab bars shrink on scroll and render in Liquid Glass. Alerts (app-initiated, critical, ideally ≤ 2 buttons) vs Action Sheets (user-initiated, slide up from the bottom; SwiftUI's current API is `confirmationDialog`). Minimum tap target: **44×44 pt**.
- **Buttons** — VERIFIED, platform-split. UIKit: Plain, Gray, Tinted, Filled. SwiftUI: `.plain`, `.bordered`, `.borderedProminent`; iOS 26 adds `.glass` / `.glassProminent`. Neither set maps to the web.
- **Spatial UI / visionOS** — OUT-OF-SCOPE. Ornaments (controls floating outside a window) and eye-tracking focus (`.hoverEffect()`; raw gaze is never exposed to apps) are real, but irrelevant to a 2D website.
- **ANPP (Apple New Product Process)** — LORE. A real internal stage-gated *product-development* process per *Inside Apple* reporting, not an Apple-documented UI guideline. Context, never citation.

---

## 2 · Google — the Material approach

- **Naming** — VERIFIED. **Material You** is the brand (since Android 12, 2021); **Material Design 3 (M3)** is the matching system generation. **Material 3 Expressive** (announced May 2025; shipped Android 16 QPR1, Sept 2025) is an *evolution* of M3 — explicitly **not "Material 4."** Per Google, it's "our most researched update to the design system since its launch in 2014" (46 studies, 18,000+ participants), adding springy motion, a 35-shape morph library, emphasized typography, and new/updated components.
- **Design tokens** — VERIFIED. Named decisions, general → specific, dot-separated: `md.sys.color.primary`. Web reality: these become CSS custom properties with hyphens — `--md-sys-color-primary`, `--md-sys-color-primary-container`. Token classes: `ref` (reference), `sys` (system), `comp` (component).
- **Dynamic color** — VERIFIED. Extracts a palette from context (wallpaper on Android) via **Material Color Utilities (MCU)** in the **HCT** (Hue, Chroma, Tone) color space. "Monet" — INFORMAL, an AOSP codename, not the official name.
- **Grid** — VERIFIED. 8 dp grid with a finer 4 dp sub-grid for icons/type. Targets ≥ **48×48 dp**, separated by ≥ 8 dp.
- **Tonal palettes** — VERIFIED. Each palette has **13 tones** (0 = black → 100 = white). A full scheme derives **5 key colors** from the seed, each with its own 13-tone palette.
- **Surface & elevation** — VERIFIED. M3 shows elevation mainly through **tonal surface colors** (surface-container levels) plus shadow. A **scrim** is a translucent overlay dimming content behind modals/sheets.
- **Buttons** — VERIFIED. Elevated, Filled, Filled tonal, Outlined, Text; M3 Expressive adds five sizes (XS–XL), shape morph (round ↔ square on interaction), and button groups.
- **FAB** — VERIFIED that M3E's documented change is the **FAB Menu** (FAB expands into stacked actions). "Diamond" FAB shape — UNCONFIRMED as a named variant; the verified shape story is the 35-shape morph library.
- **Navigation** — VERIFIED. Navigation bar (bottom, 3–5 destinations) and navigation rail (side, larger screens); M3E makes the rail collapsible/flexible.
- **Snackbar** — VERIFIED term. Brief message, auto-dismiss, at most one action. The Material term is snackbar, not "toast."
- **Switch** — VERIFIED. Binary toggle; M3 allows an icon inside the thumb.
- **Motion (M3E)** — VERIFIED. Physics-based **springs**, not fixed curves: spatial springs for movement/position, effects springs for color/opacity. Expressive ships default spring specs (damping/stiffness) rather than duration tables.
- **Dynamic color from wallpaper** — OUT-OF-SCOPE for web: here the "context" is one brand seed color, chosen once and hand-checked.
- **Google Stitch** — EXPERIMENTAL. Real (Google Labs, I/O 2025, Gemini-powered; generates UI + front-end HTML/Tailwind, exports to Figma). Useful for ideation; not production-stable — never a dependency.

---

## 3 · Typography, units & the accessibility floor

**Type stacks.** Apple ships SF; Google ships Roboto and Roboto Flex (variable), with Google Sans on brand surfaces (not openly licensed). Web reality: chase neither. Use the system stack —

```css
font-family: system-ui, -apple-system, "Segoe UI", Roboto,
             "Helvetica Neue", Arial, sans-serif;
```

— which renders SF on Apple devices, Roboto on Android, Segoe on Windows, at zero webfont weight.

**Type scale.** Material names roles (display, headline, title, body, label — each large/medium/small); Apple names styles (Large Title, Title 1–3, Body, Callout, Caption). Both map onto a rem-based token scale on the web; define the roles as tokens.

**Units.** Apple **pt**; Google **dp** — both density-independent. Web analogue: CSS px for layout math, rem for type. 1 dp ≈ 1 CSS px at 1×. Never set type in px — user font-size preferences must cascade (the Dynamic Type parallel).

**WCAG 2.2 AA floor** — VERIFIED:

- Contrast: body text ≥ **4.5:1**; large text (≥ 24 px, or 18.66 px bold) ≥ **3:1** (SC 1.4.3). Non-text UI/graphics ≥ **3:1** (SC 1.4.11). AAA raises these to 7:1 / 4.5:1.
- Target size: ≥ **24×24 CSS px** or adequate spacing (SC 2.5.8, AA); **44×44** is AAA (SC 2.5.5). Material's 48 / Apple's 44 both clear the floor — use them.
- Focus: a focused element must not be fully hidden by sticky chrome (SC 2.4.11, new in 2.2). Use `:focus-visible` rings; keep logical tab order; never strip outlines without a replacement.
- **WCAG 3.0** is an early Working Draft (Recommendation not expected before ~2028). Build to 2.2; ignore 3.0 for now.

---

## 4 · Component reference — web-buildable

The "Web build note" column is the actionable one; it is what `DESIGN.md` §4 implements.

| Component | Apple (HIG) | Google (M3 / M3E) | Web build note |
|---|---|---|---|
| Buttons | UIKit: Plain, Gray, Tinted, Filled. SwiftUI: `.plain`, `.bordered`, `.borderedProminent`; iOS 26 `.glass` / `.glassProminent` | Elevated, Filled, Filled tonal, Outlined, Text; M3E adds 5 sizes + shape morph | Ship 3: primary (filled), secondary (tonal or outlined), text. Tokens only; don't imitate platform styles |
| Dialog / Alert | Alert — app-initiated, critical, ideally ≤ 2 buttons | Dialog (basic, full-screen) | `<dialog>` or `role="alertdialog"` for critical confirms; focus trap; scrim; ESC closes |
| Action / Bottom sheet | Action Sheet — user-initiated; SwiftUI API: `confirmationDialog` | Bottom sheet (modal / standard) | Mobile: modal sheet + scrim, swipe/ESC dismiss. Desktop: dialog or menu |
| Switch | Toggle | Switch (optional icon in thumb) | `<input type="checkbox" role="switch">`, labelled; 44–48 px target |
| Primary navigation | Tab Bar (bottom; shrinks on scroll under iOS 26) / Sidebar | Navigation bar / rail; M3E flexible variants | `<nav>` + `aria-current="page"`; visible focus; sticky chrome must never fully hide the focused element (SC 2.4.11) |
| Transient feedback | — (no direct snackbar; inline banners) | Snackbar — auto-dismiss, ≤ 1 action | `aria-live="polite"` region; pause on hover/focus; never the only path to the information |
| Type scaling | Dynamic Type | sp units / font scale | `rem` for all font sizes; layout survives 200% zoom (SC 1.4.4) |
| Motion | Restrained; glass responds to motion | M3E motion physics: spatial + effects springs | CSS transitions; gate with `prefers-reduced-motion` |

---

## 5 · Machine legibility ("MX / AX")

The idea — making a site legible to AI agents and crawlers — is real and worth doing. The **label is unsettled**: "MX (Machine Experience)" and "AX (Agentic Experience)" are both recent coinages, not governed standards. Build the substance, not the buzzword:

- **Semantic HTML** — meaningful elements (`<nav>`, `<main>`, `<article>`, `<button>`, real headings/labels) so both screen readers and agents can parse structure.
- **Structured data** — Schema.org via **JSON-LD** to make content relationships explicit.
- Consider **llms.txt** and MCP affordances if agents are a real audience for this project.

---

## 6 · Methods shelf (context, not build spec)

The familiar dichotomy — Apple top-down / design-led (vision, demo-driven executive reviews) vs Google bottom-up / data-driven (research, sprints, A/B testing) — is a **useful heuristic about emphasis, not a binary**. Google's Expressive work was its most-researched system update ever (tested as strongly preferred — up to 87% among 18–24s); Apple does extensive validation too.

Well-sourced methods worth borrowing:

- **HEART** — VERIFIED. Happiness, Engagement, Adoption, Retention, Task Success — Google; Rodden/Hutchinson/Fu, CHI 2010. Pair with Goals → Signals → Metrics. Queued for post-launch instrumentation of this build.
- **GV Design Sprint** — VERIFIED. Jake Knapp et al.; 5 days: Map → Sketch → Decide → Prototype → Test (book: *Sprint*, 2016). Good fit for the non-developer audience this tool serves.
- **ANPP** — LORE (see §1). Credible, never citable as a design standard.
- **Google Stitch** — EXPERIMENTAL (see §2). Ideation only.

---

## 7 · Build directives

The executable form lives in **`DESIGN.md`** at the repo root; that file governs implementation and outranks everything else, including model priors. Summary: one seed → MCU scheme → CSS custom properties · system fonts in rem · glass budget of two surfaces · WCAG 2.2 AA merge gates · semantic HTML + JSON-LD · component set of eight, no FAB. **Open decision:** brand seed color — Martin supplies before token generation.

---

## Appendix A · Corrections ledger (settled — do not re-litigate)

Verdicts from the source QA pass: VERIFIED · IMPRECISE (real but mislabeled/stale) · WRONG (fabricated or incorrect).

| Source draft claim | Verdict | Correction applied |
|---|---|---|
| "Optical Refraction" (Apple) | WRONG | Not Apple nomenclature. Replaced with Apple's actual language: a material that "reflects and refracts its surroundings." |
| "Intelligent Scrim" (Google) | WRONG | Not Google nomenclature. Renamed to the documented term **scrim** (or gradient scrim). |
| "Monet" = Google's color engine | IMPRECISE | AOSP codename, not the official name. Corrected to dynamic color via Material Color Utilities (MCU), HCT color space. |
| SF Symbols "over 6,000" | IMPRECISE | Understated/stale. Corrected to **over 7,000** (SF Symbols 7). |
| Apple buttons "Plain, Gray, Tinted, Filled" | IMPRECISE | Correct for UIKit only. Added the SwiftUI set incl. iOS 26 `.glass` / `.glassProminent`. Neither maps to web. |
| "Squircle" as Apple's term | IMPRECISE | Informal. Apple's formal concept is **continuous corner curvature**. |
| Tonal palette "13 tones from one seed" | IMPRECISE | True *per palette*; a full M3 scheme derives **5 key colors**, each generating its own 13-tone palette. |
| "2026 best practices" framing | IMPRECISE | Reframed: these are **2025-shipped** standards verified current in 2026. |
| FAB "diamond" shape | IMPRECISE | Unverified as a named variant. Documented M3E changes: FAB Menu + 35-shape morph library. Treat "diamond FAB" as not-yet-confirmed. |
| "Google Stitch" | VERIFIED | Real (Google Labs, I/O 2025, Gemini-powered) — but **experimental**, not production-stable. |
| ANPP (Apple New Product Process) | VERIFIED* | Real, but sourced from reporting (*Inside Apple*), not Apple docs. A product/PM process, not a UI spec — flagged as lore. |
| "MX (Machine Experience) Design" | IMPRECISE | Emergent coined term, not a governed standard ("AX / Agentic Experience" is a competing coinage). Kept, grounded in real standards (semantic HTML + Schema.org). |
| "Export to Sheets" lines | WRONG | Removed — Google Docs export artifacts, not content. |
| Everything else (fonts, units, 44/48 targets, nav patterns, HEART, Design Sprint, WCAG 2.2, token syntax, switch/dialog/snackbar terms) | VERIFIED | Verified accurate; tightened and web-translated. |
