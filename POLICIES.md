# Policies

This is the authoritative companion to the site's
[exclusion policy](https://wecanjustbuildthings.dev/policies/) and
[enforcement](https://wecanjustbuildthings.dev/policies/enforcement/) pages.
Agents and skills should read this file first.

## The exclusion policy

A dependency is excluded from the catalog if it is **owned by**, or **routes data
to**, any of:

- **Meta** (Facebook, Instagram, WhatsApp, Threads, Reality Labs, Oculus)
- **OpenAI**
- **xAI** (Grok)

The machine-readable list is `enforcement/excluded-organizations.yaml`, with
per-ecosystem signals. The data-flow signals are
`enforcement/excluded-provider-signals.yaml`.

This is about **ownership and data flow, not topics**. A library that mentions one
of these companies is fine; one published by them, or one that ships a client
sending data to them, is not.

## Three-layer enforcement (blocking)

1. **Layer 1 — direct dependencies.** Manifest parsing (8 ecosystems) +
   catalog-frontmatter ownership check.
2. **Layer 2 — transitive tree.** Lockfile walking (13 formats) with full chain
   output. Closure-only formats (`pubspec.lock`, `gradle.lockfile`,
   `requirements.txt` without `# via`) detect presence but cannot trace the chain,
   and say so.
3. **Layer 3 — provider strings.** Source scan for excluded SDK imports,
   endpoints, and config keys; imports weighted highest, endpoints/config keys
   reported for review (they can appear in negative contexts).

All three run on every PR (`verify.yml`) and weekly (`license-watch.yml`).

## The only exception: provider-agnostic recipes

A tool that can be configured to use *either* an excluded or a permitted provider
may carry a **provider-agnostic recipe**. The recipe contract (enforced by
`enforcement/cli.ts layer3 --recipes`):

- `target_entry_slug` must resolve to a catalog entry with
  `provider_agnostic: true`;
- every excluded **LLM provider** must appear in `must_not_be_one_of`;
- no permitted provider may itself be an excluded org;
- verification steps must block the excluded providers' endpoints.

A recipe that forgets to exclude an LLM provider fails the build.

## Verification standards for catalog entries

- `license_spdx` is a valid SPDX id read from the primary source.
- `verified` entries pin `license_source_commit_sha`; otherwise `under_review`.
- Maintenance status is derived from primary-source activity:
  `active` < 90d, `minimal` < 12mo, `dormant` < 36mo, `abandoned` ≥ 36mo / archived.
- **Skip-and-flag, never silent:** if a primary source is unreachable, the entry
  is written `under_review`/`blocked` with a documented reason — never omitted.

## Appeals

Exclusion calls can be contested (e.g. a genuinely community-owned package under a
scope that overlaps an excluded org). Open an issue. Layer 3's import-context
matching exists to disambiguate, and false positives are corrected in the engine
(with a regression test), not suppressed silently.

Humans decide what tooling can't: editorial judgment, new-category structure, and
contested exclusions. Everything checkable is checked by tooling.
