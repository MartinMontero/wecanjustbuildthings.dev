# DESIGN.md — the design elevation, decided before it is built

Status: **PROPOSED — awaiting owner approval at the Phase-2 gate** (with BACKLOG.md).
Everything here is a decision, not an aspiration: each section maps to backlog
items with acceptance criteria. Sources: the Phase-1 audit (`audit/AUDIT.md`),
39 archived screenshots (`audit/screens/`), and the token/component inventory.

## 1. Concept

This project's product is **judgment you can inspect**: license receipts pinned
to commits, verdicts from an enforcement engine anyone can rerun, verification
stamps a fork inherits. The site already owns an honest identity for this — the
"civic workshop": cool green-ink paper, a structural green, one marigold spot,
crop marks and spec rails, a rubber-stamp seal. The elevation is **not a new
identity**. It is finishing the one we have where it currently stops: the
identity today lives in the *chrome* (hero, headings, docs shell) while the
*working surfaces* — the catalog at full density, the checker's verdict, the
Studio's policy gate, the console — still read as default-ish widgets. Those
surfaces are the product's thesis, so that is exactly backwards.

**Signature element: the RECEIPT.** One visual language for every trust moment
— catalog verification badges, license-at-commit lines, checker verdicts
(clean / blocked / chain-to-excluded), the Studio's policy gate, the
enforcement page's verdict band, admin audit views. A receipt is: a stamped
edge (2px structural rule), a status color that is never decorative
(`--ok/--warn/--danger`) **and never the only carrier — icon + word + color,
correct in grayscale (WCAG 1.4.1; SHIP-GATE-R2 rider)** — the evidence inline
(commit SHA, org chain, license id), and a plain-verb sentence a non-developer
can act on. Boldness is spent
here — the blocked-dependency moment should feel like a customs stamp coming
down — and everywhere else stays quiet: paper, ink, structure.

## 2. System (extend, don't replace)

**Palette — unchanged, formalized.** The existing named tokens stay the
canon: `--bg --surface --surface-2 --ink --ink-soft --structure --signal
--edge(-strong) --control-edge --ring` + status pairs `--ok/--warn/--danger
-edge/-text` (`src/styles/tokens.css:86-126`). Additions (new tokens, not new
colors): `--verdict-ok-bg / --verdict-warn-bg / --verdict-danger-bg`
(low-chroma washes derived from the status pairs, both themes) so verdict
surfaces stop improvising, and `accent-color: var(--structure)` set globally
so native controls join the system.

**Typography.** Display stays **Bricolage Grotesque** (self-hosted, subset,
41+18 KB woff2). Body stays the **system stack — as a choice, restated**:
organizers on cheap phones are the baseline user; zero body-font payload is a
feature, and the display face carries the identity. Two gaps close:
(1) **Arabic display**: `/ar/` currently gets no display face at all —
self-host a subset **OFL Arabic face** (candidate: Readex Pro, chosen for its
extended-legibility design brief; final pick + subset size recorded in the
asset plan) wired into `--font-display` under `:lang(ar)`.
(2) The full modular scale (`--step--1..7`) becomes the ONLY sanctioned type
sizes in islands (today islands use ad-hoc rems).

**Spacing / radius / elevation / motion — already exist** (8px grid, radius
scale "never 0", `--dur-1/2`, `--ease-*`). New rule, enforced in review: island
stylesheets may reference **tokens only** — no `--sl-*` vars, no raw hex, no
off-scale rem values. One new elevation token `--shadow-1` replaces the lone
raw box-shadow (`CatalogExplorer.svelte:536`).

## 3. Starlight strategy (sanctioned points only, upgrade path preserved)

- Keep: `customCss` cascade (tokens → theme → components), the five existing
  component overrides, Starlight i18n/locales, Pagefind. Implementation note
  (verified against current Starlight docs): Starlight ships its styles in a
  `starlight` cascade layer — declare `@layer` ordering once so our overrides
  win without specificity wars; the four sanctioned surfaces (customCss,
  component overrides, `head`, `expressiveCode.themes`) cover everything this
  plan needs, no internals forked.
- Add ONE override: **`Footer`** — the only untouched default chrome. Ship a
  designed footer (project promise line, policy/security/contribute links,
  AGPL + "fork me" as identity, locale-aware).
- Tool pages (`/build/`, `/catalog/`, `/check/`, `/build/cost/`,
  `/build/models/`) stay INSIDE the docs shell (sidebar is honest wayfinding
  for non-devs) but gain a shared `.workbench` page class via frontmatter —
  wider content column, tighter lead, tool-first landmark order. No shell fork.
- `/console/` stays standalone (CSP constraint is load-bearing) but **joins the
  token layer**: import tokens.css, replace all raw hex, adopt `.btn`/`.field`.
- Landing: replace the stock `<CardGrid>`/`<Card icon=…>` sections
  (`index.mdx:37-99`) with a bespoke token-native component (working name
  `WorkOrderGrid`) matching the Build Plate's spec-sheet language — Starlight
  content components remain fine for interior docs.

## 4. Audience register (copy is design material)

Rules: plain verbs, sentence case, name what the person controls, one term of
art per sentence max, define jargon on first use — then it may be used.
Applies to: landing tool cards, `/build` `/check` `/build/models` `/start`
intros, the checker verdict copy, and empty/error states in every island.
Examples of the shift (final copy lands in implementation, es/ar in the same
commit as en):
- "run the exclusion policy in your browser with live license lookups" → "we
  check your list against the blocklist, right here on your device — nothing
  is uploaded."
- Checker verdict jargon (`npx tsx enforcement/cli.ts…` in the island) moves
  behind a "for developers" disclosure; the verdict itself speaks
  organizer-first ("2 of 14 tools are owned by companies this project blocks —
  here's the chain of ownership").
- `TODO: confirm` (user-visible in Cost/Compass) becomes a designed
  provenance chip — "unverified — awaiting human check" — same zero-fabrication
  semantics, no placeholder register. (`todoConfirm`, `model-compass/ui/i18n.ts:73`)

## 5. Per-surface intent (current → target)

| Surface | Current (evidence) | Target |
|---|---|---|
| Landing | Build Plate hero ✓, then stock CardGrid/icon cards (`index.mdx:37-99`) | Bespoke WorkOrderGrid in the Plate's spec language; jargon-free card copy |
| Catalog explorer | 1-column flat cards ×60/page (20,562px tall at desktop), native checkboxes in a scroll box, off-token styles | Responsive 1→2→3-col receipt-card grid; designed facet groups w/ counts + `accent-color`; verification status as the receipt language; designed empty/zero-result/error states at full 1,359-entry dataset; locale-aware CTA (`:358`) |
| Checker `/check/` | Verdict = text line + default table; CLI jargon inline; island ignores `lang` (P0) | **The thesis surface.** Receipt-styled verdict band: CLEAN (stamped ok), BLOCKED (customs stamp + ownership chain rendered as a chain), per-row receipts; localized (es/ar) via the house i18n pattern; dev detail behind a disclosure |
| Build Studio | Flow + gate exist ✓; mixed token dialects (`:1355` vs `:1360`); stray English beside its own i18n table (`:1074` etc.) | One dialect (tokens only); policy-gate + receipts inherit the receipt component; every string through `STR`; the .zip moment gets a completion receipt ("what you're taking with you") |
| Cost estimator | All `--sl-*`, raw radii; `TODO: confirm` register | Tokenized; provenance chips; numbers stay honest |
| Model Compass | Hardcoded hex ramp (`:144-152`); English data prose in localized UI; whole registry shipped as eager JS | Tokenized status ramp; caution prose via i18n keys; `client:visible` + consider static-render of the table (island only for filters) |
| Docs + PIE reading | Already designed (ticks, asides, tables) ✓ | No change beyond copy-register pass on first-contact pages |
| Console `/console/` | Raw hex, outside the system (`:470-523`; page `:33-44`) | **Token-compliance of the EXISTING auth screens only** — no feature-room design here (that waits for the owner's PANEL-RESPEC-v2 spec). Stays English (operator surface — documented exception), stays standalone-CSP. `/admin/` (Sveltia CMS) is vendored third-party and explicitly out of design scope |
| Footer (all pages) | Stock Starlight | New Footer override (see §3) |
| Islands, sitewide | 16× `client:load` | `client:visible` where below-the-fold (catalog explorer is above-fold: stays load); measure before/after |

## 6. Kill-list mapping (every audit hit → its replacement)

| Hit (audit ref) | Replacement |
|---|---|
| Stock CardGrid landing sections | WorkOrderGrid (§3) |
| Untouched Footer chrome | Footer override (§3) |
| Dev-jargon first-contact copy (5 pages + checker) | Register pass (§4), es/ar in same commits |
| Catalog single-column card wall + native facets | Receipt-card grid + designed facets (§5) |
| Default verdict table in checker | Receipt verdict band (§5) |
| ModelCompass/CostEstimator/Studio off-token styles | Token-only island rule (§2) + `--shadow-1`, verdict washes |
| `TODO: confirm` as UI copy | Provenance chip (§4) |
| PolicyChecker ignores `lang` (P0) | House i18n pattern applied; es/ar strings shipped |
| BuildStudio/AccountWidget stray strings; catalog CTA locale bug | Moved into `STR` tables; `buildBase` used at `:358` |
| Arabic gets no display face | Self-hosted subset Arabic face (§2, asset plan) |
| All-eager hydration | `client:visible` pass (§5) |
| Plausible third-party origin (opt-in, off) | Unchanged — documented as the only sanctioned, opt-in third party; still zero requests by default |

## 7. Asset plan (all self-hosted)

| Item | Source | License | Size budget |
|---|---|---|---|
| Bricolage Grotesque latin/latin-ext (existing) | in repo (`public/fonts/`) | OFL (in repo) | 60 KB total ✓ |
| Arabic display face, subset (Readex Pro candidate) | Google Fonts source repo → subset locally via fonttools | OFL | ≤ 45 KB woff2 |
| Receipt/verdict iconography | hand-drawn inline SVG (house style, like BottomNav's set) | project AGPL | inline, no files |
| No stock illustration, no photography | — | — | — |

## 8. Performance (budgets are a floor)

Existing CI budgets hold: axe 0 serious/critical; Lighthouse perf ≥ 90, a11y
≥ 95; LCP ≤ 2.5 s; CLS ≤ 0.1 — throttled mobile is the reference profile.
New page-weight ceilings (enforced in verification, measured via the audit
scripts): docs/reading page ≤ 250 KB transferred; tool page ≤ 450 KB
(explorer's `/catalog.json` fetch excluded but measured + reported); landing
≤ 350 KB. Any surface over ceiling gets fixed, never waived. The hydration
pass (§5) must not regress LCP on `/catalog/` (island is the LCP element).

## 9. Non-goals

No IA changes (routes, sidebar order, URL scheme all stay). No new features
beyond the approved BACKLOG.md. No body-font purchase/addition for Latin. No
dark/light re-theming (both themes already tokenized). No console i18n. No
touching hand-authored catalog entries (shakespeare, catalog overview) or any
entry's verification data. `operational_advisory`, the enforcement engine, and
POLICIES.md untouched throughout.

## 10. Self-critique (required before submitting)

- *"Is this just the default for a docs site?"* The docs shell IS Starlight —
  deliberately: reading surfaces benefit from boring. What is NOT default after
  this plan: every trust moment shares one bespoke receipt language, the
  catalog reads like a supply ledger instead of a card wall, the landing's
  feature sections stop being the Starlight template, and the last stock
  chrome (footer) is replaced. If the receipt system were deleted, the site
  would fall back to a themed docs site — that dependency is the point.
- *Revised while writing:* an earlier draft proposed pulling tool pages out of
  the docs shell entirely (app-like, no sidebar). Rejected: the sidebar is how
  non-developers recover when lost, and leaving the shell would fork Starlight
  behaviors we would then maintain alone (search, i18n picker, skip links).
  The `.workbench` class keeps the shell and widens the bench instead.
- *Palette honesty:* the current scheme sits nearest the "dark + accent"
  AI-default family. It escapes the kill list on its own terms — green-tinted
  paper (not neutral black), a two-hue structure/signal system (not a single
  acid accent), documented anti-cream and anti-broadsheet decisions in the
  tokens file — and it is already the shipped identity of this project's OG
  cards, seal, and hero. Replacing it would be redesign theater; finishing it
  is the elevation.
