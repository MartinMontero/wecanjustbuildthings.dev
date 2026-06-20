# Operator runbook

External tasks that live **outside the codebase** — credentials, Cloudflare/GitHub
dashboard settings, registrations, DNS — plus everything still **deferred**, why, and
what each needs to be built.

The site degrades gracefully without any of Part A: the catalog and the guided build
flow work fully without auth or deploy secrets. The auth endpoints report
`{ configured: false }` and the account widget hides the unconfigured provider. So
nothing here blocks contributors or the build flow — it gates the **account + deploy**
features and the production hardening.

File/line references (e.g. `wrangler.jsonc:16`) point at the source of truth and may
drift over time; treat them as starting points, not exact addresses.

---

## Part A — Tasks only an operator can do (outside Claude Code)

### ☁️ Cloudflare

| Task | Where | Status / notes |
|---|---|---|
| KV + D1 provisioning (`SESSIONS`, `ATPROTO`, `DB`) | `wrangler kv namespace create` / `d1 create` | `wrangler.jsonc:16-22` already holds **real IDs**, so this looks **done** on the current account. Re-run only when moving accounts (`docs/AUTH_PROVISIONING.md` §1). |
| Apply the D1 migration | `npm run migrate` (`--remote`) | Creates `users` + `identities` (`migrations/0001_auth.sql`). Run once per environment. |
| Set Worker secrets | `wrangler secret put …` | `BLUESKY_PRIVATE_KEY_JWK`, `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`. Not verifiable from the repo — confirm with the curl checks below. |
| Confirm deploy topology | CF dashboard | Auth needs the **Worker**, not plain Pages. Either Worker-serves-everything (recommended) or Pages + an API-only Worker (`docs/AUTH_PROVISIONING.md` top). |
| Attach the custom domain to the Worker | Workers & Pages → Domains & Routes | Ensure the same domain isn't *also* served by a Pages project. |
| Workers Builds env vars (build-time) | CF Workers Builds → Settings → Variables | `SITE_URL`, optional `PLAUSIBLE_DOMAIN` (enables analytics), and `CSP_MODE=enforce` to flip the CSP out of report-only (Part B §6). |
| Review CSP reports, then flip to enforce | Workers Logs (`observability` on, `wrangler.jsonc:33`) | CSP currently ships **Report-Only** (`astro.config.mjs:63`). After a clean soak, set `CSP_MODE=enforce`. |

### 🐙 GitHub

| Task | Where | Notes |
|---|---|---|
| Register a GitHub OAuth app for one-click repo creation | github.com/settings/developers | Feeds `GITHUB_OAUTH_CLIENT_ID/SECRET`. Until set, the Studio shows *"Saving straight to GitHub isn't switched on"* (`src/components/BuildStudio.svelte:60`; `/api/github/status` → `configured:false`). |
| Sveltia CMS auth backend | A GitHub OAuth app / auth proxy for the CMS | `/admin` uses `backend: github` (`public/admin/config.yml:1-3`). Editors can't log into the CMS without a GitHub OAuth app + auth endpoint wired to Sveltia. **Verify this is set up** — it's distinct from the repo-creation app above. |
| Add the `ANTHROPIC_API_KEY` Actions secret | repo → Settings → Secrets → Actions | Only for the optional `translate-catalog.yml` workflow (`:69`). Everything else uses the auto `GITHUB_TOKEN` or keyless OIDC. |
| Mark the additive gates as required checks | repo → Settings → Branch protection | `path-a`, `e2e`, `skills` (and `verify`/`security-pr`/`quality`) run on PRs but only **block merges** if marked required. |
| Decide the production-branch strategy | repo settings | Work currently lands on a feature branch; the workflows + Workers Builds key off `main` and PRs. Confirm whether/how the feature branch promotes to `main`. |

### 🦋 AT Protocol (Bluesky sign-in)

- **Generate + install the ES256 signing key:**
  `npm run gen:bluesky-key | wrangler secret put BLUESKY_PRIVATE_KEY_JWK` (`docs/AUTH_PROVISIONING.md` §3). The public half auto-publishes at `/api/auth/bluesky/client-metadata.json`.
- **Requires a public HTTPS origin** — the OAuth round-trip can't complete from
  `localhost` (the PDS must reach the client-metadata URL), so it only fully works on the
  deployed domain.
- No app registration beyond the key (AT Proto OAuth is client-metadata-based).

### 🟣 Nostr (sign-in)

- **Nothing to configure** — Nostr needs no secret (`docs/AUTH_PROVISIONING.md` §3). The
  Worker issues a challenge and verifies a NIP-98 signature; the user's browser extension
  (NIP-07: nos2x, Alby) signs (`src/components/AccountWidget.astro:10`, `worker/auth/nostr.ts`).
- The only "task" is user-side: visitors need a NIP-07 extension — worth a one-line note
  in the public docs.

### 🔵 Google (optional, explicitly permitted)

- Analytics is **off by default** (privacy-first). To enable, set `PLAUSIBLE_DOMAIN`
  (`astro.config.mjs:76`) — note that's **Plausible**, not Google. No Google key is
  required anywhere today; Fonts/reCAPTCHA/Maps are not wired in. Nothing to do unless you
  want analytics.

### ✅ Verify deployment state

```sh
curl https://wecanjustbuildthings.dev/api/health                 # {"ok":true}
curl https://wecanjustbuildthings.dev/api/auth/nostr/status       # configured:true
curl https://wecanjustbuildthings.dev/api/auth/bluesky/status     # configured:true once the key is set
curl https://wecanjustbuildthings.dev/api/github/status           # configured:true once the OAuth app is set
```

### Consolidated secret / env inventory

| Kind | Names | Set where |
|---|---|---|
| Runtime Worker secrets | `BLUESKY_PRIVATE_KEY_JWK`, `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` | `wrangler secret put` |
| Build-time env | `SITE_URL`, `PLAUSIBLE_DOMAIN` (opt), `CSP_MODE` (opt) | Workers Builds variables / CI |
| CI secret | `ANTHROPIC_API_KEY` (opt) | GitHub Actions secrets |
| Bindings | `SESSIONS` (KV), `ATPROTO` (KV), `DB` (D1) | `wrangler.jsonc` |
| Runtime var | `SITE_URL` | `wrangler.jsonc:23-27` |

Deploys are handled by **Cloudflare Workers Builds** (dashboard-connected repo) — there is
no `wrangler deploy` in CI, so no `CLOUDFLARE_API_TOKEN` is needed in GitHub Actions.

---

## Part B — Everything still deferred (what, why, what it needs)

### 1. Cost Estimator — all prices are placeholders ⚠️ (highest-impact)
- **What:** Every price line in `src/modules/cost-estimator/registry/providers.ts` is
  `unitPrice: null`, and the tier bands + scaling factors in `config/tiers.ts` are
  explicitly *"placeholders, not finalized product decisions."*
- **Why deferred:** The "zero fabrication" rule forbids guessing prices — `null` means
  *"not yet confirmed against a primary source; never fabricate"* (`core/types.ts:40`).
- **What it needs:** A product owner to confirm real numbers against primary pricing pages
  (Cloudflare R2/D1/Workers, etc.) and stamp `lastVerified` dates. The code is ready — this
  is data entry + sign-off, not engineering. **Decision:** confirm the prices or hide the
  module until then.

### 2. Model Compass — missing benchmark scores
- **What:** Several models (Mistral, Cohere, Gemma) carry `codingBenchmark.score: null`
  (`src/modules/model-compass/registry/models.ts:37,53,96`).
- **Why:** Same zero-fabrication rule — scores must come from a cited source.
- **What it needs:** Confirm SWE-bench Verified scores from the vendor source URLs already
  recorded in each entry, then fill the `score` fields.

### 3. Goose live agent loop (`goose serve` / ACP-over-HTTP / TS SDK)
- **What:** Replace the current "bring back the JSON your Goose run produced" step with a
  live, streamed session.
- **Why deferred:** Experimental (mid-2026), and it would mean the platform drives a live
  loop — a meaningful architecture step (`PLAN.md` §5). `reflectFromResponse` was
  deliberately designed to later accept a streamed response without changing its
  deterministic contract.
- **What it needs:** A stable Goose serve/ACP endpoint to target, plus a decision on where
  the loop runs (it must not put a model-inference call on the **platform** side — Path A).

### 4. Server-side recipe signing / shareable recipe links
- **What:** Sign recipes and produce shareable links (today there's only the client-side
  `goose://` deeplink + the zip).
- **Why deferred:** Needs the Worker (server-side signing/storage); out of the pure-client
  scope the pivot stayed within (`PLAN.md` §5).
- **What it needs:** A Worker endpoint + a signing key + a storage decision (KV/R2), and a
  UX for link expiry/revocation.

### 5. Full catalog translation for es/ar recipes
- **What:** Localized extension/recipe **content** in Spanish and Arabic (the UI is
  translated; recipe/extension copy is not fully localized).
- **Why deferred:** Scope (`PLAN.md` §5).
- **What it needs:** Run/extend `npm run translate:catalog` (needs `ANTHROPIC_API_KEY`)
  over recipe/extension content, then human review of the machine output (the
  `machine_translated` schema flag already exists for surfacing an advisory).

### 6. CSP: Report-Only → Enforce
- **What:** Flip the Content-Security-Policy from report-only to enforced.
- **Why deferred:** A deliberate soak window to catch violations from the live auth/CMS
  flows before enforcing (`src/lib/security-headers.ts:14-16`).
- **What it needs:** Review the `[csp-report]` entries in Workers Logs, then set
  `CSP_MODE=enforce` (and handle the GitHub/CMS origins noted at `security-headers.ts:104`).
  Operator-gated, not code-gated.

### Resolved (kept for the record)
- **Enforcement layer-3 for contributed skills** — now shipped (`.github/workflows/skills.yml`
  + `enforcement/layer3-provider-strings/skill-validator.ts`). A contributed skill gets the
  Meta/OpenAI/xAI provider-string scan recipes get, as an additive blocking gate that leaves
  `operational_advisory` untouched.

---

*Maintained by hand. When a deferred item is built or an external task is completed, move it
to the resolved record (or delete the row) so this file stays a true picture of what's left.*
