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

## ⛔ Blocked / watch (none of these take the live site down)
- **`CLOUDFLARE_API_TOKEN` (CLI/agent)** — rotate to a properly-scoped token: Workers
  Scripts·Edit, Workers KV·Edit, D1·Edit, Pages·Edit, Account Settings·Read, Memberships·Read;
  account `7c698d3b94888bc42ba17564cc9c1ee5`; no/long TTL. Set it in the environment settings,
  then start a **fresh session** (a resumed session caches the old value). Blocks CLI
  verification + manual deploys — **not** the running site or Git-push auto-deploys.
- **Workers Builds API token** — must be a wecanjustbuildthings-owned token. If it's set to a
  token borrowed from any other project, swap it in Workers Builds → Settings → Build → API
  token, and confirm it isn't expiring.
- **`CONTEXT7_API_KEY` / Context7 MCP** — two separate things:
  - *Durability:* move the key from `~/.bashrc` to the durable **environment settings**.
    It's injected into the **MCP subprocess**, not the interactive shell (verified
    2026-06-30: `CONTEXT7_API_KEY` is unset in the web session's shell and absent from
    `~/.bashrc`, yet the `context7` server still started — so it's coming from elsewhere;
    confirm it's the durable env settings so it survives container resets).
  - *Web-session gotcha — DON'T re-chase this:* Context7 doc lookups **cannot work in
    Claude Code on the web** as currently configured, regardless of the key. This
    environment's **network policy denies `context7.com` egress** — the agent proxy
    returns `403` on CONNECT (`recentRelayFailures` lists `context7.com:443`), which the
    MCP server surfaces as the misleading `fetch failed` / `TypeError: fetch failed`. It
    is **not** a key/auth problem. To use Context7 in *web* sessions, allowlist
    `context7.com` in the environment's network policy; it already works **locally**
    (no egress wall). `.mcp.json` itself is correct — do **not** run `npx ctx7 setup`
    (it would rewrite the config and risks inlining the key, breaking the
    key-never-in-the-file rule).

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
