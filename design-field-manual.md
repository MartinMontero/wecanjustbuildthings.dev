# The Design Field Manual

**Apple Human Interface Guidelines × Google Material Design, translated for the web.**

**Version:** v2.0 · 2026-07-29 · restructured from v1.0 (2026-07-07)
**Governs:** visual and interaction decisions across this repo and its siblings.
**Outranked by:** `DESIGN.md` at the repo root, which is the executable spec. Where the two disagree, `DESIGN.md` wins.
**Downstream:** `Alfred/docs/decisions/0006-brand-bible-precedence.md` translates this manual into Alfred's app-specific rulings — brass accent, two registers, mono for badges. Those rulings are Alfred's, not this document's.

Organised by the decision you are making, not by vendor. Apple and Google are inputs to each decision, and where a decision has only one usable answer this manual gives it rather than presenting a comparison. Everything that cannot be built on the web has been moved to Appendix A so the body stays constructive.

---

## The two postures

Both systems are user-centred. They optimise for different things, and the difference is worth holding in mind because it explains why their advice diverges.

**Apple optimises for deference.** The interface recedes so content leads. Decisions are made by a small group exercising taste, and the guidance is aesthetic rather than mechanical — there are no Apple design tokens for the web.

**Google optimises for adaptability.** The interface adjusts to the user and the device. Decisions are made from research at scale, and the guidance ships as machinery: an open-source token system, a colour algorithm, published component specs.

The practical consequence: **take Apple's restraint and Google's structure.** Apple tells you how much to do. Google gives you the parts to do it with. A project that takes Google's structure without Apple's restraint produces a busy, over-featured interface; one that takes Apple's restraint without Google's structure produces something tasteful that nobody can maintain.

Shorthand, if it helps: Apple is glass — surfaces floating over content, hierarchy from light and refraction. Google is paper — layered surfaces, hierarchy from elevation and tonal weight.

---

## 1 · Colour

**One seed colour, one generated scheme, exposed as tokens.** Google's Material Color Utilities generates a full scheme from a single seed in the HCT colour space (hue, chroma, tone). Each palette holds thirteen tones from 0 (black) to 100 (white); a complete scheme derives five key colours from the seed, each with its own thirteen-tone palette. This is the only part of either system that is genuinely web-native and open source, so it is the machinery to use.

The output becomes CSS custom properties. Material's dot notation (`md.sys.color.primary`) becomes hyphenated on the web (`--md-sys-color-primary`). Token classes run reference → system → component: `ref` for raw values, `sys` for semantic decisions, `comp` for component-specific overrides.

**Elevation comes from tonal surface colour, not just shadow.** Material's surface-container levels step tone rather than stacking box-shadows. This reads better on light and dark schemes alike and costs nothing to render.

**Contrast is a merge gate, not a preference.** Body text ≥ 4.5:1, large text ≥ 3:1 (≥ 24px, or 18.66px bold), non-text UI and meaningful graphics ≥ 3:1. Compute these; do not judge them by eye. AAA raises the first two to 7:1 and 4.5:1 if you want headroom.

**Never let colour be the only carrier of meaning.** This is WCAG 1.4.1 and it is the rule most often broken in dashboards. Section 6 covers what to do instead.

---

## 2 · Type

**Use the system stack.** Neither vendor's typeface is available to you — Apple's licence restricts San Francisco to mockups of Apple-platform interfaces and it won't render on Windows or Android; Google's brand face isn't openly licensed. The system stack renders each platform's native face at zero download cost:

```css
font-family: system-ui, -apple-system, "Segoe UI", Roboto,
             "Helvetica Neue", Arial, sans-serif;
```

**Size in `rem`, never `px`.** Both platforms let users scale text globally — Apple calls it Dynamic Type, Android exposes a font scale — and `px` breaks that promise. The web equivalent is respecting the user's base font size and staying legible at 200% zoom (WCAG 1.4.4).

**Name roles, then size them.** Material names display / headline / title / body / label, each in large, medium, small. Apple names Large Title, Title 1–3, Body, Callout, Caption. Either taxonomy works; what matters is that the scale is a closed set of tokens and nothing in the codebase sets a size outside it.

**Monospace earns specific jobs**: identifiers, timestamps, hashes, anything the reader might compare character by character. It is not a decorative choice.

---

## 3 · Space and shape

**8px grid, with a 4px sub-grid for icons and type.** Google's spacing system, and it transfers directly. Both vendors converge on minimum touch targets: 44×44pt (Apple), 48×48dp (Google). WCAG's AA floor is only 24×24 CSS px with adequate spacing, and 44×44 is AAA — use 44 to 48 and you clear every threshold without thinking about it.

Units translate cleanly. Apple's pt and Google's dp are both density-independent; 1dp is roughly 1 CSS px at 1× density.

**Radius is a token, and it is never zero.** Apple's formal concept here is continuous corner curvature — a curve whose radius eases rather than switching abruptly from straight to arc. CSS `border-radius` draws a circular arc, which is a visibly different shape. For most surfaces the difference doesn't matter; where it does, `clip-path` or an SVG mask gets you the real curve at the cost of maintainability. Decide once, per surface type, and put it in a token.

---

## 4 · Depth

**Two mechanisms, and they are not interchangeable.**

Translucency — `backdrop-filter: blur()` — separates a floating layer from content moving behind it. It is expensive to render and it degrades badly on weak hardware, so it needs a solid-colour fallback and a strict budget. Two translucent surfaces on screen at once is the ceiling; beyond that the effect stops reading as depth and starts reading as fog.

Tonal elevation — stepping surface colour, optionally with a light shadow — separates stacked panels that don't move independently. It is nearly free to render and it works everywhere. This is the default; reach for translucency only when something genuinely floats.

A **scrim** is the translucent overlay that dims content behind a modal or sheet. It is not decoration: it is what tells the user the layer beneath is inert.

---

## 5 · Navigation

**Three to five primary destinations.** Both systems land here independently — Apple's tab bar and Google's navigation bar both specify 3–5. Below three, the navigation is doing no work. Above five, the user has to remember where things live before they can look for them, which is the failure mode that turns a tool into a filing cabinet.

**Rail on wide screens, bar on narrow.** Google's navigation rail sits on the side for larger viewports; Apple uses a sidebar on iPad and Mac. Both collapse to a bottom bar on phones. The threshold is a layout decision, not a doctrinal one.

**Icon and label together, never either alone.** An unlabelled icon strip is a memory test. A label-only list wastes the scanning speed an icon buys you. Both, always.

**Mechanics that are not optional:** a real `<nav>` element, `aria-current="page"` on the active destination, visible `:focus-visible` rings, logical tab order, and — this is WCAG 2.4.11, added in 2.2 — sticky chrome must never fully obscure the element that currently has focus.

**Group destinations when they belong to different concerns.** A visible rule between groups tells the reader that moving between them is a change of mode, not just a change of page. Two groups is usually the most a rail can carry legibly.

---

## 6 · Showing state

The section neither vendor writes, because both assume you are showing two states. Operational interfaces routinely show four or five, and that changes the rules.

**Two states can lean on colour and position.** A switch, a checkbox, a filled versus outlined button — the affordance itself carries the meaning and colour reinforces it.

**Three or more states need three carriers: shape, word, and colour.** The icon must differ in *outline shape*, not merely in fill or hue, because shape is what survives both greyscale rendering and the common forms of colour blindness. The word must be present, not on hover. Colour comes last and adds nothing that the other two haven't already said.

**The greyscale test settles arguments.** Screenshot the view, desaturate it, and read every status. If any state becomes ambiguous, the state design is broken regardless of how it looks in colour. This is WCAG 1.4.1 made concrete.

**Avoid red-and-green as the only distinction.** It is the most common colour vision deficiency and there is never a reason to rely on it.

**Lines are harder than fills.** A 1–2px line is already near the 3:1 floor for non-text contrast, so encoding state in line colour alone is unreadable for a meaningful fraction of users. Vary the **dash pattern** and label the line. On a diagram with four edge states, that means four visibly different stroke treatments plus four visible labels — and the labels are what people actually read.

**Absence is a state and needs a rendering.** "We don't know" and "this doesn't exist" are different from "this is broken," and collapsing them into one grey line loses the distinction that matters most in a tool whose job is telling you what is real. Give unknown its own treatment and its own word.

---

## 7 · Density

**Choose the form from the question the reader is asking.**

- *How does A reach B?* → a diagram. Relationships are the content.
- *Which of these needs my attention?* → a ranked list. Order is the content.
- *How do these compare?* → a table. The cross-product is the content.

**A diagram stops working around a dozen nodes.** Five typed nodes with labelled edges is legible and worth drawing by hand. Twelve becomes a hairball, and at that point a from/to matrix conveys the same information faster. If you find yourself adding a force-directed layout to make a diagram readable, the diagram is the wrong form.

**A table earns its place when the reader scans for one row**, or compares more than about four items across more than about three attributes. Below that, a list is faster.

**Five items is the ceiling for a ranked list.** Past that, ordering stops being perceptible and the list wants to be a table with a sort.

**Position is the strongest signal you have.** Do not fight rank order with size or colour — two competing hierarchies read as no hierarchy. If the top item needs to look more urgent than the second, the ranking is already saying that; let it.

**One repeated unit is what makes a dense screen legible.** Every variation in the card, row, or block costs the reader a re-orientation. Eight card styles is the same as no card style. Design one unit properly, use it everywhere, and let content vary inside it.

**A ranking must show its reason.** An ordering the reader cannot interrogate reads as arbitrary, and arbitrary is the fastest way to lose trust in a tool that exists to tell people what to do next. Expose the inputs, even if only on expand.

---

## 8 · Motion

**Google moved to physics.** Material's current motion system specifies springs — damping and stiffness — rather than fixed duration-and-easing pairs, with separate spring families for spatial movement and for effects like colour and opacity. Apple's guidance stays restrained and, under its current material, has surfaces respond subtly to device motion.

**On the web, CSS transitions with tokenised durations and easings are the practical implementation.** Spring physics is achievable but rarely worth the complexity for interface motion at this scale.

**Gate everything behind `prefers-reduced-motion`.** Not a nicety — for some users, motion causes nausea. The reduced-motion path should still communicate state change, usually via an instant swap rather than no feedback at all.

---

## 9 · Components

**Ship a small set and use it everywhere.** Eight components covers most interfaces: button, input, select, dialog, sheet, card, table row, and status indicator.

**Three button styles, no more.** Primary (filled), secondary (tonal or outlined), and text. Material also documents elevated and filled-tonal variants, and Apple's platform sets differ between UIKit and SwiftUI — none of that transfers, and a fourth style on the web mostly creates ambiguity about which one means what.

**No floating action button.** It is an Android pattern that solves a thumb-reach problem specific to phones, and on a dense desktop interface it competes with the content it floats over.

**Dialogs versus sheets.** Apple distinguishes alerts (app-initiated, critical, ideally two buttons at most) from action sheets (user-initiated, rising from the bottom). Material distinguishes dialogs from bottom sheets. The web mapping: `<dialog>` or `role="alertdialog"` for anything critical or destructive, with a focus trap, a scrim, and ESC to close; a modal sheet with swipe-to-dismiss on mobile where a dialog would feel heavy.

**Switches are checkboxes with a role.** `<input type="checkbox" role="switch">`, always labelled, target sized to 44–48px.

---

## 10 · Feedback and confirmation

**Transient messages go in a polite live region.** Material calls the component a snackbar — brief, auto-dismissing, at most one action. On the web that means an `aria-live="polite"` region, pausing on hover and focus, and — the rule people skip — **never the only path to the information**. If a message matters, it exists somewhere the user can go back to.

**Confirmation is for consequence, not for friction.** A confirm dialog on a destructive or irreversible action is respect for the user. A confirm dialog on a reversible one is an obstacle. If the action can be undone, prefer undo.

**Errors say what happened and what to do.** Not a code, not an apology. The sentence should name the thing that failed and the next action available.

---

## 11 · The accessibility floor

Merge gates. These are checked by measurement, not by inspection, and a failure blocks the merge.

- Contrast: body ≥ 4.5:1, large text ≥ 3:1, non-text UI and meaningful graphics ≥ 3:1 (WCAG 1.4.3, 1.4.11).
- Colour is never the sole carrier of meaning (1.4.1) — verified by the greyscale test in section 6.
- Targets 44–48px (1.4.11 floor is 24×24; 2.5.5 AAA is 44×44).
- Type in `rem`; layout survives 200% zoom (1.4.4).
- Visible `:focus-visible` on every interactive element; logical tab order; focused element never fully hidden by sticky chrome (2.4.11).
- All motion gated behind `prefers-reduced-motion`.
- Semantic HTML throughout — real `<nav>`, `<main>`, `<button>`, real headings and labels. This is the web equivalent of Apple's accessibility traits, which describe how an element reports itself to a screen reader.

Build to **WCAG 2.2**. WCAG 3.0 is an early working draft and is not expected as a Recommendation before roughly 2028; designing against it now is designing against a moving target.

---

## 12 · Machine legibility

Making a site legible to agents and crawlers is worth doing. The label is unsettled — "machine experience" and "agentic experience" are both recent coinages rather than governed standards — so build the substance and skip the term.

The substance is mostly the same work as accessibility: **semantic HTML** so structure is parseable, **Schema.org structured data via JSON-LD** so relationships are explicit, and — if agents are a real audience for the project — `llms.txt` and MCP affordances.

---

## 13 · Methods

Context for how the two organisations work, not build instructions.

**HEART** — happiness, engagement, adoption, retention, task success. Google's framework, from Rodden, Hutchinson and Fu (CHI 2010), paired with goals → signals → metrics. The right tool for post-launch instrumentation; premature before there are users.

**The GV design sprint** — map, sketch, decide, prototype, test across five days (Knapp et al., *Sprint*, 2016). Well suited to validating an interface with non-technical users before committing to a build.

The familiar contrast — Apple top-down and design-led, Google bottom-up and data-driven — is a heuristic about emphasis rather than a real binary. Google's most recent system update was its most heavily researched ever, at 46 studies and over 18,000 participants; Apple validates extensively too. Treat the dichotomy as a way of remembering each organisation's centre of gravity, not as a description of their process.

---

## Appendix A · What doesn't transfer to the web

Real, documented, and unusable here. Collected so nobody reaches for them mid-build.

| Thing | Why it doesn't transfer |
|---|---|
| **San Francisco** (SF Pro, SF Mono, SF Compact, SF Pro Rounded, New York) | Licence permits mockups of Apple-platform interfaces only; won't render on Windows or Android. Use the system stack. |
| **SF Symbols** — 7,000+ icons, nine weights, three scales | Not licensed for web use. Pick a permissively licensed SVG set and match its weight and optical size across the whole set. |
| **Continuous corner curvature** | CSS `border-radius` is a circular arc, not the same curve. Approximate, or use `clip-path`/SVG where it genuinely matters. |
| **Apple's translucent material tiers** (Ultra Thin through Chrome, plus Vibrancy) | No CSS equivalent. `backdrop-filter: blur()` with a solid fallback and a hard budget is the whole toolkit. |
| **Apple's button sets** — UIKit (Plain, Gray, Tinted, Filled) and SwiftUI (`.plain`, `.bordered`, `.borderedProminent`, `.glass`, `.glassProminent`) | Platform APIs. Neither set maps to web components; define your own three. |
| **Dynamic colour from wallpaper** | The Android feature has no web analogue. Here the seed is one brand colour, chosen once and hand-checked for contrast. |
| **Spatial interface patterns** (visionOS ornaments, eye-tracking focus) | Irrelevant to a 2D interface. Raw gaze data is never exposed to apps in any case. |
| **Material's five-variant button system and shape-morph library** | Documented for Material's own component implementations; on the web, importing the full variant set creates ambiguity rather than expressiveness. |
| **Google Stitch** | Real — Google Labs, Gemini-powered, generates UI and front-end code, exports to Figma. Experimental and unstable. Useful for ideation, never a dependency. |
| **Apple's New Product Process (ANPP)** | A real internal product-development process, but documented through reporting rather than by Apple, and it governs product development rather than interface design. Context, never a citation. |

---

## Appendix B · Naming, kept straight

Terms that are easy to get wrong, and the versions that are correct.

- **Material You** is the brand; **Material Design 3** is the corresponding system generation. **Material 3 Expressive** (2025) is an evolution of M3 — explicitly *not* "Material 4."
- Google's colour engine is **dynamic colour via Material Color Utilities**, in the **HCT** colour space. "Monet" is an Android open-source codename, not the official name.
- Apple's current material is **Liquid Glass**, described officially as reflecting and refracting its surroundings. Apple's OS versions jumped to a model-year scheme in 2025 — iOS 18 was followed by iOS 26.
- **Squircle** and **superellipse** are informal nicknames. Apple's formal term is **continuous corner curvature**.
- Material's transient-message component is a **snackbar**, not a toast.
- A **scrim** is the dimming overlay behind a modal. There is no such thing as an "intelligent scrim."
- SwiftUI's current action-sheet API is **`confirmationDialog`**.
- Thirteen tones describes a **single palette**; a full Material scheme derives **five key colours**, each with its own thirteen-tone palette.

---

## Changelog

**v2.0 — 2026-07-29.** Restructured from vendor-comparison into decision-order. Apple and Google now appear as inputs to each decision rather than as separate chapters. Added section 6 (showing state) and section 7 (density), which the earlier versions did not cover and which the operational interfaces in this project depend on. Consolidated all non-transferable platform features into Appendix A, removing the inline correction notes that previously hung off individual claims. Moved the per-claim verification labels and the corrections ledger out of the body — the ledger is preserved below. Body text rewritten throughout; the underlying facts are carried forward unchanged from the source-verified v1.0.

**v1.0 — 2026-07-07.** Restructured from the pre-QA source draft into the project-knowledge edition: comparative structure by vendor, per-claim verification labels, and a corrections ledger as Appendix A.

### Corrections carried from the v1.0 ledger

Applied to the pre-QA source draft. Retained because several of these are errors a language model will reproduce from training data unless explicitly corrected. **Do not re-litigate these.**

*Provenance note: the pre-QA draft is reported to be in the same Google Drive as v1.0 (`design-field-manual-project-knowledge.md`, doc id `1Y5EG1FXqwDsl3cJufAHmFNvVsWotK5yjYLob_bNXwjU`, created 2026-07-07). Title and full-text searches of the connected Drive on 2026-07-29 returned only v1.0, so the draft's document id is unconfirmed and should be filled in here by hand.*

**Fabricated terminology, removed:**
- "Optical Refraction" is not Apple nomenclature. Apple's language is that the material reflects and refracts its surroundings.
- "Intelligent Scrim" is not Google nomenclature. The documented term is **scrim**.

**Mislabelled or stale, corrected:**
- "Monet" was presented as Google's official colour engine name; it is an AOSP codename.
- SF Symbols was given as "over 6,000"; the current figure is over 7,000.
- Apple's button set was given as UIKit-only without noting the SwiftUI set or that neither maps to the web.
- "Squircle" was presented as Apple's term rather than an informal nickname.
- Thirteen tones was described as deriving from one seed; it describes one palette, and a full scheme derives five key colours each with its own palette.
- The document was framed as "2026 best practices"; these are 2025-shipped standards verified current in 2026.
- A "diamond" FAB shape was asserted as a named Material variant. Unconfirmed — the documented changes are the FAB Menu and a 35-shape morph library.
- "MX (Machine Experience) Design" was presented as an established discipline; it is a recent coinage competing with "AX (Agentic Experience)."

**Verified but requiring a qualifier:**
- Google Stitch is real, and experimental — never a dependency.
- Apple's New Product Process is real, sourced from reporting rather than Apple documentation, and governs product development rather than interface design.

**Artefacts removed:** stray "Export to Sheets" lines left behind by Google Docs export.

Everything else in the source draft — type stacks, units, 44/48px targets, navigation patterns, HEART, the GV design sprint, WCAG 2.2 criteria, Material token syntax, and the switch, dialog, and snackbar terminology — verified accurate and carried forward.
