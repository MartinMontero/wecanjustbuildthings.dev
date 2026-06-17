#!/usr/bin/env bash
# osv-critical-gate.sh — turn an OSV-Scanner JSON report into a CRITICAL-only,
# fix-available build gate.
#
# Why this exists: `osv-scanner` has no native "fail only on CRITICAL" flag. Its
# `scan` command exits non-zero on a vulnerability of ANY severity, and the
# CVSS-threshold request (google/osv-scanner#1400) was closed without
# implementation. So the workflow runs the scan with `|| true` to capture JSON,
# and this script decides whether to fail the build.
#
# A finding BLOCKS (exit 1) only when it is BOTH:
#   (a) CRITICAL — either a group's CVSS `max_severity >= 9.0`, OR (for advisories
#       shipped WITHOUT a CVSS score, e.g. some RustSec/distro records, where
#       max_severity is empty) `database_specific.severity == "CRITICAL"`. A pure
#       CVSS filter silently lets the no-CVSS criticals through, so BOTH signals
#       are checked — their union is the gate.
#   AND
#   (b) actionable — a fix exists (some affected range has a `fixed` event). An
#       unpatchable critical must not wedge the build indefinitely; it is reported
#       (non-blocking) and recorded as accepted risk in an OpenVEX doc under
#       security/vex/ or an osv-scanner.toml ignore block, with a written reason.
#
# Suppression of an accepted, fixable critical is done at the scanner (an
# osv-scanner.toml [[IgnoredVulns]] entry), so it never reaches this report.
#
# Usage: osv-critical-gate.sh [osv.json]
set -euo pipefail

REPORT="${1:-osv.json}"

command -v jq >/dev/null 2>&1 || { echo "::error::jq is required but not installed"; exit 2; }
[ -f "$REPORT" ] || { echo "::error::OSV report not found: $REPORT (did the scan run?)"; exit 2; }

# Classify every vulnerability: critical?  fixable?  Per package we first build a
# map of vuln-id -> the group's CVSS max_severity (the numeric score only exists
# at the group level), then read each vulnerability's qualitative label and its
# affected-range `fixed` events.
read -r -d '' PROG <<'JQ' || true
[ .results[]?.packages[]?
  | . as $pkg
  | ( [ $pkg.groups[]? | . as $g | ($g.ids[]? // empty) | { (.): ($g.max_severity // "") } ]
      | add // {} ) as $sev
  | $pkg.vulnerabilities[]?
  | . as $v
  | ($v.database_specific.severity // "" | ascii_upcase) as $label
  | ($sev[$v.id] // "") as $score
  | (try ($score | tonumber) catch 0) as $scoreNum
  | (($label == "CRITICAL") or ($scoreNum >= 9.0)) as $crit
  | select($crit)
  | { id: $v.id,
      pkg: ($pkg.package.name // "?"),
      ecosystem: ($pkg.package.ecosystem // "?"),
      version: ($pkg.package.version // "?"),
      score: $score,
      label: $label,
      fixable: ([ $v.affected[]?.ranges[]?.events[]? | select(has("fixed")) ] | length > 0) }
]
JQ

CRITS="$(jq -c "$PROG" "$REPORT")"
BLOCKING="$(jq -c '[ .[] | select(.fixable) ]' <<<"$CRITS")"
UNFIXABLE="$(jq -c '[ .[] | select(.fixable | not) ]' <<<"$CRITS")"
n_block=$(jq 'length' <<<"$BLOCKING")
n_unfix=$(jq 'length' <<<"$UNFIXABLE")

if [ "$n_unfix" -gt 0 ]; then
  echo "::warning::${n_unfix} unfixable CRITICAL finding(s) — no fix available; record as accepted risk in security/vex/ (NOT blocking the build):"
  jq -r '.[] | "  - \(.pkg)@\(.version) (\(.ecosystem)) \(.id) severity=\(.label) cvss=\(.score) [no fix available]"' <<<"$UNFIXABLE"
fi

if [ "$n_block" -gt 0 ]; then
  echo "::error::${n_block} actionable CRITICAL vulnerability(ies) with a fix available — build blocked:"
  jq -r '.[] | "  - \(.pkg)@\(.version) (\(.ecosystem)) \(.id) severity=\(.label) cvss=\(.score) [fix available]"' <<<"$BLOCKING"
  exit 1
fi

echo "OSV CRITICAL gate: no actionable critical vulnerabilities. ✅"
exit 0
