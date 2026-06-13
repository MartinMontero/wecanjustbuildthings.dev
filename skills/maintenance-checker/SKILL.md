---
name: maintenance-checker
description: >-
  Use weekly (or when asked to refresh maintenance status) to reclassify each
  wecanjustbuildthings.dev catalog entry as active / minimal / dormant /
  abandoned based on its latest upstream activity. Opens a PR with status diffs.
  Triggers: "refresh maintenance status", "is this still maintained", "weekly
  maintenance check".
---

# maintenance-checker

Keep the catalog honest about what's still alive. Status is derived from the
latest release/commit timestamp from the appropriate primary source — never
guessed.

## Thresholds

| Status | Rule |
|---|---|
| `active` | last activity < 90 days |
| `minimal` | < 12 months |
| `dormant` | < 36 months |
| `abandoned` | ≥ 36 months **or** repository archived |

## Primary source per ecosystem

- GitHub-hosted: `pushed_at` from the repo API.
- GitLab-hosted (e.g. Shakespeare): `last_activity_at` from the GitLab project API.
- Registry fallback for real packages: npm `time[v]`, crates `created_at`,
  PyPI `upload_time_iso_8601`, Hex `inserted_at`, pub `published`, RubyGems
  `created_at`.
- **Never** do a registry lookup for `ecosystem: other` entries (hosted apps);
  the name may collide with an unrelated package.

## Procedure

1. Run the checker (respects `GITHUB_TOKEN`):
   ```sh
   npm run watch:maintenance
   ```
   It writes `reports/maintenance-check.md` with a table grouped by entry and
   flags every status change.

2. Apply the reclassifications to entry frontmatter (`maintenance_status`,
   optionally `last_release_at`). Do **not** touch license fields — that's the
   license-watcher's job.

3. Validate and open a PR (never push to `main`):
   ```sh
   npm run check
   ```
   Title: `maintenance-check: <date>`; paste the table into the PR body.

## Stop-and-ask triggers

- An entry has neither a parseable git source nor a registry match.
- All primary sources are unreachable for an entry.

## Definition of done

- `reports/maintenance-check.md` generated.
- A PR opened if any status changed.
- License fields untouched.
