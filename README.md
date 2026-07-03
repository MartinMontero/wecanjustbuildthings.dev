# We Can Just Build Things

**Liberation tech for builders: make the tools your community needs — production-grade,
privacy-respecting freedom tech (Nostr, AT Protocol, and beyond) — with an AI agent
doing the heavy lifting and safeguards that have your back.**

> A harness gives the agent hands. This gives it judgment.

It's built for the organizer, the nonprofit, the collective — people who know what
their community needs and deserve to ship something professional-grade without
first becoming developers, and without their work being quietly co-opted by
surveillance infrastructure.

Goose, Claude Code, and Aider are *harnesses* — they connect an AI model to your
tools so it can execute, but they don't know what you should build, which
dependencies are safe, or what license changed last week. **We Can Just Build
Things is the layer that gives the agent judgment:** a verified dependency
catalog, values kept clean by tooling, a guided flow from idea to shipped, and
reusable agent skills — so when an agent runs, it builds on decisions already
made, verified, and documented, and what you ship is accountable to the people who
depend on it.

Live site: **https://wecanjustbuildthings.dev** · Built with Astro + Starlight ·
License: **AGPL-3.0-or-later**

---

## What's in here

### Interactive tools (Svelte islands, no React — React is Meta-owned)

| Tool | Route | What it does |
|---|---|---|
| **Build Studio** | `/build/` | Describe a project → it assembles a policy-clean stack from the catalog and generates a constitution, spec, agent prompt, and a **downloadable starter repo (.zip)** wired to the enforcement engine. |
| **Catalog explorer** | `/catalog/` | Live faceted search/filter over all entries (protocol, ecosystem, category, verification), entirely client-side. |
| **Dependency checker** | `/check/` | Paste a `package.json`/dep list → runs the exclusion policy **in your browser** with live license lookups. |
| **Edge API** | `/api/license`, `/api/health` | A Cloudflare Worker route (`worker/index.ts`) for live registry license lookups. |

### Foundations

| Piece | Where | What it is |
|---|---|---|
| **The catalog data** | `src/content/docs/catalog/` + `/catalog.json` | Tools license-checked at a commit and screened against the exclusion policy; emitted as JSON the tools consume. |
| **The build flow** | `src/content/docs/pie/` | A guided flow adapted from the PIE PDX accelerator's cookbook. |
| **The enforcement engine** | `enforcement/` | A three-layer TypeScript engine (direct + transitive + provider-string) that blocks excluded dependencies — runs in CI **and** in the browser checker. |
| **The data pipeline** | `scripts/` | Generates license-verified entries from a registry/GitHub/GitLab; weekly license & maintenance watchers. |
| **Agent skills** | `skills/`, `goose-recipes/` | The same workflows for Claude Code and Goose. |
| **The archetype** | `templates/spec-kit/nostr-web-client/` | A Spec Kit scaffold for a Nostr + AT Protocol client whose constitution forbids excluded deps. |

## The exclusion policy, enforced

Dependencies owned by **Meta, OpenAI, or xAI** are excluded — and not just in
spirit. A blocking CI engine checks three independent layers:

1. **Layer 1 — direct dependencies.** Parses 8 manifest formats and the catalog
   frontmatter; flags any directly-declared excluded package.
2. **Layer 2 — the transitive tree.** Walks 13 lockfile formats and reports the
   full chain to any excluded package (closure-only formats are flagged honestly
   as un-traceable).
3. **Layer 3 — provider strings.** Scans source for excluded SDK imports,
   endpoints, and config keys.

The exclusion of Meta, OpenAI, and xAI is **absolute — there are no exceptions to
it.** A tool that is itself *configurable* to reach an excluded provider (such as
[Shakespeare](https://gitlab.com/soapbox-pub/shakespeare)'s bring-your-own-key
model picker) is admitted **only** under a machine-checked **provider-lockdown
recipe** that **forbids every excluded provider** and verifies they are
unreachable. The recipe enforces the prohibition; it never grants an exemption
from it. Shakespeare is constrained, not trusted.

```sh
npm run enforce                         # catalog + recipe checks
npx tsx enforcement/cli.ts all --tree . # scan any project's own source tree
```

## Quickstart (development)

```sh
npm install
npm run dev            # local dev server
npm run build          # static build to dist/
npm run verify:all     # astro check + typecheck + tests + enforce + build
```

Requires **Node ≥ 22.12** (see `.nvmrc`) and, for the data pipeline, `uv`
(Python) when extracting the AOS audit spreadsheet.

### Generate catalog entries

The catalog is generated from two primary sources, with each license verified at
a commit (via npm `gitHead` or the GitHub/GitLab license commit) and SPDX-checked:

1. **The And Other Stuff dependency audit** (`data/aos-dependency-audit.csv`,
   ~1,161 rows) — extracted from the audit spreadsheet with
   `uv run --with openpyxl python scripts/extract_audit.py <audit.xlsx>`.
2. **A curated agentic-AI tools list** (`data/agentic-tools.json`, ~156 tools) —
   extracted with `scripts/extract_agentic.py <agentic.xlsx>`. Each is screened by
   **repository owner** against the policy, so OpenAI/Meta/xAI-owned tools are
   dropped automatically.

```sh
npm run data:fetch                 # both sources (or the seed if neither present)
npm run data:fetch -- --source aos      # only the AOS audit
npm run data:fetch -- --source agentic  # only the agentic list
```

Set `GITHUB_TOKEN` to raise rate limits and upgrade entries from `under_review`
to a verified LICENSE-file read (crates/PyPI/Go need it for the commit pin). The
generator is incremental and idempotent: re-running overwrites by slug and never
touches hand-authored entries (`shakespeare`, the catalog overview).

## How it stays current

- **Weekly (`license-watch.yml`)** — re-verifies licenses (SPDX + relicense-keyword
  signals) and reclassifies maintenance status; opens an issue on drift.
- **Every PR (`verify.yml`)** — schema validation, the engine's own test suite,
  the three layers, a build, and a dead-link check.
- **Every PR (`quality.yml`)** — an axe-core accessibility gate (zero serious/
  critical WCAG 2.1 A/AA violations) and Lighthouse CI budgets (performance ≥ 90,
  accessibility ≥ 95, LCP ≤ 2.5 s, CLS ≤ 0.1) on canonical pages.
- **Twice a year** — a full re-verification pass. See
  [docs: About & maintenance](https://wecanjustbuildthings.dev/about/).

The whole design assumes humans are scarce and automation is cheap — so it's meant
to **outlast its first maintainer**.

## Deployment

Static site on **Cloudflare Pages**, deployed via the dashboard **Git
integration** (Workers & Pages → Create → Pages → Connect to Git):

- Production branch `main`, build command `npm run build`, output directory
  `dist`, environment variable `NODE_VERSION=22`.
- Add the custom domain under the project's **Custom domains** tab (the apex zone
  must be on the same Cloudflare account). Add a www → apex redirect rule.
- The build needs no secrets — catalog data is committed. Optionally set
  `PLAUSIBLE_DOMAIN` for cookieless analytics (off by default — see
  [Privacy](https://wecanjustbuildthings.dev/privacy/)) and `SITE_URL` to override
  the origin for preview builds.

Pushes to `main` auto-deploy; pull requests get preview URLs. CI (`verify.yml`,
`quality.yml`, `license-watch.yml`) runs the checks and weekly maintenance — it
does not deploy.

> Prefer deploying from GitHub Actions instead of the dashboard? Use
> `cloudflare/wrangler-action` with a `pages deploy dist --project-name=…` step
> and the `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` secrets, and don't also
> connect the dashboard Git integration (to avoid double deploys).

### Auth (Sign in with Nostr / Bluesky)

Sign-in is the one feature with a backend: it runs in the Cloudflare **Worker**
(`worker/index.ts`), which serves `dist/` *and* the `/api/*` routes. It needs KV +
D1 + a signing key provisioned and a `wrangler deploy` — a different model from the
static Pages deploy above. The catalog runs fine without it (the endpoints report
"not configured" and the account widget hides). Full setup, deploy, and
verification steps are in [`docs/AUTH_PROVISIONING.md`](./docs/AUTH_PROVISIONING.md).

## Contributing

A tool gets in if it **passes the enforcement engine** and is **described
accurately**. Use the [new-tool issue
form](https://github.com/martinmontero/wecanjustbuildthings.dev/issues/new?template=new-tool.yml),
the CMS at `/admin/`, or a PR. See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Project layout

```
enforcement/   three-layer engine, policy YAML, parsers, tests
scripts/       catalog generator, license/maintenance watchers, a11y gate, registry libs
skills/        Claude Code skills   ·   goose-recipes/ Goose equivalents
templates/     Spec Kit archetypes
src/           Astro + Starlight site (content, schema, components)
data/          seed + agentic lists, SPDX list, (optional) AOS audit CSV
lighthouserc.json  Lighthouse CI budgets   ·   lychee.toml  dead-link config
```

## Acknowledgements

- The build flow adapts the open
  [PIE Cookbook](https://github.com/piepdx/pie-cookbook).
- The catalog is grounded in what the **And Other Stuff** collective uses to ship
  freedom tech.
- The provider-lockdown recipe model is anchored to
  [Shakespeare](https://gitlab.com/soapbox-pub/shakespeare)'s BYOK design.

## License

[AGPL-3.0-or-later](./LICENSE). The methodology, catalog, and engine are open so
any collective can run their own.
