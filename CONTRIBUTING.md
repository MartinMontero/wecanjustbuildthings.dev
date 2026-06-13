# Contributing

Thanks for helping build shared infrastructure for freedom tech. The bar here is
**mechanical, not social**: a contribution lands if it passes the enforcement
engine and is described accurately.

## Three ways to contribute a tool

1. **Issue form (easiest).** Open a
   [new-tool issue](https://github.com/martinmontero/wecanjustbuildthings.dev/issues/new?template=new-tool.yml)
   with the dependency name, ecosystem, primary-source URL, and what it does.
2. **CMS, no Git.** Visit `/admin/` on the deployed site, sign in with GitHub, and
   fill the form. It opens a pull request for you.
3. **Pull request.** Add your tool to `data/seed-catalog.json` and run the
   generator, or hand-write the `.mdx`.

## Local setup

```sh
npm install
npm run dev
```

Node ≥ 22.12 (`.nvmrc`). For the catalog generator and watchers, optionally set
`GITHUB_TOKEN` to raise API rate limits.

## Adding a catalog entry by PR

```sh
# 1. add a row to data/seed-catalog.json:
#    { "name": "...", "ecosystem": "js", "entry_type": "library",
#      "category": "...", "protocols": ["nostr"], "what_it_does": "..." }

# 2. generate it (fetches license @ commit, maintenance, metadata):
npm run data:fetch -- --source seed

# 3. it must pass BOTH:
npm run check       # frontmatter schema
npm run enforce     # three-layer exclusion policy + recipe contract
```

Entry rules:
- `license_spdx` is a valid SPDX id **read from the primary source**, never guessed.
- A `verified` entry pins `license_source_commit_sha`; otherwise it's
  `under_review` (which is fine — honesty over false confidence).
- `what_it_does` is one plain-language paragraph a non-developer could follow.
- The tool is not owned by Meta, OpenAI, or xAI. If it merely *supports* a
  permitted provider, add a [provider-agnostic recipe](https://wecanjustbuildthings.dev/policies/enforcement/#the-exception-recipes)
  instead.

## Adding a recipe

Recipes are the **only** exclusion exception. A recipe must:
- target a catalog entry marked `provider_agnostic: true`;
- list every excluded LLM provider in `must_not_be_one_of`;
- include verification steps that block the excluded providers' endpoints.

The recipe validator (`enforcement/cli.ts layer3 --recipes …`) enforces all of
this. See `src/content/docs/recipes/shakespeare-byok-configuration.mdx` for a
passing example.

## Working on the engine

The enforcement engine has its own test suite. If you touch a parser, add or
update a fixture-backed test:

```sh
npm test                 # node --test over enforcement/tests
npm run typecheck:tools  # tsc over enforcement/ and scripts/
```

Never bypass a layer. If the engine has a false positive, file it with a failing
test case — false positives are fixed in the engine, not waved through with
suppressions.

## Commits & PRs

- One catalog entry per commit (`catalog: add <slug> (<spdx> @ <sha7>)`).
- Fill in the PR template's checklist.
- CI runs `astro check`, the engine, the test suite, a build, and a dead-link
  check on every PR. All must be green.

## Code of conduct

By participating you agree to the [Code of Conduct](./CODE_OF_CONDUCT.md).
