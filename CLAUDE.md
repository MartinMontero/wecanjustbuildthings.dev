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
   (The name refers to the protected blocking set: `verify.yml`,
   `security-pr.yml`, `quality.yml` — mapping recorded in `.claude/hooks/guard.py`.)

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
- A new locale would be added to the live `locales` config (governance-gated;
  the TRANSLATING.md charter that will define the steward/reviewer process is
  not yet written — until it is, ALWAYS stop and ask).

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

**What EXISTS (verified in-tree — rely on these):**
- Starlight-native i18n: root locale `en` (no `/en` prefix, English sources
  directly under `src/content/docs/`), `es`, and `ar` (RTL). Translations live
  at `src/content/docs/<locale>/<same-path>`; untranslated pages fall back to
  English. The locale list lives in astro.config — never guess it, read it.
- The catalog-prose translation pipeline (`scripts/translate-catalog.ts`,
  `.github/workflows/translate-catalog.yml`, dispatch-only) and the house
  island i18n pattern (inline `Record<Lang,…>` string tables + `lang` prop +
  `document.documentElement.lang` fallback).
- **Security-sensitive pages — ENFORCED:** set `security_sensitive: true` in
  frontmatter on the ENGLISH SOURCE page only (schema-validated field,
  `src/schema/catalog.ts`); locale variants inherit it by path. Any PR touching
  a flagged page (or a translation of one) requires 2 distinct approving
  reviews, enforced by `.github/workflows/i18n-security-gate.yml` →
  `scripts/i18n-security-gate.mjs` (fails closed: flag honored on base OR head,
  unreadable pages treated as flagged; unit-tested). NOTE: the gate BLOCKS
  merging only once marked Required in branch protection (operator item B4);
  until then a red gate is a loud advisory. Treat key handling, self-custody,
  and threat guidance as security-sensitive.
- The i18n CI is ADDITIVE per constraint 4 and MUST NOT modify, weaken, or be
  merged into `operational_advisory`. It adds no runtime dependencies and no
  inference (constraints 1–2).

**What is PLANNED (not built — do not rely on it, do not fabricate it):**
freshness provenance (`source_commit`/`last_verified` stamps, an `i18n:stamp`
script, `scripts/i18n-freshness.mjs` hygiene CI), the reader banner
(`TranslationStatus.astro`, `src/data/i18n-status.json`), and the governance
layer (roles, the language-opening gate, per-locale CODEOWNERS, a
`TRANSLATING.md` charter — the file does not exist yet; the shipped
`TRANSLATIONS.md` is a status ledger, not the charter). Building the full
layer is its own future effort (BACKLOG B1, gate ruling G2/Option 2). Adding a
new live locale remains governance-gated: stop and ask.

**Register rules that hold today:**
- Never translate protocol/product terms (Nostr, relay, Cashu, zap, command
  names); they stay in English across all locales.
- Do not override a locale team's linguistic choices once teams exist.
