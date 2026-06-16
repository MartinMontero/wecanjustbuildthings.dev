# Provisioning & deploying auth (Sign in with Nostr / Bluesky)

The catalog site is static and needs no backend. **Sign-in is the one feature
that does** — it runs in the Cloudflare **Worker** at `worker/index.ts`, which
serves the static `dist/` (via the `ASSETS` binding) *and* the `/api/*` routes.

This is a different deployment model from the plain static site (see the README
"Deployment" section): the static site can live on **Cloudflare Pages**, but
**auth requires the Worker**. Pick one of these topologies:

- **Worker serves everything (recommended).** `wrangler deploy` uploads the Worker
  with `dist/` as its assets; point the production domain at the Worker. Retire
  the Pages Git integration (or keep it only for preview URLs) so the domain
  isn't served by both.
- **Keep Pages, run an API-only Worker.** Put the Worker on a route like
  `wecanjustbuildthings.dev/api/*` and drop the `assets` block from
  `wrangler.jsonc`. Pages keeps serving the site; the Worker only answers `/api/*`.

The steps below assume the recommended topology.

> Nothing here is required to run or contribute to the catalog. Until the
> resources exist, the auth endpoints degrade gracefully — `*/status` reports
> `{ configured: false }`, the account widget hides the provider, and the site
> runs normally.

## Prerequisites

- A Cloudflare account, and `wrangler` authenticated: `npx wrangler login`.
- Node 22+ (`npm ci`).

## 1 — Create the storage and paste the ids

Auth uses two KV namespaces and one D1 database. Create them, then paste the
returned ids into `wrangler.jsonc` (they're committed as `PLACEHOLDER_*` on
purpose, so a deploy fails fast until they're real).

```sh
npx wrangler kv namespace create SESSIONS   # → id for kv_namespaces[binding=SESSIONS]
npx wrangler kv namespace create ATPROTO    # → id for kv_namespaces[binding=ATPROTO]
npx wrangler d1 create wcjbt-auth           # → database_id for d1_databases[binding=DB]
```

- `SESSIONS` — app sessions (`sess:<id>`) and single-use Nostr challenges (`chal:<v>`).
- `ATPROTO` — AT Protocol OAuth state/session stores and DID/handle caches.
- `DB` (`wcjbt-auth`) — the identity model (`users`, `identities`).

Edit `wrangler.jsonc` and replace each `PLACEHOLDER_*` with the real id.

## 2 — Apply the database migration

```sh
npm run migrate          # wrangler d1 migrations apply wcjbt-auth --remote
```

This creates `users` + `identities` (see `migrations/0001_auth.sql`). The schema
stores the minimum to recognise a returning user — provider + subject
(pubkey/DID) and an optional display name. No emails, handles-as-identifiers,
tokens, or profile data.

## 3 — Set the Bluesky signing key (secret)

Sign in with Bluesky signs `private_key_jwt` client assertions with an ES256 key.
Generate it once and store it as a Worker secret; the public half is derived at
runtime and published at `/api/auth/bluesky/client-metadata.json`.

```sh
npm run gen:bluesky-key | npx wrangler secret put BLUESKY_PRIVATE_KEY_JWK
# (or run `npm run gen:bluesky-key`, copy the printed JSON line, then
#  `npx wrangler secret put BLUESKY_PRIVATE_KEY_JWK` and paste it)
```

Nostr needs **no** secret — the client signs in the browser (NIP-07/NIP-46); the
Worker only issues a challenge and verifies the signature.

## 4 — (Optional) GitHub one-click repo creation

Separate from sign-in, but the same Worker. To enable the "create a repo" button
in the Build Studio, register a GitHub OAuth app and set:

```sh
npx wrangler secret put GITHUB_OAUTH_CLIENT_ID
npx wrangler secret put GITHUB_OAUTH_CLIENT_SECRET
```

## 5 — Confirm SITE_URL

`wrangler.jsonc` sets `vars.SITE_URL = https://wecanjustbuildthings.dev`. It must
be the **public HTTPS origin** the Worker is served from — it pins the Nostr
NIP-98 `u` tag and the Bluesky OAuth redirect/client-metadata URLs. Change it if
you deploy under a different domain.

## 6 — Build and deploy

```sh
npm run build            # produces dist/ (the Worker's static assets)
npm run deploy:dry       # optional: validate the bundle + bindings without uploading
npm run deploy           # wrangler deploy
```

Then attach the production domain to the Worker (Workers & Pages → your Worker →
Settings → Domains & Routes → Custom Domain), and make sure the same domain isn't
also being served by a Pages project.

## 7 — Verify the deployment

```sh
curl https://wecanjustbuildthings.dev/api/health             # {"ok":true}
curl https://wecanjustbuildthings.dev/api/auth/nostr/status   # {"configured":true}
curl https://wecanjustbuildthings.dev/api/auth/bluesky/status # {"configured":true}
curl https://wecanjustbuildthings.dev/api/auth/bluesky/client-metadata.json
```

When both `*/status` report `configured: true`, the account widget in the header
offers the provider(s). Do a real sign-in with each: a Nostr extension (e.g.
nos2x, Alby) and a Bluesky handle.

## Local development

```sh
cp .dev.vars.example .dev.vars   # fill in SITE_URL (and optionally a Bluesky key)
npm run build                    # the Worker serves dist/, so build first
npm run migrate:local            # apply the migration to a local D1
npx wrangler dev --port 8788     # Worker + local KV/D1 at http://localhost:8788
```

With `.dev.vars` providing only `SITE_URL`, `/api/auth/nostr/status` reports
`configured: true` (KV + D1 are simulated locally) while Bluesky stays
`configured: false` until you add `BLUESKY_PRIVATE_KEY_JWK`. The full Bluesky
OAuth round-trip can't complete from `http://localhost` (the PDS must reach a
public client-metadata URL), but everything else — Nostr sign-in, session,
status, the widget — works locally.

## What's stored, and what isn't

- **Sessions** live in KV, keyed by an opaque id; the cookie is `HttpOnly`,
  `Secure`, `SameSite=Lax`.
- **Identity** is `(provider, subject)` → a random `user.id`. The session API
  exposes only `{ id, displayName }` — never the pubkey/DID subject.
- **Bluesky** is used for identity only: the AT Protocol tokens are not persisted
  for posting on the user's behalf.
