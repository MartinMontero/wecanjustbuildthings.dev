# Builder OS Console — Build Spec (design snapshot — VERIFY against live repo)

**Status:** v1 · drafted 2026-07-29. Sibling to `docs/admin-panel-spec.md` — same Worker, same admin auth, separate phase numbering so neither document's sequencing carries the other's concerns.

**Scope decision (ruled):** read-only in v1. No writes to any repo, no staging path, no PR creation. Write-back is deferred to v2 and specified only as an interface note at the end.

**Access decision (ruled):** admin-only. Not visible to ordinary signed-in visitors. This surface shows what is unbuilt, what is blocked, where live state has drifted from committed code, and which declared integrations have no implementation behind them. That is a map of where the project is weakest, and it does not belong on a visitor-authenticated route.

---

## Objective

One screen that answers, from live repository state: **what needs attention, in what order, and how do the four Builder OS components actually connect.**

The four components and the question each owns:

| Repo | Role | Question |
|---|---|---|
| `wecanjustbuildthings.dev` | The Architect | What should we build? |
| `holmes` | The Detective | What is true? |
| `Alfred` | The Builder's memory | How do we execute? |
| `gooseclaw` | Fiduciary agent runtime | (greenfield — one commit against a seven-crate design) |

`goose` is the hands and is an external dependency, not a component.

The plan of record already exists as maintained markdown in those repos — `ROADMAP.md`, `BACKLOG.md`, `PLAN.md`, `INTEGRATION_PLAN.md` (WCJBT); `LOOP.md`, `LOOP-DESIGN.md`, `LOOP-INTEGRATION.md`, `alfred-holmes-integration-brief.md` (Alfred); `LOOP.md`, `STATE.md` (holmes). **This console reads those files. It does not replace them and it is never a second source of truth.** Git stays canonical.

---

## Reconciliation with the live repo (READ THIS — do not rebuild what exists)

Verified against the repo and the live Cloudflare account on 2026-07-29:

- **The Worker exists.** `wrangler.jsonc` → `name: wecanjustbuildthings`, `main: worker/index.ts`, assets from `./dist`, `run_worker_first: ["/api/*"]`. Hand-rolled router. Do not add `@astrojs/cloudflare`; `output: 'static'` stays.
- **Admin auth exists and is tested.** `worker/admin/{router,session,roster,roles,allowlist,coordinator,staging,types}.ts`, routes under `/api/admin/*`, `ADMIN_SESSIONS` KV, `wcjbt-admin` D1, `AdminCoordinator` SQLite Durable Object, three test files in `worker/tests/`. **Reuse the existing session guard verbatim. Do not write a new auth path.**
- **An authenticated GitHub client exists** at `worker/index.ts:254` — bearer token, `application/vnd.github+json`, UA set. Reuse the shape; do not reuse the token (see Hard constraints).
- **A staging/review workflow exists** — `/api/admin/staging/{create,get,update,abandon}` against `ADMIN_DB`. Not used in v1; this is the v2 write-back path.
- **Design tokens exist** at `src/styles/tokens.css` (referenced in `DESIGN.md` §2 as lines 86–126). Read the file; do not approximate the names.
- **Islands are Svelte 5** (`svelte ^5.56.3`). Never React.
- **The console page exists** at `src/pages/console/index.astro` with `AdminConsole.svelte`, standalone CSP by deliberate constraint. Keep that constraint intact.
- **Rate limiting exists** — `AUTH_RATE_LIMITER` (native, per-colo, in-memory, 20/60s) and CSRF/lock coordination in `ADMIN_COORD`.

**Do not provision anything already provisioned.** Live account state: Workers — `wecanjustbuildthings`; D1 — `wcjbt-auth`, `wcjbt-admin`; KV — `SESSIONS`, `ATPROTO`, `ADMIN_SESSIONS`.

---

## Hard constraints (from `CLAUDE.md` / `POLICIES.md` — non-negotiable; read them live)

- No Meta / OpenAI / xAI dependencies or model providers. Google, Mistral, Ollama, MiniMax, Anthropic permitted. `npm run enforce` on anything new.
- No runtime LLM or inference in this surface. Ranking and drift detection are deterministic and explainable, not a model call.
- Svelte, never React. Cloudflare-native, no migration off it.
- AGPL. One logical change per commit. Stop and ask on ambiguity.
- **Zero fabrication.** Every version or API claim needs a primary source and an as-of date. Unverifiable → say so. Drifted pin → flag it, never silently fix it. This applies to the console's own output: a value the console cannot derive changes the label, it does not render a placeholder.
- **Rule 9 — consent before consequence.** No commit, push, remote creation, deletion, spend, or publish without explicit human go-ahead. v1 has no write path at all, which is the strongest form of this.
- Supply chain: Syft SBOM + OSV-Scanner + Grype + cargo-deny. **Trivy is banned** (CVE-2026-33634). Pin every GitHub Action to a full commit SHA.

### Security requirements specific to this surface

1. **A dedicated read-only GitHub credential.** Fine-grained personal access token, `Contents: read` only, scoped to exactly the four repositories, no organisation scope, explicit expiry. Stored as a Worker secret (`BUILDEROS_GH_TOKEN`), never in `wrangler.jsonc`. **Do not reuse the existing GitHub OAuth token** — that flow includes `/api/github/create`, so its credential can write. Binding a read-only dashboard to a write-capable credential means a stolen admin session inherits write access it never needed.
   *If the ruling is instead to reuse the existing token, that is a deliberate widening of blast radius and must be recorded as its own decision.*
2. **Admin guard on every route**, using the existing `worker/admin/session.ts` guard. No route in this feature is reachable by a visitor session. No unauthenticated route, including health or debug.
3. **Cache only what the repositories already publish.** All four are public; the cache holds nothing that is not already world-readable. Short TTL (start at 300s), explicit key namespacing, no secrets, no derived credentials.
4. **Rate-limit the refresh path** via the existing `ADMIN_COORD` pattern. A dashboard that fans out to four repositories on every load is an amplification vector if left unbounded.
5. **No indexing.** `noindex` on the route; the console path stays out of the sitemap.
6. **Log admin reads** to the existing audit path if one exists; if none exists, note it as a gap rather than inventing a parallel log.

---

## Tech choices (as researched ~July 2026 — VERIFY current before installing)

- **Runtime:** existing hand-rolled Worker router. New module directory `worker/builderos/` mirroring the shape of `worker/admin/`.
- **Storage:** one new KV namespace, `BUILDEROS_CACHE`. **No new D1 in v1** — there is no mutable state to hold. If v1 appears to need D1, that is a signal the read-only ruling has been violated; stop and ask.
- **UI:** Svelte 5 island mounted from a new page under `src/pages/console/`. Tokens from `src/styles/tokens.css` only — no raw hex, no off-scale rem values, no `--sl-*` variables.
- **Charts/diagram:** the integration map is five nodes. Hand-rolled SVG. Do not add a graph library for this.
- **Markdown parsing:** the planning files are structured but not schema'd. Parse defensively; a file that does not match the expected shape yields `unknown`, never a guess.

---

## Design canon (governs; outranks model priors)

Read all three before writing UI:

1. `DESIGN.md` (repo root) — the executable spec.
2. `docs/design-field-manual.md` — Apple HIG × Google Material, source-verified. **Appendix A is a corrections ledger marked do-not-re-litigate; read it before asserting anything about either system.**
3. `Alfred/docs/decisions/0006-brand-bible-precedence.md` and `Alfred/LOOP-DESIGN.md` passes 4–9.

Settled, do not re-open:

- **The receipt is the signature element** (`DESIGN.md` §1). One visual language for every trust moment: stamped edge, status carried by **icon + word + colour together and legible in greyscale** (WCAG 1.4.1), evidence inline, and a plain-verb sentence a non-developer can act on. Every gate verdict, integration edge, and drift finding here is a trust moment. Do not invent a second card language.
- **Boldness is spent on the trust moment and nowhere else.** Everything else stays quiet.
- **Two registers** (ADR-0006 §3): workshop = warm brass, `--accent: #b8863d` canonical (`#C59B5F` not adopted); lab = muted steel, never glowing. Not collapsible into one room. Planning surfaces are workshop; evidence surfaces are lab.
- **No magic, no auras, no AI-glow states.** Smarts over sentience. Cosmic purple `#7A42B8` prohibited in-app.
- **Mono is mandatory for badges and timestamps** (ADR-0006 §4).
- **Confidence bands** (`LOOP-DESIGN.md` line 27): high ≥ 0.75, mid ≥ 0.40, else low; absent or malformed → **unknown, never fabricated**.
- **Never overclaim in a label.** Alfred's P6-1 changed "Pick up where you left off" to "In your vault" because the data had no timestamp. Change the label, never paper over the absence.
- **Audience register** (`DESIGN.md` §4): plain verbs, sentence case, name what the person controls, one term of art per sentence, define jargon on first use. Developer detail — commit SHAs, file paths, CLI invocations — behind a "for developers" disclosure, never in the primary read.
- **Accessibility floor** (field manual §3): body contrast ≥ 4.5:1, large ≥ 3:1, non-text UI ≥ 3:1; targets 44–48px; type in rem, survives 200% zoom; `:focus-visible` rings; sticky chrome never fully hides the focused element (SC 2.4.11); all motion behind `prefers-reduced-motion`; `<nav>` with `aria-current="page"`.

### Information architecture — four destinations

Both systems converge on 3–5 primary destinations, and Alfred's P5-1 already collapsed a 14-icon strip into a grouped labelled rail. Four, in a left rail, **icon plus short label — never either alone**, steel rule between the groups:

| Destination | Register | Question |
|---|---|---|
| **Today** | workshop | What needs attention, and in what order? |
| **Roadmap** | workshop | What are we building, and what gates it? |
| **System** | lab | How do the parts connect, and what is actually proven? |
| **Record** | lab | What was ruled, what is open, what is at risk? |

**Today is the front door** (Alfred ratified home-first in Pass 6). It holds: one honest sentence of state; a ranked attention list of at most five items, each a receipt showing **why it ranked where it did**; the gates currently waiting on a human ruling; and a resting line per component. Ranking inputs — blocker fan-out, open gates, drift severity, staleness against last commit, explicit rulings in `LOOP.md` — are all visible on expand. A ranking nobody can interrogate is a ranking nobody trusts. No capture box, no greeting: this is an operations surface.

**System** carries the distinction that matters most: an integration edge declared in a planning document with no code behind it is **claimed**, not **proven**. Rendering those identically would be the most misleading thing this console could do. Four edge states — proven (evidence is a file path or commit), claimed (evidence is a plan document only), broken, unknown — distinguished by line treatment and label, not colour alone.

---

## Phased build prompt (paste into Claude Code, in the repo)

```
OBJECTIVE: Build the Builder OS console per docs/builder-os-console-spec.md. Read-only, admin-only,
v1. Reuse what exists; verify before writing code; never fabricate.

CONSTRAINTS (from CLAUDE.md / POLICIES.md / docs/builder-os-console-spec.md — read them live):
no Meta/OpenAI/xAI deps (Google ok); run `npm run enforce` on anything new; no runtime LLM or
inference — ranking and drift detection are deterministic and explainable; Svelte never React;
Cloudflare-native, no migration; AGPL; one logical change per commit; stop-and-ask on ambiguity.
Zero fabrication applies to the console's own output: a value that cannot be derived changes the
label, it never renders a placeholder. Rule 9: v1 has NO write path — not a disabled one, an absent
one. Design canon: DESIGN.md + docs/design-field-manual.md (Appendix A is settled, do not
re-litigate) + Alfred ADR-0006. Tokens from src/styles/tokens.css only — no raw hex.

PHASE 0 — GROUND TRUTH (no feature code): read CLAUDE.md, POLICIES.md, CONTRIBUTING.md, DESIGN.md,
docs/design-field-manual.md, wrangler.jsonc, worker/index.ts, worker/admin/*, worker/auth/guards.ts,
src/styles/tokens.css, src/pages/console/index.astro, src/components/AdminConsole.svelte. Then read
the planning files in the sibling repos (paths supplied by the operator; all four are local):
WCJBT ROADMAP.md/BACKLOG.md/PLAN.md/INTEGRATION_PLAN.md, Alfred LOOP.md/LOOP-DESIGN.md/
LOOP-INTEGRATION.md/alfred-holmes-integration-brief.md/docs/decisions/*, holmes LOOP.md/STATE.md,
gooseclaw CLAUDE.md. Confirm: how the admin session guard is applied per route; the exact token
names in tokens.css; the structure each planning file actually uses. Produce a design note listing
what you found, what you could not parse, and the proposed entity model. STOP for review.

PHASE 1 — READ PATH (server): add worker/builderos/* mirroring worker/admin/*, dispatched from
worker/index.ts under /api/admin/builderos/*, behind the EXISTING admin session guard — no new auth
code. Add KV binding BUILDEROS_CACHE to wrangler.jsonc. Add Worker secret BUILDEROS_GH_TOKEN: a
fine-grained PAT, Contents:read only, scoped to the four repos, with an expiry — do NOT reuse the
existing GitHub OAuth token, which can write. Fetch the planning files via the authenticated client
shape at worker/index.ts:254; cache in BUILDEROS_CACHE with a 300s TTL and namespaced keys. Rate-
limit refresh through ADMIN_COORD. No new D1. Keep existing CSP/_headers intact; add noindex on the
new route. Unit tests for the fetch/cache/guard path. STOP for review.

PHASE 2 — MODEL + DERIVATION (server, pure functions, heavily tested): parse the planning files into
Component / Integration / Initiative / GateEvent / Decision / Risk / OpenQuestion. Confidence bands:
high >=0.75, mid >=0.40, else low; absent or malformed -> unknown, never fabricated. Classify each
integration edge as proven (evidence is a file path or commit), claimed (evidence is a planning
document only), broken, or unknown. Implement the ranking function with every input exposed in its
output — blocker fan-out, open gates, drift severity, staleness, explicit LOOP.md rulings — so the
UI can show why an item ranked where it did. A file that does not match the expected shape yields
unknown and a parse note; it never yields a guess. STOP for review.

PHASE 3 — CONSOLE UI (Svelte 5 island): new page under src/pages/console/, four destinations in a
left rail (icon + short label, never either alone; steel rule between workshop and lab groups;
<nav aria-label="Primary">; aria-current="page"; item height >=52px; collapses to a bottom bar under
640px). Today is the landing view: one honest state sentence, at most five ranked receipts each
showing its ranking reason, gates awaiting a human ruling, one resting line per component. Roadmap
groups by the phase and gate vocabulary already in INTEGRATION_PLAN.md and LOOP.md — not a generic
now/next/later. System renders a five-node hand-rolled SVG map with proven/claimed/broken/unknown
edges distinguished by line treatment AND label, never colour alone; selecting an edge opens its
receipt. Record holds decisions with supersession chains intact, open questions with what they
block, and risks as a likelihood x impact grid. One receipt component reused everywhere. Three
button styles only. Detail panels, not page transitions. Designed empty, zero-result, and error
states for every view. STOP for review.

PHASE 4 — DRIFT: compare committed migrations against live Cloudflare state (READ-ONLY Cloudflare
calls — list and get only, never create/modify/delete); surface planning documents claiming completed
work with no commit behind it; surface drifted version pins. Flag, never reconcile.

PHASE 5 — HARDENING: extend the existing OSV/Grype/Syft/CycloneDX workflows to any new dependency;
do NOT add Trivy; SHA-pin new actions; least-privilege permissions. Verify the accessibility gates
by measurement, not inspection: computed contrast ratios, every status carrier checked in greyscale,
target sizes measured, full keyboard path walked, 200% zoom, prefers-reduced-motion honoured. Report
what failed alongside what passed. Confirm no route is reachable without an admin session.
```

---

## Sequencing & caveats

- **Phases 0–2 carry the risk.** If the planning files parse cleanly and the edge classification is honest, the UI is straightforward. If Phase 0 finds `LOOP.md` too irregular to parse reliably, say so and stop — a console that silently mis-parses the execution record is worse than no console.
- **`gooseclaw` will look broken because it is greenfield.** One commit, three files, against a seven-crate design. The console should render that accurately rather than smoothing it, and the surrounding components' assumptions about that runtime existing are exactly the kind of finding this surface is for.
- **The read-only ruling is load-bearing.** If a phase seems to need D1 or a staging call, the ruling has been violated somewhere upstream. Stop and ask rather than adding storage.
- **Open item:** the ruling on `BUILDEROS_GH_TOKEN` (new dedicated read-only credential vs. reusing the existing OAuth token) was recommended but not explicitly confirmed. This spec assumes the dedicated credential. If reuse is preferred, record it as its own decision noting the widened blast radius.
- **v2 write-back (deferred, interface note only):** proposals would go through the existing `/api/admin/staging/*` path — created as drafts, reviewed by a human, applied as one logical change per commit. No direct writes, ever. Nothing in v1 should foreclose this, and nothing in v1 should implement it.
