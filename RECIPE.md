# RECIPE.md — the persistent dependency graph

The repo's subsystems, what each one needs before it can work, and the checkable
proof that it does. Read this before any work. **PLAN.md holds the milestone-level
graph** (M0–M8, all shipped); this file is the standing subsystem graph beneath it.
If the two ever disagree, that is drift — flag it in the PR body, never edit silently.

Proof discipline: every proof ends in a number, a filename, or a named output —
never a status message. `gate.ps1` runs every proof below and exits 0 only when
all pass. Re-verified 2026-09-09 against `main@2f43295` (post-M8).

| Subsystem | Needs | Proof |
|---|---|---|
| Catalog data layer (`data/`, `scripts/`, `src/content/docs/catalog/`) | checkout + `npm ci` (Node 22+) | `node scripts/catalog-count.mjs --check` exits 0 printing `catalog count current: total=2185` (matches `data/catalog-count.json`) |
| Enforcement engine (`enforcement/`) | Catalog data layer | `npm run enforce` exits 0 and stdout contains `Enforcement passed` |
| Catalog explorer island (`src/components/CatalogExplorer.svelte`, `src/pages/catalog.json.ts`) | Catalog data layer; a build (from the CI pipeline proof) | `dist/catalog.json` parses to exactly the `total` in `data/catalog-count.json` (2,185 today) and `dist/catalog/index.html` exists |
| Build Studio island (`src/components/BuildStudio.svelte`) | Catalog data layer; Enforcement engine (imports `enforcement/matcher.ts`, consumes `dist/policy.json`); Agent skills (recipes fold `skills/`) | `dist/policy.json` exists with orgs ≥ 1 and signals ≥ 1; `dist/build/index.html`, `dist/es/build/index.html`, and `dist/ar/build/index.html` all exist |
| PolicyChecker island (`src/components/PolicyChecker.svelte`) | Enforcement engine (imports `enforcement/matcher.ts`, consumes `dist/policy.json`) | `dist/check/index.html` exists and a `dist/_astro/*.js` chunk contains the localized string `Comprobar contra la política` (island strings ship in the hydrated chunk, not the SSR HTML) |
| Edge API worker (`worker/`) | `wrangler.jsonc` bindings; the cost-estimator core (`src/modules/cost-estimator`, imported by `/api/pricing`) | `npm run typecheck:worker` exits 0; `node --import tsx --test worker/tests/auth.test.ts worker/tests/auth-nostr.test.ts worker/tests/auth-bluesky.test.ts worker/tests/pricing.test.ts worker/tests/routing.test.ts worker/tests/worker.test.ts` prints `fail 0` |
| Admin console (`worker/admin/`, `src/pages/console/`, `src/components/AdminConsole.svelte`) | Edge API worker (dispatched from `worker/index.ts`) | `node --import tsx --test worker/tests/admin-auth.test.ts worker/tests/admin-roster.test.ts worker/tests/admin-router.test.ts worker/tests/admin-staging.test.ts` prints `fail 0`; `migrations-admin/0001_admin_storage.sql` exists |
| CI verify + quality pipelines (`.github/workflows/verify.yml`, `quality.yml`) | every subsystem above | both workflow files exist; `npm run verify:all` exits 0 with the test summary `fail 0` (this proof also produces the `dist/` the island proofs consume) |
| Supply-chain (`osv-scanner.toml`, `scripts/osv-critical-gate.sh`, `security/`) | `package-lock.json` | `osv-scanner.toml` exists; an `osv-scanner scan --lockfile=package-lock.json` JSON report contains 0 advisories that are both CRITICAL (CVSS ≥ 9.0 or `database_specific.severity = CRITICAL`) and fix-available — the same two signals `scripts/osv-critical-gate.sh` applies (that script needs bash+jq; `gate.ps1` evaluates the same JSON natively) |
| i18n governance (`scripts/i18n-security-gate.mjs`, `.github/workflows/i18n-security-gate.yml`) | the content tree | `node --import tsx --test scripts/i18n-security-gate.test.ts` prints `fail 0` (9 tests today); `.github/workflows/i18n-security-gate.yml` exists |
| Agent skills (`skills/`, `goose-recipes/`, `src/content/docs/skills/`) | Enforcement engine (`enforcement/layer3-provider-strings/skill-validator.ts`) | `npm run enforce:skills` exits 0 printing `Enforcement passed`; every directory under `skills/` contains `SKILL.md` (8 today) |
| Spec Kit templates (`templates/spec-kit/`) | — (no in-repo dependency) | both archetypes (`nostr-mls-group-messaging`, `nostr-web-client`) contain `.specify/memory/constitution.md` and `.specify/templates/{plan,spec,tasks}.md` |

## Parallel tracks

Zero shared dependencies between these — they can proceed in any order or
concurrently without touching each other's proofs:

- **Spec Kit templates** depend on nothing in the repo and nothing depends on them.
- **Supply-chain** needs only `package-lock.json` — independent of the content,
  island, and worker tracks.
- **i18n governance** needs only the content tree and its own scripts — no shared
  dependency with supply-chain or Spec Kit.

The tight coupling is elsewhere: the two checker islands and the Build Studio all
stand on the **enforcement engine**, and the **catalog data layer** is the root
almost everything hangs from. A break in either cascades — which is why their
proofs run first in `gate.ps1`.

## DRIFT RULE

Every proof line is re-verified by any PR that touches its subsystem. A drifted
proof (a count that moved, a renamed file, a string that changed) gets **flagged
in the PR body** — the PR updates RECIPE.md and the proof in the same commit that
caused the drift. A proof is never silently edited to make the gate green; a gate
that cannot fail is not a gate (see `gate.ps1 -SelfTest` for the planted-failure
evidence).
