# We Can Just Build Things

**A verified, values-enforced catalog and guided build flow for shipping Nostr,
AT Protocol, and general open-source tools with AI agents.**

> A harness gives you hands. This gives you judgment.

Goose, Claude Code, and Aider are *harnesses* — they connect an AI model to your
tools so it can execute. They don't know what you should build, which
dependencies are safe, or what license changed last week. **We Can Just Build
Things is the layer above the harness:** a verified dependency catalog, an
exclusion policy enforced by tooling, a guided decision flow, and reusable agent
skills — so when an agent runs, it runs inside a frame of decisions that have
already been made, verified, and documented.

Live site: **https://wecanjustbuildthings.dev** · Built with Astro + Starlight ·
License: **AGPL-3.0-or-later**

---

## What's in here

| Piece | Where | What it is |
|---|---|---|
| **The catalog** | `src/content/docs/catalog/` | Tools license-checked at a commit and screened against the exclusion policy. |
| **The build flow** | `src/content/docs/pie/` | A guided flow adapted from the PIE PDX accelerator's cookbook. |
| **The enforcement engine** | `enforcement/` | A three-layer TypeScript engine (direct + transitive + provider-string) that blocks excluded dependencies. |
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

The single exception is a **provider-agnostic recipe** — a machine-checked
configuration for a tool that can use *either* an excluded or a permitted
provider (e.g. [Shakespeare](https://gitlab.com/soapbox-pub/shakespeare)).

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

The catalog is generated from primary sources (license verified at a commit via
npm `gitHead` or the GitHub/GitLab license commit):

```sh
npm run data:fetch              # from data/seed-catalog.json (or the AOS CSV)
```

To scale to the full AOS dependency audit, drop `data/aos-dependency-audit.csv`
(produced by `scripts/extract_audit.py` from the audit spreadsheet) into `data/`
and re-run `npm run data:fetch`. Set `GITHUB_TOKEN` to raise rate limits and pin
licenses for crates/PyPI/Go entries.

## How it stays current

- **Weekly (`license-watch.yml`)** — re-verifies licenses (SPDX + relicense-keyword
  signals) and reclassifies maintenance status; opens an issue on drift.
- **Every PR (`verify.yml`)** — schema validation, the engine's own test suite,
  the three layers, a build, and a dead-link check.
- **Twice a year** — a full re-verification pass. See
  [docs: About & maintenance](https://wecanjustbuildthings.dev/about/).

The whole design assumes humans are scarce and automation is cheap — so it's meant
to **outlast its first maintainer**.

## Deployment

Static site on **Cloudflare Pages** (`deploy.yml`). Set repository secrets
`CLOUDFLARE_API_TOKEN` (Pages-Edit) and `CLOUDFLARE_ACCOUNT_ID`, create a Pages
project named `wecanjustbuildthings` (build `npm run build`, output `dist`,
`NODE_VERSION=22`), then push to `main`. Optional: set `PLAUSIBLE_DOMAIN` at build
time for cookieless analytics (off by default — see
[Privacy](https://wecanjustbuildthings.dev/privacy/)).

## Contributing

A tool gets in if it **passes the enforcement engine** and is **described
accurately**. Use the [new-tool issue
form](https://github.com/martinmontero/wecanjustbuildthings.dev/issues/new?template=new-tool.yml),
the CMS at `/admin/`, or a PR. See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Project layout

```
enforcement/   three-layer engine, policy YAML, parsers, tests
scripts/       catalog generator, license/maintenance watchers, registry libs
skills/        Claude Code skills   ·   goose-recipes/ Goose equivalents
templates/     Spec Kit archetypes
src/           Astro + Starlight site (content, schema, components)
data/          seed catalog, SPDX list, (optional) AOS audit CSV
```

## Acknowledgements

- The build flow adapts the open
  [PIE Cookbook](https://github.com/piepdx/pie-cookbook).
- The catalog is grounded in what the **And Other Stuff** collective uses to ship
  freedom tech.
- The provider-agnostic exception models
  [Shakespeare](https://gitlab.com/soapbox-pub/shakespeare)'s BYOK design.

## License

[AGPL-3.0-or-later](./LICENSE). The methodology, catalog, and engine are open so
any collective can run their own.
