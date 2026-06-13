---
name: license-watcher
description: >-
  Use weekly (or when asked to check for relicensing) to detect license drift
  across the wecanjustbuildthings.dev catalog. Re-fetches each entry's license
  from its primary source, compares it to the recorded SPDX id, and scans recent
  upstream commits for relicensing keywords. Opens a PR with the diff. Triggers:
  "check for relicensing", "license drift", "weekly license watch".
---

# license-watcher

Catch the NocoDB-style quiet relicense (e.g. permissive → BSL/SSPL) before it
becomes a surprise. Three independent signals; any one is worth a human glance.

## What it checks, per catalog entry

1. **SPDX mismatch** — the license reported now by the registry/GitHub/GitLab
   differs from the recorded `license_spdx`.
2. **Relicense keywords** — recent upstream commit messages contain
   `relicens`, `now under`, `moved to`, `BSL`, `SSPL`, `business source`,
   `sustainable use`, `elastic license`, …
3. **(Weekly, also run Layer 2)** — license churn often happens in dependencies
   of dependencies; run the transitive walk against the tree too.

## Procedure

1. Run the watcher (uses ETag-cached, conditional requests; respects
   `GITHUB_TOKEN` for higher rate limits):
   ```sh
   npm run watch:license
   ```
   It writes `reports/license-watch.md`.

2. For any entry with a signal:
   - Re-verify against the primary source by hand (don't trust a single signal).
   - If the license genuinely changed, update the entry's `license_spdx`,
     `license_source_url`, and `license_source_commit_sha`, and set
     `verification_status: under_review` until a maintainer confirms fit.

3. Run the engine and schema check before proposing changes:
   ```sh
   npm run enforce && npm run check
   ```

4. **Open a PR — never push to `main` directly.** Title it
   `license-watch: <date>` and paste the report into the description.

## Stop-and-ask triggers

- GitHub/GitLab returns 403 on a public repo (rate limit or removal).
- An SPDX id no longer validates against the current SPDX list.
- The upstream repository has been deleted or moved.

## Definition of done

- `reports/license-watch.md` generated.
- A PR opened if (and only if) at least one entry fired a signal.
- No direct writes to `main`.
