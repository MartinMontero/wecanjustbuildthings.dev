# CLAUDE.md — wecanjustbuildthings.dev

Astro Starlight site on Cloudflare Pages that guides non-developers through
agentic software development. Four components share ONE client-side build-session
object: Build Studio, Mentor Engine, Skills Creator, Catalog. Plus a Hosting Cost
Estimator module and a dataset-backed catalog pipeline (Astro 5 Content Layer Zod
schema, ~842 YAML entries).

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

<!-- Build commands, scripts, and project layout: run `/init` to populate these
     from the actual repo, then keep them current here. -->

# Task: Wire the full i18n governance + freshness layer into wecanjustbuildthings.dev (one pass)

## Note — this is an UPGRADE, not greenfield
We are upgrading this project's multi-language support, building on earlier
language-support work. Treat any existing i18n config and translated content as
the baseline to EXTEND and HARDEN, not replace. Preserve what's there; reconcile,
don't clobber. This pass connects an already-built governance + freshness layer
(translation provenance tracking, a reader-facing freshness banner, a contributor
trust model, and CI gates) to package.json, astro.config, Git settings, and
branch protection. The i18n conventions are already in CLAUDE.md — they govern
this whole pass.

## File manifest — the ten files you're wiring in (read them first; they ARE the spec)
1. TRANSLATING.md                          → repo root  (governance: trust ladder, opening gate, freshness contract)
2. scripts/i18n-freshness.mjs              → scripts/   (Git-aware freshness + coverage checker; pure Node, zero deps)
3. scripts/i18n-stamp.mjs                  → scripts/   (stamps source_commit + last_verified)
4. scripts/i18n-security-gate.mjs          → scripts/   (path-gated security review check; zero deps, Node 22 fetch)
5. src/components/TranslationStatus.astro  → src/components/  (PageTitle override: reader-facing freshness/fallback banner)
6. src/components/translation-status.mjs   → src/components/  (pure decision logic for the banner)
7. src/content.config.ts                   → merge the `extend` block (don't overwrite a real file)
8. .github/CODEOWNERS                        → .github/   (locale-scoped ownership)
9. .github/workflows/i18n-freshness.yml     → .github/workflows/  (hygiene gate on PRs + freshness report)
10. .github/workflows/i18n-security-gate.yml → .github/workflows/ (the per-path N=2 security check)

Read TRANSLATING.md, the i18n section of CLAUDE.md, and the header comments of all
four scripts/components first; they define the conventions this prompt connects.

## Hard constraints (binding — any violation = STOP and report)
- CLAUDE.md at repo root is authoritative; if it conflicts with this prompt, it wins.
- ZERO new runtime dependencies. Every script/component here is pure Node / pure
  Astro by design. If you want to add a package, STOP and ask.
- Vendor exclusion (Meta/OpenAI/xAI; Google permitted) and Path A (no runtime
  model inference beyond the one permitted exception) are untouched by this work —
  it's Git + static rendering only. Keep it that way.
- After changes, the existing blocking CI checks MUST still pass — including
  `operational_advisory` (CLAUDE.md constraint 4) and any supply-chain /
  vendor-exclusion checks already configured (identify them in recon). Do NOT
  modify, weaken, disable, bypass, or merge into those checks, and do NOT
  introduce new scanners or security tooling. Confirm the lockfile gained NO new
  dependencies.
- Verify Starlight/astro.config APIs against the INSTALLED versions before
  editing. Route data is read from `Astro.locals.starlightRoute` (Starlight 0.32+);
  override paths in config must start with `./`.
- NEVER fabricate org/team/repo details, GitHub team slugs, check names, tool
  names, or the Cloudflare Pages build command. If you don't know a real value,
  STOP and ask (CLAUDE.md constraint 5).
- No marketing language anywhere. If anything is ambiguous, STOP and ask.

## Phase 0 — Recon (NO changes)
Report, then STOP for approval:
1. Installed Starlight version; current `locales` + `defaultLocale` in
   astro.config.*; and whether English is the ROOT locale (no /en prefix, files
   directly under src/content/docs/) or prefixed under /en/.
2. Existing per-locale content dirs and src/content/i18n/*.json files.
3. Existing .github/CODEOWNERS, and the REAL GitHub team slugs in use.
4. Current package.json `build` script; and the Cloudflare Pages build command if
   discoverable in-repo (wrangler.toml / CI). If it's only in the Pages dashboard,
   say so — don't guess.
5. The existing blocking CI checks — including `operational_advisory` and any
   supply-chain / vendor-exclusion workflows — by FILE and CHECK NAME, plus the
   tools they actually invoke. These must keep passing and must NOT be modified;
   the validation step in Phase 1 will run exactly these. Do not assume tool
   names — read them from the workflow files.
6. Confirm all ten files are present at their paths. Find EVERY place a locale
   list is hard-coded: astro.config, scripts/i18n-freshness.mjs, scripts/i18n-stamp.mjs,
   scripts/i18n-security-gate.mjs, and src/components/TranslationStatus.astro
   (KNOWN_LOCALES). Report each, and confirm `rootLocaleHasNoPrefix` in the scripts
   matches the real structure from (1) — flag any mismatch (one-line switch each).
7. Output the full list of files you intend to touch in Phase 1.

## Phase 1 — Wire it in (in-repo, reversible)
1. **Files & merges.** Verify the ten files. Merge the provided `extend` block
   into the REAL src/content.config.ts without overwriting existing custom fields.
   The block must contain all three fields:
     source_commit:      z.string().regex(/^[0-9a-f]{40}$/i).optional()
     last_verified:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
     security_sensitive: z.boolean().optional()
   (`security_sensitive: true` is authored on ENGLISH SOURCE pages; translations
   inherit it via the gate.) In .github/CODEOWNERS replace every @ORG/* with the
   real team slugs from Phase 0; if you can't determine them, STOP and ask.

2. **Register the banner override.** In the Starlight integration in astro.config.*:
     components: { PageTitle: './src/components/TranslationStatus.astro' }
   Preserve any components overrides already configured (merge, don't replace).

3. **astro.config locales.** Ensure `defaultLocale` + `locales` cover the
   project's languages, PRESERVING any already configured. If i18n is greenfield,
   set English as root locale and `es` (label "Español", lang "es-MX") as the
   first translation locale.

4. **Locale-list consistency (prevents silent drift).** Recommended: create one
   module `src/config/i18n.mjs` exporting `{ defaultLocale, locales, rootLocaleHasNoPrefix }`
   and import it from the three scripts and the banner component, replacing their
   local copies. If you do NOT consolidate, then at minimum confirm all locale
   lists from Phase 0 (6) are byte-identical and report them. Drift here silently
   breaks the banner and the gates.

5. **package.json scripts.** Add:
     "i18n:freshness": "node scripts/i18n-freshness.mjs",
     "i18n:stamp": "node scripts/i18n-stamp.mjs"
   And regenerate the freshness report on every deploy so the banner + dashboard
   stay current. Prefer:
     "build": "node scripts/i18n-freshness.mjs --mode=report && astro build"
   Confirm the Cloudflare Pages build command actually runs `npm run build`; if you
   can't verify in-repo, flag it for me to confirm in the dashboard.

6. **Generated status file.** Add src/data/i18n-status.json to .gitignore
   (regenerated each build), then run `npm run i18n:freshness` once so local dev
   and the banner have it. The banner imports this file tolerantly — confirm it
   does NOT break the build when the file is absent.

7. **Fix the required-check / paths-filter trap.** Remove the `paths:` filter from
   .github/workflows/i18n-freshness.yml so the freshness check can be a required
   status check without sitting "pending" forever on unrelated PRs. This is
   CONSISTENT with CLAUDE.md constraint 4: i18n-freshness.yml is a NEW file this
   feature introduces, not `operational_advisory` or any pre-existing workflow —
   you are not modifying, weakening, or bypassing the protected check. It is also
   safe behavior-wise: the hygiene step self-scopes to changed translation files
   and exits 0 when none changed; the report step is idempotent. (The
   security-gate workflow already has no paths filter, by design — do not add one.)

8. **CLAUDE.md.** The i18n-governance section was added to CLAUDE.md before this
   session. Verify it's present and consistent with what you built; do NOT append
   a duplicate. Only if it is somehow missing, add it from the canonical text.

9. **Validate.** Clean `astro build`. Confirm: the banner renders a caution notice
   on a deliberately-stale translation and nothing on a fresh page; the freshness
   report writes status; `npm run i18n:stamp -- <file>` forwards the path correctly;
   lockfile shows NO new deps; and the existing blocking checks identified in Phase
   0 (5) — `operational_advisory` plus any supply-chain/vendor checks — still pass
   unchanged. Commit with a plain message. STOP for review.

## Phase 2 — Branch protection (privileged; do NOT apply silently)
1. Get owner/repo/default branch (`gh repo view`).
2. Trigger one throwaway PR (or use an open one) so the check contexts appear, and
   capture the EXACT check names for both new workflows from the Checks API — do
   not guess them.
3. Present the exact `gh api` command(s) to set, on the default branch. ADD to the
   existing protection; do NOT remove or alter checks already required (e.g.
   `operational_advisory` must remain required and untouched):
   - require a pull request before merging
   - require review from Code Owners
   - required approving review count = 1   ← repo-wide floor (steward + 1 reviewer)
   - require status checks to pass, ADDING:
       • the i18n SECURITY GATE check  (this is what enforces N=2 on security pages)
       • the i18n FRESHNESS check       (now safe to require — paths filter removed)
     …while KEEPING every check already required, including operational_advisory.
   - dismiss stale approvals on new commits (recommended)
4. Confirm the authenticated `gh` token has admin scope on this repo. If not,
   output the commands for me to run and STOP.
5. Honest limitations — state them plainly, do NOT overclaim:
   - Native branch protection's approval count is one repo-wide number; it CANNOT
     express "2 for security pages." That higher bar is enforced ONLY by the
     security-gate check, which is frontmatter-driven and works anywhere in the tree.
   - The "a security STEWARD approved" half is enforced by CODEOWNERS + Code Owner
     review ONLY where security pages live under a path you can target in
     CODEOWNERS. Decide now whether to co-locate security content under a path
     (e.g. src/content/docs/**/security/**) and own it with a @ORG/security-stewards
     team. If security pages stay scattered by frontmatter flag alone, steward
     sign-off remains TRANSLATING.md policy, not a Git-enforced rule — say so.
   - Fork-PR caveat: the security gate reads reviews/files via the API and re-runs
     on review events; reliable for same-repo branches and public repos. Note any
     fork-PR limitations rather than asserting full coverage.
6. Get my explicit go-ahead before applying anything. STOP.

## Deliverables
Per phase: what changed, files touched, the build result, confirmation that
`operational_advisory` and the other existing checks still pass unchanged, the
exact branch-protection commands (applied or handed to me), the captured check
names, and any decision you need from me.
