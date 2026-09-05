# ROADMAP / STATUS

A living snapshot of where **wecanjustbuildthings.dev** stands — what's done, what's
blocked, what needs a decision, what's deferred. **Read this first** when picking up the
project in a new session or conversation.

**Last updated:** 2026-09-05 (M7 doc-drift closeout) · **Canonical branch:** `main` (GitHub default)

> Detailed external-operator tasks + the deferred-work ledger live in
> `docs/OPERATOR-RUNBOOK.md`. Non-negotiable constraints live in `CLAUDE.md`.
> The active execution plan (milestones M0–M8) lives in `PLAN.md`; the consolidated
> backlog ledger is `BACKLOG.md`. This file is the high-level index; keep it current
> as things land.

---

## Current state
- `main` is the single source of truth; production **auto-deploys via Cloudflare Workers
  Builds** (Git-connected) — there is no `wrangler deploy` in CI. Verified deploy
  semantics (SHIP-GATE-R2 item 0, 2026-07-11): **only merges to `main` deploy
  production**; non-main branch pushes upload *preview versions* that serve no traffic
  (the Cloudflare bot's "Deployment successful" on branch builds is cosmetic).
- The live site is up; the catalog + guided build flow work without any secrets.
- Auth (Sign in with Nostr / Bluesky, GitHub one-click) is wired and was confirmed live.
- **The SHIP effort (PLAN.md, Phase 3) is in flight.** Milestone ledger:

| Milestone | Status | PR(s) |
|---|---|---|
| M0 — Governance truth (i18n security gate) | ✅ shipped | #58, live-accepted #60 |
| B13 — guard.py backstop (GitHub merge commits) | ✅ shipped | #59 |
| M1 — System layer (tokens, Receipt primitive, Footer) | ✅ shipped | #61 |
| M2a — PolicyChecker receipt band + island i18n (P0-2) | ✅ shipped | #62 |
| M2b — Receipts on the trust surfaces (badges, enforcement band, Studio gate) | ✅ shipped | #64 |
| M7 — Doc-drift closeout (E1–E8) | 🔵 in flight | this update |
| F-8 — Dependency hygiene, Astro 6 only (ruled APPROVED 2026-09-01) | 🔵 approved, queued after M7 | — |
| M3 — Catalog explorer density | ⬜ next after F-8 | — |
| M4 — Island tokenization + honesty chips | ⬜ | — |
| M5 — Landing + register · M6 — Console/Arabic face/hydration · M8 — Verification + ship report | ⬜ | — |

## ✅ Done (merged to `main`)
- **SHIP Phase 3 kickoff** (#56–#57): the ship-gate research package (AUDIT.md,
  BACKLOG.md, DESIGN.md, `audit/screens/`) and PLAN.md v1 with the gate rulings
  (G1–G6 + riders) folded in.
- **M0 — governance truth** (#58, #60): `security_sensitive` is real validated data;
  the 2-review i18n security gate exists (additive workflow, trusted-code checkout
  pinned to base per M0-R1); CLAUDE.md's i18n section is truthful. Live-accepted by
  a test PR touching the flagged Marmot guide.
- **B13** (#59): the guard backstop recognizes GitHub's own merge commits.
- **M1** (#61): `wcb` cascade layer, verdict tokens, the Receipt trust primitive
  (Astro + Svelte twin), designed locale-aware Footer override, `.workbench` page
  class for the five tool pages.
- **M2a/M2b** (#62, #64): PolicyChecker honors `lang` with a receipt verdict band
  (P0-2 closed); catalog badges, the `/policies/enforcement/` band, and the Studio
  policy gate adopt the same receipt language (D1's ≥4 surfaces).
- **Admin panel, phases 0–3** (#44–#45, #50–#52, #54–#55): server-runtime scaffold
  (`worker/admin/*`); hardened admin auth (allowlist, sessions, coordinator,
  `/console/`); admin constitution (genesis roles, two owner superadmin identities);
  role tiers (file-rooted superadmins + runtime roster); ADMIN_DB bound and migrated
  (staged-edits API + insert-only action-audit tripwire). Phases 4–8 remain open
  (BACKLOG B6, own track).
- **Bluesky sign-in on Workers** (#47–#48): resolver `redirect:'error'` translated
  at both construction and direct-fetch seams — OAuth completes on the Workers runtime.
- **Guard hook RULE 3** (#46): blocks rewrites of foreign or published git history.
- **UX audit fixes** (#43): CSP hash validity, Check error state, a11y contrast,
  i18n, copy. **Docs hygiene** (#42): operator PII removed. **Review hardening** (#41).
- **Marmot/MLS integration** (#29): catalog cluster (19 entries), 4 skills + Goose recipes,
  the encrypted-group-messaging guide, the `nostr-mls-group-messaging` Spec-Kit archetype, a
  Build Studio stack-contract test. Catalog i18n routed to the `translate-catalog` workflow.
- **Mobile responsiveness** (#19): RTL leaks, input-zoom trap, overflow bugs,
  safe-area, touch targets, persistent bottom nav — before/after in `MOBILE_FIXES.md`.
- **Auth storage provisioning** (#30): `scripts/provision-auth.ts` + corrected
  `docs/AUTH_PROVISIONING.md`. KV×2 + D1 IDs verified against the account; migration applied.
- **Auth API routing fix** (#32): `run_worker_first: ["/api/*"]`. `/api/*` had been shadowed
  by static-asset handling, so the auth API had **never** worked on the domain. Fixed,
  deployed, all four `/api/*` status endpoints confirmed live.
- **Dependabot triage** (#34): wrangler 4.100 → 4.104 cleared 4 high-severity dev-tool CVEs.
- **Context7 MCP** (#35): project-scoped `.mcp.json`, key via `${CONTEXT7_API_KEY}` env var
  (never in the file).
- **GitHub OAuth** app registered; Worker secrets set (`BLUESKY_PRIVATE_KEY_JWK`,
  `GITHUB_OAUTH_CLIENT_ID/SECRET`).
- **Cloudflare CLI/agent token** (`CLOUDFLARE_API_TOKEN`) — verified working 2026-06-30.
- **Workers Builds deploy credential** — the Build → API token is a
  wecanjustbuildthings-owned token; verified end-to-end 2026-06-30.

## ⛔ Blocked / watch (none of these take the live site down)
- _Nothing currently blocked or on watch._

### Record (resolved earlier; kept for the audit trail)
- **`wecanjustbuildthings.dev` egress from web sessions** — allowlisted 2026-07-03;
  the runbook's live `curl` checks are runnable from web sessions.
- **`CONTEXT7_API_KEY` / Context7 MCP egress** — resolved 2026-06-30 (durable env
  settings + allowlisted egress). `.mcp.json` unchanged; never run `npx ctx7 setup`.

## 🤔 Decisions needed (none block the live site)
- **Alfred's PWA** — a **separate** project. If deployed from here, give it its own
  `wrangler.jsonc` (distinct worker name) and confirm scope/repo.
- **Cost Estimator prices** — all `null` placeholders; confirm real numbers (data + sign-off,
  not engineering) or hide the module. *Highest user-facing impact.* (runbook §B1)
- **Model Compass scores** — 7 models carry `codingBenchmark.score: null` + Maple AI's
  subscription pricing; fill from the cited source URLs. (runbook §B2)
- **CSP Report-Only → Enforce** — review `[csp-report]` logs, then `CSP_MODE=enforce`.
  Still report-only in-tree (`astro.config.mjs`, verified 2026-09-05). (runbook §B6)
- **CMS auth backend** (Sveltia `/admin`) — verify a GitHub OAuth app / auth proxy is wired,
  or editors can't log in.
- **Required checks (B4)** — ⚠️ **live-state discrepancy, owner attention:** the M0-R1
  ruling (2026-07-11, recorded in PLAN.md) sent the i18n two-review gate to Required with
  owner-bypass retained — but the GitHub API on **2026-09-05 shows no branch protection
  and no rulesets on `main` at all** (classic branch-protection endpoint 404; rulesets
  list empty). Until the checks (`verify`, `security-pr`, `quality`, `i18n-security-gate`,
  `path-a`, `e2e`, `skills`) are marked required, every gate including the M0 gate is a
  loud advisory, not a merge block. The repo-side mechanism is complete; the flip is
  owner-side.
- **Astro 7** — G5 stands (out of this effort). The dependency-hygiene slice (F-8) is
  **ruled APPROVED 2026-09-01, Astro 6 only**: fix what 6.x can fix (nanoid 8.2 HIGH and
  the other advisories named in AUDIT.md N-1); the Astro-7-only remainder is documented
  as accepted-with-evidence in the audit ledger.

## 🔭 Deferred — FUTURE (see `docs/OPERATOR-RUNBOOK.md` Part B and `docs/archive/PLAN-goose-pivot.md` §5)
Goose live agent loop (`goose serve`/ACP) · server-side recipe signing + shareable links ·
full es/ar recipe-content translation.

---

## How we work (two surfaces)
- **Claude.ai Project (chat)** — planning, decisions, research, drafting. Shared instructions
  + knowledge across conversations. **One conversation per workstream.**
- **Claude Code (in-repo)** — execution: code, commits, deploys, verification. Start a **fresh
  session per task**; the repo + `CLAUDE.md` + this file orient it in seconds.
- **Keep state in the repo, not the chat** — when something lands or a decision is made,
  update the sections above so this file stays a true picture.
