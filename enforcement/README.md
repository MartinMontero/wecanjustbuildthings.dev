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
# Provider-exclusion scan of contributed skills (what site CI runs as enforce:skills)
tsx enforcement/cli.ts skill --skills src/content/docs/skills
```

Exit code is non-zero if anything violates the policy, or if a scan meets input
it cannot check. JSON reports are written to `reports/enforcement/`.

## It fails closed

The engine only vouches for what it actually read. In every scan (Layers 1-3 on
a `--tree`, the catalog check, recipes, and skills), input it cannot check is a
failure (exit 1) with a named reason, never a pass:

| Reason | Meaning |
|---|---|
| `unparseable_manifest` | a manifest's syntax could not be parsed (or it is not a mapping) |
| `unparseable_lockfile` | a lockfile's syntax could not be parsed, incl. an unresolved yarn merge conflict |
| `unsupported_lockfile` | a lockfile with no reader yet: `bun.lockb` (binary), `deno.lock`, `Pipfile.lock`, `pdm.lock` |
| `unparseable_frontmatter` | a catalog / recipe / skill page whose YAML frontmatter does not parse as a mapping |
| `unreadable_file` | the file could not be read from disk |
| `unreadable_directory` | a directory under `--tree` / `--catalog` / `--recipes` / `--skills`, or the path itself, could not be listed (e.g. it does not exist) |

Deliberate exceptions, each visible rather than silent:
- an **absent** `--skills` directory passes (no skills contributed yet is a legitimate state);
- Layer 3 skips files over 2 MB with a named warning (very large generated bundles);
- files that parse but contain entries a parser cannot resolve statically (Gradle
  version catalogs, dynamic `mix.exs` deps blocks) produce warnings.

## Layout

```
cli.ts                        argument parsing + orchestration
config.ts                     loads the two policy YAMLs
matcher.ts                    offline per-ecosystem ownership matcher
catalog-check.ts              Layer 1 over catalog frontmatter
fs-walk.ts / frontmatter.ts   shared filesystem + frontmatter helpers
excluded-organizations.yaml   WHO is excluded (ownership signals)
excluded-provider-signals.yaml WHAT data-flow strings to scan for
layer1-direct/                9 manifest parsers + registry
layer2-transitive/            lockfile parsers (one per format in parsers/index.ts) + chain-tracing walk
layer3-provider-strings/      portable scanner + recipe-contract validator
                              + contributed-skill validator (skill-validator.ts)
tests/                        node:test suite over every parser + the contract
```

## The three layers

- **Layer 1** parses `package.json`, `Cargo.toml`, `pyproject.toml` /
  `requirements.txt`, `go.mod`, `mix.exs`, `pubspec.yaml`, `Gemfile`, Gradle
  files, and Maven `pom.xml` (dependencies, managed dependencies, plugins,
  extensions, parent; exclusions are not counted), and flags directly-declared
  excluded packages. In catalog mode it reads
  each entry's frontmatter instead.
- **Layer 2** walks npm / pnpm / yarn (classic + Berry) / Bun (`bun.lock`) / Cargo / uv / Poetry /
  pip-compile / Go (`go mod graph`) / Bundler / Hex / pub / Gradle lockfiles and
  emits the full chain to any excluded package. Closure-only formats are reported
  honestly as un-traceable.
- **Layer 3** scans source for excluded imports, endpoints, and config keys;
  validates provider-agnostic recipes against their contract; and runs the same
  provider-exclusion scan over contributed skills (`skill` subcommand,
  `src/content/docs/skills`) — shipped as the additive `skills` CI gate.

## Extending it

- **New excluded org / signal:** edit the YAML files only; the matcher reads them.
- **New manifest/lockfile format:** add a parser under the matching `parsers/`
  dir, register it in that dir's `index.ts`, and add a fixture-backed test. A
  parser that cannot read its input must `throw new InputFailure(...)`
  (`input-errors.ts`), never return an empty result. Adding a lockfile reader
  also means removing its name from `UNSUPPORTED_LOCKFILES` in
  `layer2-transitive/parsers/index.ts`.
- Always add a test. The thing that enforces accountability has to be accountable.
