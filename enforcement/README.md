# Enforcement engine

Agents: **read this and `../POLICIES.md` before touching the catalog.**

A three-layer, offline, deterministic TypeScript engine that enforces the
[exclusion policy](../POLICIES.md). It matches against checked-in policy files, so
the same input always produces the same result — no network, no flakiness.

## Run it

```sh
# Catalog frontmatter + recipe contract (what the site CI runs)
tsx enforcement/cli.ts all --catalog src/content/docs/catalog --recipes src/content/docs/recipes
# Scan any project's own source tree (manifests, lockfiles, provider strings)
tsx enforcement/cli.ts all --tree path/to/project
# A single layer
tsx enforcement/cli.ts layer2 --tree path/to/project
# Validate one recipe
tsx enforcement/cli.ts recipe src/content/docs/recipes/shakespeare-byok-configuration.mdx
```

Exit code is non-zero if anything violates the policy. JSON reports are written to
`reports/enforcement/`.

## Layout

```
cli.ts                        argument parsing + orchestration
config.ts                     loads the two policy YAMLs
matcher.ts                    offline per-ecosystem ownership matcher
catalog-check.ts              Layer 1 over catalog frontmatter
fs-walk.ts / frontmatter.ts   shared filesystem + frontmatter helpers
excluded-organizations.yaml   WHO is excluded (ownership signals)
excluded-provider-signals.yaml WHAT data-flow strings to scan for
layer1-direct/                8 manifest parsers + registry
layer2-transitive/            13 lockfile parsers + chain-tracing walk
layer3-provider-strings/      portable scanner + recipe-contract validator
tests/                        node:test suite over every parser + the contract
```

## The three layers

- **Layer 1** parses `package.json`, `Cargo.toml`, `pyproject.toml` /
  `requirements.txt`, `go.mod`, `mix.exs`, `pubspec.yaml`, `Gemfile`, and Gradle
  files, and flags directly-declared excluded packages. In catalog mode it reads
  each entry's frontmatter instead.
- **Layer 2** walks npm / pnpm / yarn (classic + Berry) / Cargo / uv / Poetry /
  pip-compile / Go (`go mod graph`) / Bundler / Hex / pub / Gradle lockfiles and
  emits the full chain to any excluded package. Closure-only formats are reported
  honestly as un-traceable.
- **Layer 3** scans source for excluded imports, endpoints, and config keys, and
  validates provider-agnostic recipes against their contract.

## Extending it

- **New excluded org / signal:** edit the YAML files only; the matcher reads them.
- **New manifest/lockfile format:** add a parser under the matching `parsers/`
  dir, register it in that dir's `index.ts`, and add a fixture-backed test.
- Always add a test. The thing that enforces accountability has to be accountable.
