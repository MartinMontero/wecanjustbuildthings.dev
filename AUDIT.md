# AUDIT.md — wecanjustbuildthings.dev architecture & Path-A audit

**Mode:** read-only / plan. No source files were modified to produce this report.
**Branch:** `claude/kind-albattani-tnycq4`
**Scope:** the four builder components (Build Studio, Mentor Engine, Skills Creator,
Catalog), the shared build-session, the Content-Layer catalog, all LLM-inference
pathways, existing Goose wiring, framework/host config, and vendor-exclusion posture.
**Goal context:** wire the platform to drive **Goose** as a user-facing agent runtime,
while the deployed platform itself stays "Model-free Path A" (zero inference, one
documented exception). Findings only — **no solutions proposed.**

> Note: the project's PreToolUse guard blocks writing the literal excluded-vendor
> API host strings (OpenAI/xAI/Meta). Where those hosts are relevant below, they are
> cited by `file:line` rather than reproduced verbatim. Permitted hosts (Anthropic,
> OpenRouter, DeepSeek, Google) are shown normally.

---

## 1. Architecture map — the four components

All four are Svelte 5 islands (or inline logic within one) mounted into Starlight
`.mdx` pages with `client:load`. Pure logic is factored into `src/lib/*.ts` and
`src/modules/cost-estimator/`. Everything client-side is deterministic.

### Build Studio
The orchestrator; hosts Movements 1–4 and the Skills Creator inline.

| File | Role |
|---|---|
| `src/components/BuildStudio.svelte` (~1,525 ln) | The island: intent → blueprint → skills → handoff. Reads/writes the build session. |
| `src/content/docs/build.mdx:18` | Mount: `<BuildStudio client:load />` (`/build/`); es at `src/content/docs/es/build.mdx:18`, ar under `src/content/docs/ar/…` |
| `src/lib/studio-stack.ts` | Stack eligibility, advisory ranking, `pinnedDependencies` (#3/#4). |
| `src/lib/chemistry.ts` | Tool "chemistry" — capability role-graph pairs/conflicts/order. |
| `src/lib/mentor-engine.ts` | Movement 1 signals/questions/constraints (see below). |
| `src/lib/skill-doc.ts` | Movement 3 `slugifySkill` / `skillToMd` (SKILL.md renderer). |
| `src/lib/build-session.ts` | The shared session object (see §2). |
| `enforcement/matcher.ts` | Imported into the island to **re-verify** the assembled stack in-browser. |

**State:** reads the shared build session on mount (`BuildStudio.svelte:232-252`),
persists every change via a `$effect` (`:283-310`). The downloadable starter
(zip / GitHub / Goose recipe) is assembled in `starterFiles()` (`:806-822`).

### Mentor Engine
| File | Role |
|---|---|
| `src/lib/mentor-engine.ts` | **Pure, deterministic, stateless.** `detectSignals`, `pickQuestions`, `reflect` over a curated trilingual lexicon (`:33-42`) + protocol signals (`:45-50`). No model, no I/O. |
| `src/lib/mentor-engine.test.ts` | Unit tests incl. structural invariants. |

**State:** holds none itself. BuildStudio computes `reflect(signals, answers)`
(`BuildStudio.svelte:547`) and persists the result into `session.converged`
(`:295-296`). The deterministic `reflect()` is what CLAUDE.md calls the
"structured-reflection step"; it makes **no** inference call (see §4 nuance).

### Skills Creator
| File | Role |
|---|---|
| `src/components/BuildStudio.svelte:962-981` | **Inline** Movement 3 UI + capture/dedupe (`captureSkill`, `authoredSkills`, `removeAuthored`). |
| `src/lib/skill-doc.ts` | Pure `slugifySkill` + `skillToMd` (YAML-frontmatter SKILL.md). |
| (external) `github.com/MartinMontero/knowledge-to-skills-pipeline` | Referenced by generated README/skills folder (`BuildStudio.svelte:780`); not in this repo. |

**State:** authored skills live in component state (`authoredSkills`) and are
persisted into `session.skills` (`BuildStudio.svelte:297`). There is **no** standalone
Skills Creator component or route — it is part of Build Studio.

### Catalog
| File | Role |
|---|---|
| `src/content/docs/catalog/**/*.md(x)` | The entries themselves (Content-Layer docs; see §3). |
| `src/content.config.ts` | Collection definition (`docsLoader` + `docsSchema({ extend: catalogExtend })`). |
| `src/schema/catalog.ts` | The Zod frontmatter schema. |
| `src/pages/catalog.json.ts` | Build-time static JSON API at `/catalog.json` (filters to `INDEXED_TYPES`). |
| `src/components/CatalogExplorer.svelte` | Interactive island (search/facets/sort) at `/catalog/` (`catalog/index.mdx:21`). |
| `src/lib/catalog-filter.ts` | Pure filter/facet/sort logic used by the island. |
| `src/components/CatalogList.astro` | Static server-rendered lists (e.g. PIE pages). |
| `data/*.json` + `scripts/build-catalog.ts` | Build-time seeds → catalog md generator (`package.json:19`). |

**State:** the island fetches `/catalog.json` once on mount
(`CatalogExplorer.svelte:237`) and filters entirely client-side. It does **not** use
the shared build session — its only handoff to Build Studio is a URL param
(`?seed=<tool>`, read at `BuildStudio.svelte:271-277`).

---

## 2. The shared client-side build-session object

**Defined in:** `src/lib/build-session.ts` — `interface BuildSession` (`:54-90`).

**Persistence:** **`localStorage`** (not IndexedDB, not a framework store).
- Key: `wcb.build-session.v1` (`build-session.ts:92`).
- Change notification: same-tab `CustomEvent('wcb:session-change')` (`:93`, dispatched in `saveSession` `:161`) + cross-tab `storage` event (`subscribeSession` `:194-206`).
- Defensive load/coerce via `migrate()` (`:120-181`); silent degradation if storage is unavailable (`saveSession` `:158-160`).

**Fields** (`build-session.ts:54-90`):
| Field | Line | Owner / meaning |
|---|---|---|
| `v: 1`, `updatedAt` | 55-56 | schema version + timestamp |
| `movement: 1\|2\|3\|4` | 58 | wayfinding |
| `intent{projectName,problem,goal,success,protocols,answers}` | 60-67 | Movement 1 raw intent + Socratic answers |
| `converged` | 69 | Movement 1 deterministic reflection |
| `adjustments{swaps,removed,extra}` | 71-75 | Movement 2 blueprint edits |
| `stack: SessionStackItem[]` | 77 | Movement 2 resolved tools + receipts |
| `skills: SessionSkill[]` | 79 | Movement 3 authored skills |
| `seededTool` | 81 | Catalog "Build with this" seed |
| `handoff` | 83 | Movement 4 method (`zip\|github\|goose\|kickoff`) |
| `usage?`, `costEstimate?` | 88-89 | Hosting Cost Estimator I/O |

**Readers/writers** (only three modules import it):
- `src/components/BuildStudio.svelte` — read + write (primary).
- `src/modules/cost-estimator/ui/CostEstimator.svelte` — read.
- `src/modules/cost-estimator/core/usage-profile.ts` — write (`usage` / `costEstimate`).

**Components NOT wired to the build session (flagged):**
- `src/components/CatalogExplorer.svelte` — independent; hands off only via `?seed=` URL param, **not** the session object. (So a Catalog→Studio handoff carries a single tool id, nothing else.)
- `src/components/PolicyChecker.svelte` (`/check/`) — fully standalone; no session read/write.
- `src/components/AccountWidget.astro` — uses a **separate** server-side auth session (HttpOnly cookie → KV → D1), unrelated to the client build session.

---

## 3. Catalog inventory (Astro Content Layer)

**Content Layer:** confirmed. `src/content.config.ts` uses Starlight's
`docsLoader()` (a glob/file loader over `src/content/docs/`) with
`docsSchema({ extend: catalogExtend })` — i.e. the Zod schema in
`src/schema/catalog.ts` layered onto Starlight docs frontmatter.

**Counts** (English content; `es`/`ar` catalog dirs contain only an `index.mdx` —
translations not yet generated):
- **2,182** entry files under `src/content/docs/catalog/`.
- **827** of those are datasets (`src/content/docs/catalog/datasets/`).
- **1,354** tool-class entries — authoritative count from `npm run enforce:layer1`
  (`✓ 1354 catalog entries clean`). (1,354 + 827 + 1 index ≈ 2,182.)
- `/catalog.json` ships `INDEXED_TYPES` = tools + datasets (`catalog.json.ts:9-15`).

**Schema fields** (`src/schema/catalog.ts:80-134`, all optional at top level;
conditionally required via `superRefine` `:140-207`):
- Discriminator: `entry_type` (`:82`) ∈ `ENTRY_TYPES` (`:28-40`).
- Dependency: `dependency_name, ecosystem, category, what_it_does, homepage_url, repo_url, registry_url, protocols` (`:85-92`).
- License (accountability core): `license_spdx, license_source_url, license_source_commit_sha` (`:95-97`).
- Maintenance: `maintenance_status, last_release_at, version` (`:100-105`).
- AOS adoption: `aos_repos_using, aos_repos_list` (`:108-109`).
- Nav/i18n: `pie_anchor` (`:112`), `machine_translated` (`:117`).
- Enforcement: `provider_agnostic, verification_status, verification_blocked_reason, origin_advisory, verified_at` (`:120-126`).
- **Recipe contract** (required when `entry_type==='recipe'`): `recipe_type, target_entry, target_entry_slug, excluded_providers_unreachable_when[], verification_steps[]` (`:129-133`, refined `:181-206`).

**How datasets / extensions / skills are represented:**
- **Datasets** — first-class: `entry_type: 'dataset'` (`schema:34`), 827 files, surfaced in `/catalog.json` as `kind: 'dataset'` (`catalog.json.ts:21`). Seed: `data/datasets.json`.
- **Extensions (Goose/MCP)** — **NOT a first-class type.** `ENTRY_TYPES` (`schema:28-40`) has no `extension`. MCP servers exist only as generic catalog **tools** (e.g. `data/agentic-tools.json:1173-1230`, "MCP Ecosystem"). Relevant to the Goose pivot, where extensions are a distinct concept.
- **Skills** — **NOT a catalog type.** No `skill` in `ENTRY_TYPES`. Skills are a build-flow artifact (authored in Build Studio → `skill-doc.ts` → SKILL.md) and a build-time seed (`data/skills-seed.json`); the authoring how-to lives in the external knowledge-to-skills-pipeline.
- **Recipes** — first-class `entry_type: 'recipe'` (`schema:35`) but currently only **2** files under `src/content/docs/recipes/`. These are *provider-lockdown policy recipes* (exclusion exceptions), **distinct** from the Goose run-recipe YAML the Build Studio generates (§5).

---

## 4. LLM inference calls (Path-A check)

**Result: NOT zero.** There is exactly **one** server-side inference pathway,
reached from two client call sites. It is BYOK (the user's key), allowlist-gated,
and appears to be the documented "one permitted exception" — but see the nuance.

**The inference call (server-side, in the Worker):**
- `worker/index.ts:199` — `const res = await fetch(p.url, { ...p.build(model, prompt, apiKey), … })` inside `kickoffHandler` (`:182-207`), routed at `/api/agent/kickoff` (`:463`).
- Provider hosts it can reach (`PROVIDERS`, `worker/index.ts:68-99`):
  - `:70` Anthropic Messages API (`api.anthropic.com`)
  - `:80` OpenRouter chat-completions (`openrouter.ai`)
  - `:90` DeepSeek chat-completions (`api.deepseek.com`)

**Client call sites (same-origin → the Worker brokers; the browser never calls a model directly):**
- `src/components/BuildStudio.svelte:1012` — builds the **MENTOR structured-reflection** prompt (returns JSON `proposals` + `skills`).
- `src/components/BuildStudio.svelte:904` — the **"Try a step with AI" kickoff** handoff (`handoff: 'kickoff'`).

**Excluded-vendor host strings elsewhere are NOT calls** — they are the enforcement
engine's *negative signals* and tests (the OpenAI/xAI host literals live at
`enforcement/excluded-provider-signals.yaml:11,31`, and in
`enforcement/tests/recipe.test.ts:46`, `enforcement/tests/layer3.test.ts:25,33`).

**Nuance / discrepancy to surface:**
- CLAUDE.md's "exactly one permitted exception: the single **deterministic**
  structured-reflection step" is worded ambiguously. In code, the *deterministic*
  reflection is `mentor-engine.reflect()` (`BuildStudio.svelte:547`) and makes **no**
  model call. The actual *inference* exception is the `/api/agent/kickoff` broker,
  which is used for **two** purposes: structured reflection (`:1012`) **and** a
  free-form "try a step" kickoff (`:904`). So the single permitted endpoint backs
  two product features, only one of which is "structured reflection."
- This sits in tension with the new goal ("the platform makes zero inference calls;
  Goose runs inference on the user's machine"). The broker is the lone exception
  today. (Flagged in Gaps & Risks; no fix proposed here.)

---

## 5. Existing Goose integration

**State: partial, recipe-file level — already wired, no deeplink/MCP.**

- **Handoff option:** `handoff` includes `'goose'` (`BuildStudio.svelte:200`), with UI strings "Run it with Goose" / "Download the Goose recipe" / "Copy the run command" (`:43,58-59`, es `:96,111-112`, ar `:149,164-165`).
- **Recipe generation:** `gooseRecipe` derived (`BuildStudio.svelte:733-742`) emits a Goose recipe YAML — `version: "1.0.0"`, `title`, `description`, `instructions: |`, `prompt: |` (the full agent prompt). Bundled into the starter zip as `${slug}.goose-recipe.yaml` (`:814`) and individually downloadable (`:1360`).
- **Run command:** `goose run --recipe ${slug}.goose-recipe.yaml`, shown and copyable (`:1361-1362`).
- **Catalog presence:** Goose is a catalog entry — `data/agentic-tools.json:693-699`, `source_url: https://github.com/aaif-goose/goose`.
- **Docs:** Goose is referenced throughout prose (`astro.config.mjs:99,148`; README `:14,47,171,184`; guides incl. `guides/get-started-with-goose`, `TRANSLATIONS.md:44`).

**Absent today (relevant to the pivot):**
- **No `goose://` deeplink** anywhere (searched `src/`, none).
- **No MCP / extension wiring** in the platform — MCP appears only as catalog *content* (`data/agentic-tools.json` "MCP Ecosystem"), not as integration code.
- The generated recipe is a **static template** (`instructions` + `prompt`); it does not yet encode `extensions:`, `activities:`, `parameters:`, or provider/settings blocks from the Goose recipe schema.
- The provider-lockdown **policy** recipes (`src/content/docs/recipes/`, `entry_type:'recipe'`) are unrelated to the generated **run** recipe — two different "recipe" concepts share the word.

---

## 6. Framework / adapter / build config

- **Astro:** `^6.4.6` (`package.json:44`). *(Note: the task brief said "Astro 5"; the repo is on Astro 6.)*
- **Starlight:** `@astrojs/starlight ^0.40.0` (`package.json:41`). Svelte `^5.56.3`; `@astrojs/svelte ^8.1.2`.
- **Build output mode:** `output: 'static'` (`astro.config.mjs:92`), `trailingSlash: 'ignore'` (`:93`).
- **Cloudflare adapter:** **none.** There is no `@astrojs/cloudflare` adapter and no `adapter:` in `astro.config.mjs`. Instead the site is a **static build served by a hand-rolled Worker**: `wrangler.jsonc` sets `main: worker/index.ts` with a Static-Assets binding (`assets.directory: ./dist`, `binding: ASSETS`, `not_found_handling: "404-page"`), KV (`SESSIONS`, `ATPROTO`), and D1 (`DB`). Static HTML is served by the asset layer (which bypasses the Worker); `/api/*` is handled in `worker/index.ts`.
- **Security headers:** emitted at build into `dist/_headers` via a custom integration (`astro.config.mjs:44-69`); hash-based CSP ships **Report-Only** by default (`:63`), `CSP_MODE=enforce` to enforce.
- **i18n:** root locale `en`, plus `es` and `ar` (RTL) (`astro.config.mjs:106-111`).

---

## 7. AOS vendor-exclusion posture (Meta / OpenAI / xAI)

**Posture: clean — no Meta/OpenAI/xAI used as an inference/model provider; Google permitted.**

- **Dependencies:** no Meta/OpenAI/xAI SDK in `package.json` (`:39-66`). LLM-adjacent deps are only `@atproto/*` and `nostr-tools` (not model SDKs). No `openai`, `@anthropic-ai/sdk` (the broker calls Anthropic over raw `fetch`, not an SDK), `@ai-sdk`, or `langchain`.
- **Broker allowlist** (`worker/index.ts`):
  - Direct providers offered: `anthropic`, `openrouter`, `deepseek` (`:68-99`). **OpenAI and xAI are not offered**, and the error message says so (`:189`).
  - OpenRouter (a gateway to *all* vendors) is constrained by a **default-deny allowlist** `PERMITTED_ROUTER_VENDORS` (`:106-109`) and a hard block `isExcludedRouterModel` (matches the excluded-org vendor segments, `:118-121`), enforced before the call (`:195-197`).
  - **Google is explicitly permitted** — `'google'` ∈ the allowlist (`:107`).
- **Catalog-level exclusion** is enforced separately by the three-layer engine (`enforcement/`, blocking CI gate `verify.yml`) and the `EXCLUDED_PROVIDER_IDS = ['meta','openai','xai','aws','oracle']` registry (`src/modules/cost-estimator/registry/providers.ts:16`), shared by the Model Compass registry.
- **Google services** (Fonts/Analytics/etc.): the only analytics is **Plausible** (opt-in, `astro.config.mjs:74-88`) — not Google. No Google Fonts/Maps/reCAPTCHA found. (Per policy Google is permitted; none is currently wired, so nothing to flag.)
- **Anthropic / DeepSeek** as offered providers are **not** policy violations — only Meta/OpenAI/xAI are excluded.

---

## Gaps & Risks (ranked by severity)

1. **[High · Path-A definition vs. code] The lone inference exception backs two features and overlaps with the Goose pivot.**
   `/api/agent/kickoff` (`worker/index.ts:182-207`, fetch `:199`) is the only inference call, but it serves both the structured-reflection (`BuildStudio.svelte:1012`) and a free-form "Try a step with AI" kickoff (`:904`). CLAUDE.md authorizes *one* "deterministic structured-reflection step," yet the deterministic reflection (`reflect()`) makes no model call — so the wording and the code don't line up, and the "kickoff" is arguably a second use of the exception. As Goose takes over user-facing inference (on the user's machine), this server-side broker's necessity should be re-examined. *(Observation only.)*

2. **[High · Goose readiness] Extensions and skills are not first-class catalog types; the generated Goose recipe is a minimal template.**
   `ENTRY_TYPES` (`schema:28-40`) has no `extension` or `skill`; MCP servers are only generic `tool` entries (`data/agentic-tools.json`). The emitted recipe (`BuildStudio.svelte:733-742`) carries only `instructions`+`prompt` — no `extensions`, `parameters`, `activities`, or provider/settings blocks from the Goose recipe schema. Driving Goose richly will need a representation for extensions and a fuller recipe.

3. **[Medium · Docs accuracy] Stated facts diverge from the code.**
   - Brief/CLAUDE.md imply **Astro 5**; repo is **Astro `^6.4.6`** (`package.json:44`).
   - CLAUDE.md says "~842 YAML entries"; actual is **1,354 tool entries + 827 datasets** (`enforce:layer1`; `find` counts). Entries are Markdown/MDX, not raw YAML.
   - These don't break anything but undermine trust in the written invariants.

4. **[Medium · State coupling] Three islands are not on the shared session.**
   `CatalogExplorer` hands off only a single `?seed=` id (`BuildStudio.svelte:271`), and `PolicyChecker` / `AccountWidget` are fully independent. Any future flow that wants Catalog selections, a policy-check result, or the signed-in identity to travel into the Build Studio has no channel today. (`AccountWidget` is deliberately a *separate* auth session — not a defect, but worth noting it is unrelated to the build session.)

5. **[Medium · CSP] The site-wide CSP is still Report-Only.**
   `astro.config.mjs:63` ships `report-only` unless `CSP_MODE=enforce`. Until promoted, the hash-based CSP is observational. (Collection was made durable earlier in this branch.)

6. **[Low · i18n] Catalog translations are effectively absent.**
   `src/content/docs/es/catalog/` and `…/ar/catalog/` contain only an `index.mdx`; the 1,354+827 entries exist in English only. The Build Studio / Catalog UIs are translated, but entry bodies are not (a `translate-catalog` script exists, `package.json:27`).

7. **[Low · naming] Two distinct "recipe" concepts share the word.**
   Policy provider-lockdown recipes (`entry_type:'recipe'`, `src/content/docs/recipes/`) vs. the generated Goose run-recipe YAML (`${slug}.goose-recipe.yaml`). A reader can easily conflate them; worth disambiguating in any Goose-facing work.

---

*End of audit. No source files were modified. Awaiting direction before proposing changes.*
