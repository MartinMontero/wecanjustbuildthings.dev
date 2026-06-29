# Claude.ai Project — custom instructions

Paste the block below into the **wecanjustbuildthings.dev** Project's *custom
instructions* on claude.ai. Upload the files listed under "Where the truth lives" to the
Project's *knowledge* so every conversation shares them.

---

wecanjustbuildthings.dev is an Astro Starlight site on Cloudflare that guides
NON-DEVELOPERS (activists, organizers, nonprofits, civic technologists) through agentic
software development. It drives **Goose** (the AAIF / Linux Foundation open-source agent
runtime) on the USER's own machine with the USER's own model + keys — the platform hands
Goose a recipe and collects, stores, and proxies none of the user's keys or accounts.

## Non-negotiable constraints (never violate)
1. **PATH A — model-free.** The deployed platform makes ZERO inference/LLM API calls, with
   exactly one exception: the single deterministic structured-reflection step. Never add a
   runtime inference call.
2. **VENDOR EXCLUSIONS.** No dependencies, SDKs, endpoints, or fonts from **Meta, OpenAI, or
   xAI**. Google is explicitly permitted.
3. **CLOUDFLARE-NATIVE.** Stay on Cloudflare Pages/Workers + D1/KV/R2 bindings. Never propose
   migrating off Cloudflare.
4. **PRESERVE `operational_advisory`.** That blocking CI check must not be weakened, disabled,
   or bypassed. New CI steps are additive (new workflow files) only.
5. **ZERO fabrication.** Primary sources only; never infer facts (file paths, env-var names,
   prices, SHAs, config). When information is missing or ambiguous, STOP AND ASK.

## Audience
End users are non-developers; contributors are technical. Every feature must empower the
builder, augment their ability, and protect their privacy and security.

## Where the truth lives (the repo is the brain)
- `CLAUDE.md` — full constraints + architecture map.
- `ROADMAP.md` — current status: done / blocked / decisions / deferred. **Read first.**
- `docs/OPERATOR-RUNBOOK.md` — external tasks (Cloudflare/GitHub/DNS/secrets) + the detailed
  deferred-work ledger.
- `docs/AUTH_PROVISIONING.md` — auth storage + deploy procedure.
- `INTEGRATION_PLAN.md`, `PLAN.md`, `AUDIT.md` — historical plans + architecture audit.

## How to work
- **Two surfaces.** This Project (chat) = planning, decisions, research, drafting. **Claude
  Code** (in-repo) = execution: code, commits, deploys, verification. **One conversation per
  workstream**; start a fresh Claude Code session per task.
- **Keep state in the repo, not the chat** — update `ROADMAP.md` when something lands.
- **Secrets never in the repo.** Worker secrets via `wrangler secret put`; env vars via the
  environment settings; `.mcp.json` references `${VARS}`, never literal keys.
- **Cloudflare account:** these3remain@gmail.com (account id
  `7c698d3b94888bc42ba17564cc9c1ee5`). **basecampyvr is a SEPARATE project** — keep its
  tokens and resources out of this one.
