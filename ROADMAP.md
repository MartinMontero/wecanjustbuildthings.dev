# ROADMAP / STATUS

A living snapshot of where **wecanjustbuildthings.dev** stands — what's done, what's
blocked, what needs a decision, what's deferred. **Read this first** when picking up the
project in a new session or conversation.

**Last updated:** 2026-06-30 · **Canonical branch:** `main` (sole branch; GitHub default)

> Detailed external-operator tasks + the deferred-work ledger live in
> `docs/OPERATOR-RUNBOOK.md`. Non-negotiable constraints live in `CLAUDE.md`.
> This file is the high-level index; keep it current as things land.

---

## Current state
- `main` is the single source of truth; production **auto-deploys via Cloudflare Workers
  Builds** (Git-connected) — there is no `wrangler deploy` in CI.
- The live site is up; the catalog + guided build flow work without any secrets.
- Auth (Sign in with Nostr / Bluesky, GitHub one-click) is wired and was confirmed live.

## ✅ Done (merged to `main`)
- **Marmot/MLS integration** (#29): catalog cluster (19 entries), 4 skills + Goose recipes,
  the encrypted-group-messaging guide, the `nostr-mls-group-messaging` Spec-Kit archetype, a
  Build Studio stack-contract test. Catalog i18n routed to the `translate-catalog` workflow.
- **Branch reconciliation**: `main` promoted to canonical default; all stale/feature branches
  retired with nothing lost.
- **Auth storage provisioning** (#30): `scripts/provision-auth.ts` + corrected
  `docs/AUTH_PROVISIONING.md`. KV×2 + D1 IDs verified against the account; migration applied.
- **Auth API routing fix** (#32): `run_worker_first: ["/api/*"]`. `/api/*` had been shadowed
  by static-asset handling, so the auth API had **never** worked on the domain. Fixed,
  deployed, all four `/api/*` status endpoints confirmed live.
- **Dependabot triage** (#34): wrangler 4.100 → 4.104 cleared 4 high-severity dev-tool CVEs
  (11 → 5 alerts). The remaining 5 are dev/build/CI tooling with no production exposure.
- **Context7 MCP** (#35): project-scoped `.mcp.json`, key via `${CONTEXT7_API_KEY}` env var
  (never in the file), local approval in gitignored `.claude/settings.local.json`.
- **GitHub OAuth** app registered; Worker secrets set (`BLUESKY_PRIVATE_KEY_JWK`,
  `GITHUB_OAUTH_CLIENT_ID/SECRET`).
- **Cloudflare CLI/agent token** (`CLOUDFLARE_API_TOKEN`) — verified working 2026-06-30:
  resolves to `These3remain@gmail.com's Account` (`7c69…1ee5`); `whoami` / KV list / D1 list /
  `deployments status` all succeed. Lacks Pages + User Details:Read by design (not needed).
  To re-create on an account move: Workers Scripts·Edit, Workers KV·Edit, D1·Edit (+ account read).
- **Workers Builds deploy credential** — the Build → API token is now a
  wecanjustbuildthings-owned token; verified end-to-end 2026-06-30 (a push to `main` ran
  `npm run build` + `npx wrangler deploy` and produced a fresh production deployment
  `a0b51c43`, ~4 min after push).

## ⛔ Blocked / watch (none of these take the live site down)
- _Nothing currently blocked or on watch._

### ✅ Recently resolved
- **`CONTEXT7_API_KEY` / Context7 MCP egress — RESOLVED 2026-06-30** (environment/operator
  change, not a code merge). Both former concerns cleared:
  - *Durability + key validity:* the key lives in the durable **environment settings**
    (injected into the **MCP subprocess**, not the interactive shell) and is **valid** — a
    web-session `resolve-library-id "Astro"` MCP call returned real `/withastro/docs` results.
  - *Web-session egress:* `context7.com` is now **allowlisted** in this environment's network
    policy. The same MCP call that previously surfaced `403` on CONNECT / `fetch failed` now
    succeeds, so Context7 doc lookups work in Claude Code on the web. `.mcp.json` is unchanged
    and correct — still do **not** run `npx ctx7 setup` (it risks inlining the key, breaking
    the key-never-in-the-file rule).

## 🤔 Decisions needed (none block the live site)
- **Alfred's PWA** — a **separate** project. If deployed from here, give it its own
  `wrangler.jsonc` (distinct worker name) and confirm scope/repo.
- **Cost Estimator prices** — all `null` placeholders; confirm real numbers (data + sign-off,
  not engineering) or hide the module. *Highest user-facing impact.* (runbook §B1)
- **Model Compass scores** — `null`; fill from the cited SWE-bench source URLs. (runbook §B2)
- **CSP Report-Only → Enforce** — review `[csp-report]` logs, then `CSP_MODE=enforce`. (runbook §B6)
- **CMS auth backend** (Sveltia `/admin`) — verify a GitHub OAuth app / auth proxy is wired,
  or editors can't log in.
- **Required checks** — mark `path-a` / `e2e` / `skills` as required in branch protection.
- **Dependabot remainder** — leave (dev-only) or schedule a framework-upgrade pass (Astro 6→7).

## 🔭 Deferred — FUTURE (see `docs/OPERATOR-RUNBOOK.md` Part B and `PLAN.md` §5)
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
