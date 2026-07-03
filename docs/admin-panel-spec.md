# Admin Panel — Build Spec (design snapshot — VERIFY against live repo)

> **Status:** design complete, not yet built. **Snapshot captured 2026-06-28** against
> `main@ce558d8`. The repo is the source of truth and moves fast — Phase 0 below re-verifies
> everything before any code is written. Do not treat library versions here as authoritative;
> re-check them at build time.
>
> Place at `docs/admin-panel-spec.md`. License: AGPL-3.0-or-later.

## Objective

ONE unified, hardened admin panel covering three areas behind a separate hardened auth path:
1. **Catalog / content management** — create/edit catalog entries (matching the live
   `src/schema/catalog.ts`), Skills, and Mentor/guide content, every edit run through the
   enforcement engine.
2. **Trust & Safety moderation** — NIP-32 kind-1985 label events (MOD/X-MOD vocab per NIP-69),
   a review queue, and a CSAM escalation path to NCMEC.
3. **Analytics / ops dashboards** — privacy-respecting metrics over Cloudflare-native analytics.

Auth: admin login via **either** a Nostr account (NIP-07 extension or NIP-46 remote bunker) **or**
a Bluesky account (atproto OAuth), restricted by a **strict allowlist** of admin pubkeys/DIDs,
with **no raw nsec ever entered in-browser**. Storage: **Cloudflare-native primary** with a
**publish-to-Nostr/AT-Proto-as-source-of-truth** portability layer (default off) so there is no
hard lock-in.

## Reconciliation with the live repo (READ THIS — do not rebuild what exists)

- **Auth is already built and tested:** `worker/auth/{nostr,bluesky,session,respond,db,cf}.ts`
  with `worker/tests/auth-*.test.ts`, routed via `wrangler.jsonc` `run_worker_first: ["/api/*"]`.
  The admin panel **reuses this stack** and layers an allowlist + admin scoping on top. **Do not
  introduce a parallel Nostr/Bluesky auth library** — read `worker/auth/*` first and extend it.
- **The deployment is a hand-rolled Worker**, not the `@astrojs/cloudflare` adapter. Admin server
  routes are added as **`worker/admin/*` mirroring `worker/auth/*`** and dispatched from
  `worker/index.ts`. Astro Server Islands are a fallback only if a component genuinely needs SSR.
- **Model-free "Path A" applies even to the admin surface:** moderation is **deterministic**
  (hash-matching, NIP-32 labeling), never an LLM classifier. This also keeps it vendor-exclusion
  clean.
- **Supply-chain tooling already exists** (`.grype.yaml`, `osv-scanner.toml`,
  `scripts/osv-critical-gate.sh`, `security/vex/`, OSV/Grype/Syft/CycloneDX; **Trivy excluded**).
  Extend it to new admin deps; do not add a new scanner.
- Auth storage bindings already in `wrangler.jsonc`: KV `SESSIONS`, KV `ATPROTO`, D1 `DB`
  (`wcjbt-auth`). Admin storage is added under **`ADMIN_*`** names so it never collides.

## Hard constraints (from `CLAUDE.md` / `POLICIES.md` — non-negotiable)

- No Meta/OpenAI/xAI dependencies anywhere in the tree; **Google permitted**; run `npm run enforce`
  on anything new; never import `@nostrify/policies`' `OpenAIPolicy`.
- No runtime LLM/inference call (Path A). **Svelte, never React.** Cloudflare-native (no migration).
- `operational_advisory` inviolable; CI additions additive only. Primary sources, zero fabrication,
  stop-and-ask on ambiguity. One logical change per commit.

## Tech choices (as researched ~June 2026 — VERIFY current before installing)

- **Nostr signing (if not already covered by `worker/auth/nostr.ts`):** `nostr-tools` `BunkerSigner`
  (`nip46`) + NIP-07 types, and/or `@nostrify/nostrify` `NConnectSigner`. NIP-98 for HTTP auth.
  Never render an nsec/ncryptsec input.
- **Bluesky OAuth (if not already covered by `worker/auth/bluesky.ts`):** `@atproto/oauth-client-node`
  (`NodeOAuthClient`) + `@atproto/api`, DPoP-mandatory, `private_key_jwt` (ES256), hosted
  `client-metadata.json` + `jwks.json`, backend-for-frontend session pattern; verify the resolved
  DID against the allowlist.
- **Storage:** D1 (`ADMIN_DB`) = moderation cases/labels, audit log, catalog-edit staging; KV
  (`ADMIN_SESSIONS`) = admin sessions; R2 (`ADMIN_EVIDENCE`) = locked-down evidence; SQLite Durable
  Object (`ADMIN_COORD`) = rate-limit/CSRF/queue-lock; Queues (`ADMIN_REPORTS`) = NCMEC dispatch;
  Analytics Engine (`ADMIN_ANALYTICS`) + Web Analytics = metrics.
- **UI:** Svelte 5 islands + **shadcn-svelte** (Bits UI + Tailwind v4 + LayerChart; `@lucide/svelte`).
  Owned-source components, dependency-clean.
- **Moderation vocab:** NIP-32 (kind 1985), NIP-69 (MOD/X-MOD), portability via NIP-78 (kind 30078)
  + atproto labels. Ozone's action model (acknowledge/label/mute/takedown) as the review template.
- **CSAM:** NCMEC CyberTipline reporting under 18 U.S.C. § 2258A as amended by the **REPORT Act**
  (apparent-violation standard, one-year evidence preservation). Hash-matching via PhotoDNA / NCMEC
  hash lists. **Get legal review before go-live.**

## Phased build prompt (paste into Claude Code, in the repo)

```
OBJECTIVE: Build the unified admin panel per docs/admin-panel-spec.md. Reuse what exists; verify
before writing code; never fabricate.

CONSTRAINTS (from CLAUDE.md / POLICIES.md — read them live): no Meta/OpenAI/xAI deps (Google ok),
run `npm run enforce` on anything new, never import @nostrify/policies' OpenAIPolicy; no runtime
LLM/inference (Path A) — moderation is deterministic, not an LLM classifier; Svelte never React;
Cloudflare-native, no migration; operational_advisory inviolable, CI additive only; AGPL; one
logical change per commit; stop-and-ask on ambiguity.

PHASE 0 — GROUND TRUTH (no feature code): read CLAUDE.md, POLICIES.md, CONTRIBUTING.md,
wrangler.jsonc, worker/index.ts, worker/auth/*, src/schema/catalog.ts, src/content.config.ts,
enforcement/cli.ts, and .github/workflows/*. Confirm: how the hand-rolled Worker dispatches
/api/* routes; what auth libraries and session model worker/auth/* already use; the exact catalog
schema; how the enforcement engine is invoked. Produce a short design note + plan. STOP for review.

PHASE 1 — SERVER RUNTIME: add worker/admin/* mirroring worker/auth/*, dispatched from
worker/index.ts (do NOT add @astrojs/cloudflare). Add ADMIN_* bindings to wrangler.jsonc:
D1 ADMIN_DB, KV ADMIN_SESSIONS, R2 ADMIN_EVIDENCE, SQLite Durable Object ADMIN_COORD,
Queues ADMIN_REPORTS, Analytics Engine ADMIN_ANALYTICS. Keep the existing CSP/_headers intact.

PHASE 2 — HARDENED ADMIN AUTH: reuse worker/auth/* Nostr (NIP-07/NIP-46) + Bluesky (atproto OAuth)
verification; never render an nsec input. Add a strict allowlist of admin Nostr pubkeys (hex) +
atproto DIDs, checked server-side on every request; no self-registration. Admin sessions: opaque
token, HttpOnly+Secure+SameSite=Strict cookie, state in ADMIN_SESSIONS; CSRF nonce + rate-limit
counter in ADMIN_COORD. NIP-98 for admin API calls.

PHASE 3 — STORAGE: implement the ADMIN_* map (D1 moderation/audit/staging; KV sessions; R2 evidence
private no-public-access short-retention every-access-logged; DO coordination; Queues dispatch;
Analytics Engine + Web Analytics). D1 schema via wrangler migrations.

PHASE 4 — PORTABILITY (interface now, default off): an exporter that can publish moderation labels
as NIP-32 kind-1985 + atproto labels, app state as NIP-78 kind-30078 + atproto records, and the
audit log as signed Nostr events — so Cloudflare is primary and the protocol layer is a switchable
mirror. Dry-run only until enabled.

PHASE 5 — CATALOG/CONTENT MGMT: Svelte islands (shadcn-svelte/Bits UI/Tailwind v4/LayerChart) to
create/edit catalog MDX matching src/schema/catalog.ts, plus Skills/guide content. EVERY edit runs
through the enforcement engine before staging/publish; preserve the existing "opens a PR" path and
one-entry-per-commit convention.

PHASE 6 — T&S MODERATION: ingest reports; a review UI emitting NIP-32 kind-1985 labels (MOD/X-MOD;
delete prior moderation events per NIP-69); queue/label persistence in D1. CSAM escalation: a
separate access-restricted trauma-informed path — no inline viewing, R2-locked evidence, immutable
D1 audit, Queue-based NCMEC dispatch, PhotoDNA/NCMEC-hash hooks, 18 U.S.C. § 2258A (REPORT Act)
workflow. No excluded-vendor detection. Legal review before go-live.

PHASE 7 — ANALYTICS: dashboards over Analytics Engine + Web Analytics (traffic, catalog usage,
moderation throughput, auth/audit events) with LayerChart. No third-party analytics SDK.

PHASE 8 — CI & HARDENING: extend the existing OSV/Grype/Syft/CycloneDX workflows to admin deps and
wire the enforcement gate in; do NOT add Trivy. SHA-pin any new actions; least-privilege permissions.
Flip CSP to enforce only after auth/admin flows verify.

ACCEPTANCE: `npm run verify:all` and `npm run enforce` green; no Meta/OpenAI/xAI deps; no React.
Auth works via NIP-07/NIP-46/atproto OAuth; no nsec input; non-allowlisted identities rejected
server-side. All three areas work against the bindings; the portability exporter dry-run emits
valid NIP-32/NIP-78/atproto records. Docs/catalog pages stay static; only /api/admin/* is dynamic.

HARD STOPS (hand to me): `wrangler login`; Workers Builds GitHub-App auth; any binding/resource
creation; legal review of the CSAM path before go-live.
```

## Sequencing & caveats

Land Phase 0–2 (verify + runtime + hardened auth) as one reviewable change before features. Keep
Cloudflare primary; build portability as an interface immediately (default off). Treat CSAM handling
as a compliance feature (restricted access, immutable audit, NCMEC dispatch, no inline viewing) and
get legal review before go-live. If `@nostrify/policies` is ever pulled in, confirm Layer-3 finds no
OpenAI endpoint and never ship its `OpenAIPolicy`.
