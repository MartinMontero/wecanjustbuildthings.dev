---
name: catalog-entry-author
description: >-
  Use when adding or updating a catalog entry for wecanjustbuildthings.dev.
  Fetches a dependency's license verified at a commit, fills the frontmatter per
  the content schema, and runs the three-layer enforcement engine BEFORE
  committing — refusing to commit on a policy violation. Triggers: "add a tool",
  "index a dependency", "new catalog entry", "add this package to the catalog".
---

# catalog-entry-author

Author a single, accurate, policy-clean catalog entry. **Never speculate about a
license or a maintainer — read it from the primary source. If a primary source is
unreachable, mark the entry `under_review` and say why. Do not invent SHAs.**

## Inputs you need

- `name` — the dependency name (e.g. `nostr-tools`, `@atproto/api`,
  `github.com/nbd-wtf/go-nostr`).
- `ecosystem` — one of `js, rust, py, go, elixir, dart, ruby, kotlin, other`.
- `category`, `protocols`, and a one-paragraph `what_it_does` (plain language).

## Procedure

1. **Read the policy first.** Read `POLICIES.md`, `enforcement/README.md`, and the
   exclusion list `enforcement/excluded-organizations.yaml`.

2. **Screen the name.** If the dependency is owned by an excluded org, STOP — it
   does not get an entry. (A tool that merely *supports* a permitted provider may
   instead qualify for a provider-agnostic recipe; see the `recipes/` directory.)

3. **Generate the entry from primary sources.** Add the row to
   `data/seed-catalog.json` and run the generator, which fetches the registry
   license, pins it to a commit (npm `gitHead` or the GitHub/GitLab license
   commit), classifies maintenance, and writes the `.mdx`:

   ```sh
   npm run data:fetch -- --source seed
   ```

   For one-off edits, edit the entry's frontmatter directly to match
   `src/schema/catalog.ts`:
   - `license_spdx` must be a valid SPDX id (validated against
     `data/spdx-licenses.json`).
   - `license_source_url` + `license_source_commit_sha` pin the license to a
     commit. A `verified` entry **must** have a SHA; otherwise set
     `verification_status: under_review`.
   - quote any date values (`last_release_at`, `verified_at`) so YAML keeps them
     as strings.

4. **Validate the schema.**
   ```sh
   npm run check
   ```

5. **Run enforcement BEFORE committing.** This is mandatory:
   ```sh
   npm run enforce
   ```
   If it exits non-zero, fix the entry; do **not** bypass any layer. Commit only
   on green.

6. **Commit one entry per commit** with a message like
   `catalog: add <slug> (<spdx> @ <sha7>)`.

## Stop-and-ask triggers

- Ambiguous or missing license metadata from the registry.
- The SPDX id is not in `data/spdx-licenses.json`.
- The entry would publish `verified` without a commit SHA.
- A field required by `src/schema/catalog.ts` has no trustworthy value.

## Definition of done

- `npm run check` and `npm run enforce` both exit 0.
- The entry has a real `license_spdx`, `license_source_url`, and (if `verified`) a
  `license_source_commit_sha`.
- `what_it_does` reads in plain language a non-developer could follow.
