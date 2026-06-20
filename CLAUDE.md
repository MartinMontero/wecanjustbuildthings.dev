# CLAUDE.md — wecanjustbuildthings.dev

Astro Starlight site on Cloudflare that guides non-developers through
agentic software development. Four components share ONE client-side build-session
object: Build Studio, Mentor Engine, Skills Creator, Catalog. Plus a Hosting Cost
Estimator module and a dataset-backed catalog pipeline (Astro 6 Content Layer Zod
schema, 1,355 catalog entries).

## Non-negotiable constraints — YOU MUST follow these every session

1. MODEL-FREE "PATH A". The deployed platform makes ZERO inference/LLM API calls,
   with EXACTLY ONE permitted exception: the single deterministic structured-
   reflection step. NEVER add a new runtime inference/LLM call anywhere. If you
   find one beyond the permitted exception, flag it — do not add more.

2. VENDOR EXCLUSIONS. NEVER add dependencies, SDKs, endpoints, fonts, or
   references from Meta, OpenAI, or xAI. GOOGLE IS EXPLICITLY PERMITTED (Google
   Fonts, Analytics, reCAPTCHA, Maps, OSV-Scanner, Lighthouse). ONLY Meta/OpenAI/
   xAI are excluded.

3. CLOUDFLARE-NATIVE. Stay on Cloudflare Pages + existing D1/KV/R2/Workers
   bindings. NEVER propose migrating off Cloudflare. (Astro is now a Cloudflare
   company — prefer native features: built-in hash-based CSP, Secrets Store,
   bindings.)

4. PRESERVE `operational_advisory`. This blocking CI check MUST NOT be weakened,
   disabled, or bypassed. New CI steps must be ADDITIVE only (new workflow files).

5. EDITORIAL/ENGINEERING STANDARDS. Primary sources only. ZERO fabrication. ZERO
   inference of facts (file paths, env var names, config values, behavior). When
   information is missing or ambiguous, STOP AND ASK — never guess.

## Stop-and-ask triggers — halt and ask the human
- A task would require guessing missing or ambiguous information.
- A change would weaken or bypass `operational_advisory`.
- A change would add a Meta/OpenAI/xAI dependency, or a new runtime inference call.
- Any migration off Cloudflare is implied.
- A change would weaken, disable, or bypass the i18n freshness or security-gate
  checks (treat them like `operational_advisory` — additive only).
- A new locale would be added to the live `locales` config (governance-gated:
  requires a steward + reviewer per TRANSLATING.md).

<!-- Build commands, scripts, and project layout: run `/init` to populate these
     from the actual repo, then keep them current here. -->

## What this is & where things live (consolidated from the former `Claude.md`)

- AUDIENCE: end users are NON-DEVELOPERS; contributors are technical. Every feature must
  empower the builder, augment their ability, and protect their privacy and security.
- It drives **Goose** — the AAIF / Linux Foundation open-source agent runtime
  (`github.com/aaif-goose/goose`, docs `goose-docs.ai`) — as a USER-FACING runtime. Goose
  runs on the USER's machine with the USER's own model + keys; the platform only hands it a
  recipe. `goose serve` / ACP-over-HTTP / the TS SDK are experimental and out of scope.
- BYOK is the builder's, not the platform's: each builder brings their own LLM keys (used
  only in their own Goose) and their own Nostr / Bluesky / GitHub accounts. The platform
  collects, stores, and proxies NONE of them. The only operator-set secrets are the tool's
  OWN identity/infra (see `docs/OPERATOR-RUNBOOK.md`).
- Stack: Astro 6 + Starlight, deployed on Cloudflare (static `dist/` served by an `/api/*`
  Worker, with D1/KV bindings for sign-in). Catalog = Astro Content Layer + the Zod schema
  in `src/schema/catalog.ts`.
- ONE shared client-side build session (`src/lib/build-session.ts`) is read/written by
  Build Studio, Mentor Engine, Skills Creator, and Catalog. Pass typed fields, not history.
- MCP / trust boundary: the Catalog is the trust boundary; generated recipes reference ONLY
  allowlisted, vetted extensions/skills; never surface raw MCP config to non-devs. Rely on
  Goose "Trust & Execute" consent + the extension allowlist + least privilege.
- Recipe serializer + deeplink: `src/lib/goose-recipe.ts`, `src/lib/goose-deeplink.ts`.
  Always assert a deeplink starts with `goose://recipe?config=` and round-trips.
- Every reusable workflow ships TWICE: a Claude Code skill (`skills/<n>/SKILL.md`) AND a
  Goose recipe (`goose-recipes/<n>.yaml`). Touch one → touch the other.
- Workflow discipline: plan → execute in vertical slices; checkpoint before a large
  refactor; run typecheck + tests after each change; keep changes minimal and scoped.
- Interactive islands are **Svelte, never React**.

## Internationalization (i18n) & translation governance

Multi-language support is Starlight native i18n (human-first, authoritative
translations) plus a Git-based freshness + governance layer. That layer is pure
Node and static rendering: it adds NO runtime dependencies and NO inference, so it
sits inside constraints 1 (Path A) and 2 (vendor exclusions) — do not add
dependencies to it. The reader banner is server-rendered with no client JS, so it
is compatible with the hash-based CSP (constraint 3). The two i18n CI workflows
are ADDITIVE new files per constraint 4 and MUST NOT modify, weaken, or be merged
into `operational_advisory`.

**Locale config**
- Default/root locale is `en`, served with no `/en` prefix; English source pages
  live directly under `src/content/docs/`. Translations live at
  `src/content/docs/<locale>/<same-path>`. If this changes, flip
  `rootLocaleHasNoPrefix` in the i18n scripts and the banner component.
- The locale list appears in astro.config, the three i18n scripts, and
  `TranslationStatus.astro` (`KNOWN_LOCALES`) — ideally consolidated in
  `src/config/i18n.mjs`. Keep every copy in sync; drift silently breaks the banner
  and the gates. Per constraint 5, never guess this list — read it.

**Translation provenance (freshness)**
- Every translation page carries `source_commit` (the English source's Git SHA it
  was translated from) and `last_verified` in frontmatter. English source pages
  are not stamped.
- After creating or updating a translation, verify it against the CURRENT English
  source, then stamp it (never hand-edit `source_commit`):
  `npm run i18n:stamp -- src/content/docs/<locale>/<path>`
- CI hygiene (`scripts/i18n-freshness.mjs --mode=hygiene`) blocks a PR whose
  CHANGED translations are unstamped, orphaned, or malformed. Editing an English
  page is never penalized — it only flags its translations stale for re-check.
- `src/data/i18n-status.json` is generated by the freshness script at build time
  (via the `build` script) and is gitignored. The banner imports it tolerantly; a
  missing file must never break the build.

**Reader banner** (`TranslationStatus.astro`, a PageTitle override)
- Stale translation → caution notice ("N changes behind") linking to English.
  Untranslated page shown as English fallback → a softer note. Fresh pages,
  default-locale pages, and the `unstamped` state show readers nothing
  (`unstamped` is internal hygiene — never surface it).

**Security-sensitive pages**
- Set `security_sensitive: true` in frontmatter on the ENGLISH SOURCE page only;
  translations inherit it. Any PR touching such a page (or a translation of one)
  requires 2 approving reviews, enforced by the security-gate workflow
  (`scripts/i18n-security-gate.mjs`). Treat key handling, self-custody, and threat
  guidance as security-sensitive.

**Governance**
- Roles (suggester → reviewer → steward), the language-opening gate (steward + N
  reviewers before a locale goes live), and conflict resolution live in
  `TRANSLATING.md`. `.github/CODEOWNERS` scopes review by locale; each locale team
  owns its register and glossary — do not override a team's linguistic choices.
- Never translate protocol/product terms (Nostr, relay, Cashu, zap, command
  names); they stay in English across all locales.
