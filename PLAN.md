# PLAN.md — drive Goose as a user-facing agentic runtime via ONE build session

**Source:** `AUDIT.md` (read-only audit, branch `claude/kind-albattani-tnycq4`).
**Mode:** PLAN ONLY — no feature code. Contracts below are *specifications* (types +
signatures, no bodies). Execution happens slice-by-slice after review.
**Deliverable of the pivot:** the four components (Build Studio, Mentor Engine, Skills
Creator, Catalog) converge on ONE typed client-side build session, which serializes to
a Goose recipe and launches via a `goose://recipe?config=<base64>` deeplink — all pure
client-side, model-free.

---

## 0. Encoded constraints, reconciliations & out-of-scope

**Hard constraints (carried into every slice):**
1. **Stack:** Astro (Starlight) + Cloudflare Pages; Catalog on Astro Content Layer
   (`docsLoader` + Zod), per `src/content.config.ts` + `src/schema/catalog.ts`.
2. **ONE shared client-side build session** wired across the four components
   (`src/lib/build-session.ts`).
3. **Model-free Path A:** ZERO inference API calls from the platform. Exactly ONE
   deterministic structured-reflection exception that performs **no LLM call** — it
   *reads* structured JSON the user brings back from their own Goose run
   (`response.json_schema` output).
4. **Goose = STABLE primitive only:** client-side recipe deeplinks
   `goose://recipe?config=<base64>` via `btoa(JSON.stringify(recipe))` behind a
   UTF-8-safe wrapper (reuse the pattern in `src/components/AccountWidget.astro:86-95`).
5. **Mentor Engine** = Yoda/Morpheus/J.A.R.V.I.S./Neo persona shipped as a Goose
   **SKILL** + deterministic reflection over the recipe's `response.json_schema`
   output (`src/lib/mentor-engine.ts`).
6. **Vendor exclusions = Meta/OpenAI/xAI ONLY** as inference providers; Google
   permitted. Goose is model-agnostic — **never hardcode a provider**; omit
   `settings.goose_provider`/model so the user's own Goose config selects it.
7. **MCP safety:** the **Catalog is the trust boundary**. Only allowlisted, vetted
   extensions/skills may appear in a generated recipe. Lean on Goose "Trust &
   Execute" consent + extension allowlist + least privilege. Never surface raw MCP
   server config to non-devs. Treat tool descriptions as untrusted unless sourced
   from a verified Catalog entry.

**Reconciliations with `AUDIT.md` (facts the brief mis-stated — plan honors reality):**
- Framework is **Astro `^6.4.6`**, not 5 (`AUDIT.md §6`, `package.json:44`). Content
  Layer API is identical for this work; the plan is version-agnostic and pins nothing
  to a major version.
- Catalog is **1,354 tool-class + 827 dataset** entries (`AUDIT.md §3`), not "~842".
  Entries are MD/MDX with YAML frontmatter. Counts only matter to Slice B's allowlist
  scope.
- There is **no `@astrojs/cloudflare` adapter**; static build + hand-rolled Worker
  (`AUDIT.md §6`, `wrangler.jsonc`). All new logic is **pure client-side**, so the
  serializer/deeplink never touch the Worker.

**Out of scope (note as FUTURE ENHANCEMENT only — do not build now):**
- `goose serve` / ACP-over-HTTP / Goose TS SDK (experimental mid-2026). Recorded in
  §6 "Future" so a later slice can pick them up; no design dependency on them.
- Retiring the existing `/api/agent/kickoff` broker is IN scope (Slice D) because it is
  the lone inference call standing between us and Path-A zero.

---

## 1. Cross-cutting invariants & global gates (apply to ALL slices)

These are the exit gates every slice is measured against, in addition to its own:

- **G-PathA (zero inference):** no platform code fetches a model host. Enforced by a
  new additive test/CI check (Slice D) — extends the negative-signal approach already
  in `enforcement/excluded-provider-signals.yaml` and `enforcement/tests/layer3.test.ts`.
- **G-Vendor:** no Meta/OpenAI/xAI as a provider; recipe emits no provider/model.
  Reuse `EXCLUDED_PROVIDER_IDS` (`src/modules/cost-estimator/registry/providers.ts:16`)
  + the broker allowlist logic pattern (`worker/index.ts:106-130`) as the vetting source.
- **G-Trust (MCP):** every extension in a generated recipe ∈ the Catalog allowlist;
  property-tested so a non-allowlisted extension is unrepresentable.
- **G-Gate:** the blocking `operational_advisory` CI gate is never weakened; all new CI
  is ADDITIVE in new workflow files (CLAUDE.md #4; `AUDIT.md §6`). The project guard
  (`.claude/hooks/guard.py`) stays in force.
- **G-Determinism:** all new serializer/deeplink/reflection code is pure and
  deterministic — same session ⇒ byte-identical recipe & deeplink.
- **G-Green:** the existing **185-test** suite stays green (`npm test`), `astro check`
  0 errors, and a production `npm run build` succeeds, after every slice.
- **G-NonDev:** no raw MCP/server config, env vars, or shell strings shown to the
  builder; all attacker-influenceable text rendered via `textContent` (reuse the
  XSS-safe pattern already used in `src/components/AccountWidget.astro`).

---

## 2. Sequencing / gating

```
A (typed session + Catalog wiring)
└─> B (recipe serializer + Catalog extension allowlist)
    ├─> C (deeplink + "Open in Goose" UX)
    ├─> D (Mentor persona SKILL + structured-reflection; retire broker → Path-A zero)
    └─> E (Skills Creator → session + Catalog sub-recipes)
```
A is the foundation. B depends on A. C, D, E each depend on B; C/D/E are independent of
one another and may land in any order once B is in. Each slice is its own PR, gated on
its benchmark + the global gates in §1.

---

## SLICE A — Formalize the shared build session; wire all four components

**Goal.** Turn `BuildSession` into a single typed, runtime-validated, versioned schema
and ensure all four components read/write the *same* object — closing `AUDIT.md` Gap #4
for the Catalog. (PolicyChecker/AccountWidget are intentionally NOT among "the four"
and stay independent — `AUDIT.md §2`.)

**Gate (entry):** none (foundation).

**Files to change.**
- `src/lib/build-session.ts` — formalize the schema (see contract); bump `v: 1 → 2`
  with a `migrate` v1→v2 path (extend the existing `migrate()` at `:120-181`, same
  defensive style); add session fields the recipe needs: `extensions`, `mentorReflection`.
- `src/lib/build-session.test.ts` — extend (round-trip, v1→v2 migrate, coercion).
- `src/components/CatalogExplorer.svelte` — wire to the session: write selected
  tools/extensions; on mount read prior selections (reuse the subscribe pattern from
  `src/components/BuildStudio.svelte:232-252` and `src/modules/cost-estimator/ui/CostEstimator.svelte:33-35`).
- `src/components/BuildStudio.svelte` — consume the new typed fields where it already
  reads/writes the session (`:232-310`); no behavior change beyond new fields.
- (Mentor Engine + Skills Creator already persist through BuildStudio — formalize their
  field ownership in the schema doc, no new component file.)

**Contract / interface.**
```ts
// src/lib/build-session.ts  (Zod, mirroring the astro/zod pattern in src/schema/catalog.ts)
export const SESSION_VERSION = 2 as const;

export interface SessionExtension {     // an allowlisted Goose extension ref (Slice B/G-Trust)
  catalogId: string;                    // slug of the verified Catalog entry it came from
  name: string;
  kind: 'builtin' | 'mcp_stdio' | 'mcp_sse'; // resolved from the Catalog, never user-typed
}
export interface SessionMentorReflection { // deterministic output of Slice D
  schemaVersion: 1;
  constraints: string[];                // ConstraintId[]; from mentor-engine
  proposals: Array<{ action: 'add'|'swap'|'remove'; name: string; why: string }>;
}
export interface BuildSession {         // EXTENDS the current interface at :54-90
  /* …all existing fields… */
  v: 2;
  extensions: SessionExtension[];       // NEW — selected, allowlisted extensions
  mentorReflection: SessionMentorReflection | null; // NEW — Slice D writes; null until run
}
export function migrate(parsed: unknown): BuildSession; // v1 docs upgrade to v2 (extensions:[], mentorReflection:null)
```
Component contract (unchanged API surface): all four use only
`loadSession/saveSession/updateSession/subscribeSession` (`build-session.ts:143-206`).

**Test plan.**
- *Unit:* extend `build-session.test.ts` — v1→v2 migrate fills `extensions: []` /
  `mentorReflection: null`; Zod rejects malformed extensions; round-trip + cross-tab
  event still fire (reuse the fake-DOM harness already in that file).
- *Integration:* a jsdom-free node test that simulates Catalog write → BuildStudio read
  through `localStorage` + `subscribeSession` (extend the existing pub/sub tests).

**Rollback.** Single revert of the slice commit; `migrate` is forward-only and
v1-compatible, so reverting to v1 readers ignores the new fields (they were additive &
optional in storage). No data migration to undo.

**Benchmark / threshold (proves it works).**
- All four components demonstrably read+write the one object in an integration test
  (Catalog selection observable in a BuildStudio-side read): **pass = 1 object, 4
  participants**.
- v1→v2 migrate property test: **100%** of randomly-mutated v1 blobs coerce to a valid
  v2 (no throw, schema-valid).
- `npm test` stays green at **≥185** tests; `astro check` 0 errors.

---

## SLICE B — Pure-client recipe serializer (session → Goose recipe)

**Goal.** Deterministically turn a `BuildSession` into a Goose recipe object
(`extensions` allowlisted from the Catalog, `parameters`, `activities`,
`response.json_schema`, `instructions`, `prompt`) — superseding the minimal template at
`src/components/BuildStudio.svelte:733-742`. Model-agnostic (no provider/model).

**Gate (entry):** Slice A merged (needs `session.extensions` + typed schema).

**Files to change.**
- **New** `src/lib/goose-recipe.ts` — the pure serializer (extraction pattern of
  `src/lib/catalog-filter.ts` / `src/lib/skill-doc.ts`).
- **New** `src/lib/goose-recipe.test.ts`.
- `src/schema/catalog.ts` — add a first-class **extension** representation (closes
  `AUDIT.md` Gap #2): either `entry_type: 'extension'` in `ENTRY_TYPES` (`:28-40`) or a
  `goose_extension` block, gated by `verification_status === 'verified'` in the existing
  `superRefine` (`:140-207`).
- **New** `src/pages/extensions.json.ts` — build-time static allowlist of vetted
  extensions for the client serializer (same Content-Layer query pattern as
  `src/pages/catalog.json.ts`).
- `src/components/BuildStudio.svelte` — replace the inline `gooseRecipe` derived
  (`:733-742`) with a call to `buildGooseRecipe(session, allowlist)`.
- `enforcement/` — extend the layer-3 recipe contract (`enforcement/cli.ts` +
  `enforcement/types.ts:92` `RecipeFinding`) to assert generated recipes reference only
  allowlisted extensions; add fixtures under `enforcement/tests/`.

**Contract / interface.**
```ts
// src/lib/goose-recipe.ts
export interface GooseRecipe {            // the stable recipe primitive we emit
  version: string;                        // "1.0.0"
  title: string;
  description: string;
  instructions: string;
  prompt: string;
  extensions: GooseExtensionRef[];        // ONLY from the allowlist
  parameters: GooseParameter[];           // typed inputs the user fills in Goose
  activities: string[];                   // suggested next actions
  response: { json_schema: JsonSchema };  // forces structured output (Slice D reads it)
  // NOTE: no `settings.goose_provider` / model — model-agnostic by construction (G-Vendor)
}
export interface ExtensionAllowlist {     // fetched from /extensions.json
  byId: Record<string, GooseExtensionRef>;
}
export function buildGooseRecipe(
  session: BuildSession,
  allow: ExtensionAllowlist,
): GooseRecipe;                            // pure; drops any extension not in `allow`
export const RESPONSE_JSON_SCHEMA: JsonSchema; // the shared schema Slice D reflects over
```

**Test plan.**
- *Unit:* `goose-recipe.test.ts` — determinism (same session ⇒ deep-equal recipe);
  **G-Trust property test**: for arbitrary `session.extensions`, every emitted
  extension ∈ `allow` and any non-allowlisted ref is dropped (cannot appear);
  no provider/model field ever present (G-Vendor); recipe validates against the Goose
  recipe JSON-schema (vendored as a test fixture).
- *Integration:* `enforcement` layer-3 run over a generated recipe fixture passes;
  a recipe built from a representative session validates end-to-end.

**Rollback.** Revert the slice; BuildStudio's `gooseRecipe` derived returns to the
`:733-742` template (kept in git history). Schema addition is additive/optional, so
existing catalog entries still validate.

**Benchmark / threshold.**
- **0** non-allowlisted extensions emitted across a 1,000-case property test.
- **0** recipes carrying a provider/model field.
- Recipe schema-validation: **100%** of generated recipes valid against the vendored
  Goose recipe schema.
- `enforcement` layer-3 passes on generated recipes; `npm test` green.

---

## SLICE C — Deeplink generator + "Open in Goose" UX

**Goal.** Encode a recipe into `goose://recipe?config=<base64>` (UTF-8-safe), launch via
an "Open in Goose" action with an **explain-before-launch** panel and a **copy-link**
(and recipe-file) fallback when the deeplink exceeds the length budget.

**Gate (entry):** Slice B merged (needs `GooseRecipe`).

**Files to change.**
- **New** `src/lib/goose-deeplink.ts` — pure encode/decode + length guard. The
  UTF-8-safe base64 reuses the wrapper pattern in
  `src/components/AccountWidget.astro:86-95` (encode) and its inverse for round-trip.
- **New** `src/lib/goose-deeplink.test.ts`.
- `src/components/BuildStudio.svelte` — the `handoff: 'goose'` branch (`:1357-1363`):
  add "Open in Goose" (anchor to the deeplink), the explain panel, and the existing
  copy/download fallbacks (`copy()` `:825`, `blobDownload()` `:828`). Keep the
  `goose run --recipe …` file path as the >budget fallback.
- (Optional) `src/components/CatalogExplorer.svelte` — a single-tool "Open in Goose"
  using a minimal one-extension recipe (only if Slice A wired selection; else defer).

**Contract / interface.**
```ts
// src/lib/goose-deeplink.ts
export const DEEPLINK_MAX_BYTES = 8192;   // budget; above this → fallback (tune in benchmark)
export function encodeRecipeConfig(recipe: GooseRecipe): string;       // UTF-8-safe base64
export function decodeRecipeConfig(b64: string): GooseRecipe;          // inverse (for tests)
export function recipeDeeplink(recipe: GooseRecipe): {
  url: string;                            // `goose://recipe?config=…`
  bytes: number;
  withinBudget: boolean;                  // false ⇒ UX shows copy-link/file fallback
};
export interface ExplainModel {           // what the explain-before-launch panel renders
  title: string;
  extensions: Array<{ name: string; why: string }>; // rendered via textContent (G-NonDev)
  willDoNothingUntilUserConsents: true;   // copy: Goose "Trust & Execute" prompts at runtime
}
export function explainRecipe(recipe: GooseRecipe): ExplainModel;
```

**Test plan.**
- *Unit:* `goose-deeplink.test.ts` — round-trip `decode(encode(r)) === r` incl.
  **non-ASCII** (es/ar/emoji) titles/prompts (proves the UTF-8-safe wrapper); URL shape
  `goose://recipe?config=`; `withinBudget` flips correctly at the boundary;
  `explainRecipe` lists every extension (no omissions).
- *Integration:* build a recipe (Slice B) → deeplink → decode → recipe equals input; a
  jsdom/Playwright check that the explain panel renders every extension via `textContent`
  (no HTML injection) and the fallback appears when over budget.

**Rollback.** Revert; the `goose` handoff falls back to the existing recipe-file +
`goose run` command (`:1360-1362`), which is unaffected.

**Benchmark / threshold.**
- Round-trip fidelity: **100%** over a fuzz corpus including multibyte text.
- A representative full-stack recipe encodes to **< `DEEPLINK_MAX_BYTES`**; over-budget
  recipes deterministically take the fallback path (asserted).
- Explain panel enumerates **100%** of recipe extensions; **0** raw MCP config strings
  in the DOM (asserted).

---

## SLICE D — Mentor persona SKILL + deterministic structured-reflection; retire the broker

**Goal.** Ship the Yoda/Morpheus/J.A.R.V.I.S./Neo guidance as a Goose **persona SKILL**
inside the recipe, and make the platform's ONLY model-output consumption a
**deterministic** read of the recipe's `response.json_schema` JSON the user brings back
— then **retire `/api/agent/kickoff`** so the platform makes zero inference calls
(Path-A zero; `AUDIT.md §4`, Risk #1).

**Gate (entry):** Slice B merged (needs `RESPONSE_JSON_SCHEMA` + recipe).

**Files to change.**
- **New** `src/lib/mentor-persona.ts` — builds the persona SKILL.md via the existing
  `skillToMd` (`src/lib/skill-doc.ts`); included by the serializer (Slice B) as a recipe
  skill/instruction. Pure, deterministic, no model.
- `src/lib/mentor-engine.ts` — add `reflectFromResponse(json)` that deterministically
  maps a `RESPONSE_JSON_SCHEMA`-conformant object → `SessionMentorReflection` (reuses
  the existing `reflect()` constraint ordering `:155-186`). **No fetch, no LLM.**
- `src/lib/mentor-engine.test.ts` — extend.
- `src/components/BuildStudio.svelte` — replace the two broker calls
  (`:904`, `:1012`) with: (a) generate recipe+deeplink (Slices B/C), (b) an
  "import structured result" affordance that pastes/loads the Goose `response` JSON and
  runs `reflectFromResponse` into `session.mentorReflection`.
- `worker/index.ts` — **remove** `kickoffHandler` (`:182-207`), its route (`:463`), the
  `PROVIDERS` table + router-allowlist (`:68-130`). (Keep `coerceUsageProfile`/pricing.)
- `worker/tests/worker.test.ts` — drop the now-removed broker tests; keep the rest.
- **New** `.github/workflows/path-a.yml` — ADDITIVE CI asserting zero model-host fetches
  in `src/` + `worker/` (extends the signal set in
  `enforcement/excluded-provider-signals.yaml`). Does NOT touch `verify.yml` (G-Gate).

**Contract / interface.**
```ts
// src/lib/mentor-engine.ts  (additive)
export function reflectFromResponse(
  response: unknown,                       // a RESPONSE_JSON_SCHEMA-shaped object (validated)
): SessionMentorReflection;                // deterministic; null-safe; never calls a model

// src/lib/mentor-persona.ts
export function mentorPersonaSkill(lang: 'en'|'es'|'ar'): DraftSkill; // → skillToMd → recipe
```

**Test plan.**
- *Unit:* `reflectFromResponse` is deterministic and total (malformed input → safe empty
  reflection, mirroring `coerceUsageProfile`'s defensive style); persona SKILL.md
  validates (parse frontmatter with `yaml`, as in `src/lib/skill-doc.test.ts`).
- *Integration:* recipe (Slice B) → its `response.json_schema` → a conformant sample →
  `reflectFromResponse` → stable `SessionMentorReflection` written to the session.
- *Gate test:* `path-a.yml` check fails if any model host appears in platform code.

**Rollback.** The broker removal is its own commit; revert restores `/api/agent/kickoff`
and the two client calls. The persona/reflection additions are independent and need not
be reverted with it.

**Benchmark / threshold.**
- **G-PathA = 0**: zero model-host fetches in `src/` + `worker/` (new CI check passes).
- `reflectFromResponse`: deterministic across a 500-case corpus; **0** throws on
  malformed input.
- No reachable `/api/agent/kickoff` route remains (worker route test asserts 404).

---

## SLICE E — Skills Creator authoring → session + Catalog sub-recipes

**Goal.** Make the inline Skills Creator (Movement 3, `src/components/BuildStudio.svelte:962-981`)
write authored skills into the session AND emit them as Goose **sub-recipes** the main
recipe references, with an optional contribution path into the Catalog as vetted,
reusable artifacts.

**Gate (entry):** Slice B merged (sub-recipes are emitted by the serializer).

**Files to change.**
- `src/lib/skill-doc.ts` — add a sub-recipe projection of a `DraftSkill` (a skill →
  a minimal `GooseRecipe` fragment / sub-recipe ref); pure.
- `src/lib/skill-doc.test.ts` — extend.
- `src/lib/goose-recipe.ts` (Slice B) — include `session.skills` as recipe
  sub-recipes/activities.
- `src/components/BuildStudio.svelte` — Skills Creator writes to `session.skills`
  (already does `:297`) and now also surfaces "include as sub-recipe."
- `src/schema/catalog.ts` — optional **skill** representation (parallel to the extension
  work in Slice B) so a contributed skill can become a verified Catalog entry; gated by
  `verification_status`.
- `public/admin/config.yml` — add a skills collection for the contribution path (mirrors
  the existing `recipes` collection at `:41-52`), so non-devs contribute via Sveltia CMS
  → PR → enforcement.

**Contract / interface.**
```ts
// src/lib/skill-doc.ts  (additive)
export function skillToSubRecipe(s: DraftSkill): GooseSubRecipe;  // pure; no model
export interface GooseSubRecipe { name: string; instructions: string; activities: string[] }
```

**Test plan.**
- *Unit:* `skillToSubRecipe` deterministic; SKILL.md still valid YAML (existing
  `skill-doc.test.ts` harness); a skill with hostile text stays safe (reuse the
  `yamlDoubleQuoted` coverage already there).
- *Integration:* author skill → `session.skills` → serializer emits it as a sub-recipe →
  recipe still schema-valid (Slice B benchmark) and deeplink round-trips (Slice C).
- *Contribution:* a CMS-authored skill file passes `enforcement` layer-3.

**Rollback.** Revert; `session.skills` continues to flow into the starter zip as today
(`src/components/BuildStudio.svelte:806-822`); no sub-recipe emission.

**Benchmark / threshold.**
- Authored skill round-trips session ⇄ SKILL.md ⇄ sub-recipe with **0** data loss.
- Recipes including N authored sub-recipes stay schema-valid and **within the deeplink
  budget** (else fallback) for N up to a documented cap.
- `enforcement` layer-3 green on contributed skills.

---

## 3. Risks carried forward (from `AUDIT.md`) + new

| # | Risk | Source | Handled in |
|---|---|---|---|
| R1 | Lone inference exception overlaps the pivot | AUDIT Risk #1 | **Slice D** (retire broker → Path-A zero) |
| R2 | Extensions/skills not first-class; recipe too thin | AUDIT Risk #2 | **Slice B/E** (schema + serializer) |
| R3 | Deeplink length limits truncate large recipes | new | **Slice C** budget + fallback |
| R4 | Untrusted MCP tool descriptions / raw config leak | constraint #7 | **G-Trust + G-NonDev** (allowlist, textContent) |
| R5 | Hardcoding a provider breaks model-agnosticism | constraint #6 | **Slice B** (no settings/provider; G-Vendor) |
| R6 | Catalog translations absent (es/ar recipes) | AUDIT Risk #6 | recipe i18n via `lang` param (Slice C/D), tracked |
| R7 | CSP still Report-Only; `goose://` scheme + new UX | AUDIT Risk #5 | verify CSP allows the scheme before enforce (note for CSP-promote work) |
| R8 | "recipe" overload (policy recipe vs run recipe) | AUDIT Risk #7 | naming: `GooseRecipe`/sub-recipe vs `entry_type:'recipe'` policy recipes |

---

## 4. Definition of Done (whole pivot)

- One typed build session; the four components read/write it (Slice A).
- Pure client serializer → schema-valid, model-agnostic, allowlist-only Goose recipe
  (Slice B).
- `goose://recipe?config=<base64>` deeplink with explain-before-launch + fallback
  (Slice C).
- Mentor persona SKILL + deterministic structured-reflection; **`/api/agent/kickoff`
  retired ⇒ platform inference calls = 0** (Slice D).
- Skills Creator → session + sub-recipes + Catalog contribution path (Slice E).
- All global gates (§1) hold: Path-A=0, vendor-clean, MCP-trust-boundary, additive CI,
  determinism, suite green, build green.

---

## 5. Future enhancements (explicitly deferred — do NOT build now)

- `goose serve` / ACP-over-HTTP / Goose TS SDK for a hosted, live agent loop
  (experimental mid-2026). Would replace the bring-back-JSON step in Slice D with a live
  session — design Slice D's `reflectFromResponse` so it can later accept a streamed
  response without changing its deterministic contract.
- Server-side recipe signing / shareable recipe links (needs the Worker; out of the
  pure-client scope here).
- Full catalog translation so es/ar recipes ship localized extension copy.

---

*Plan only — no feature code written. Awaiting review of `PLAN.md` before executing
Slice A.*
