#!/usr/bin/env bash
# Self-test for scripts/osv-critical-gate.sh. The gate is itself attack-surface
# and a load-bearing security control, so its behavior is asserted against
# fixtures that exercise every branch:
#   - a CRITICAL with a CVSS score >= 9.0 and a fix          -> BLOCK (exit 1)
#   - a CRITICAL with NO CVSS score (database_specific only) -> BLOCK (exit 1)   [no-CVSS fallback]
#   - a CRITICAL with NO fix available                       -> warn, pass (exit 0) [fix-available filter]
#   - a HIGH (CVSS 7.5)                                      -> pass (exit 0)        [CRITICAL-only]
# Run: bash scripts/tests/osv-gate/run.sh
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
GATE="$DIR/../../osv-critical-gate.sh"
fail=0

check() {
  local fixture="$1" want="$2"
  bash "$GATE" "$DIR/fixtures/$fixture" >/dev/null 2>&1
  local got=$?
  if [ "$got" -eq "$want" ]; then
    echo "ok    $fixture -> exit $got"
  else
    echo "FAIL  $fixture -> exit $got (wanted $want)"
    fail=1
  fi
}

check critical-fixable-cvss.json   1
check critical-fixable-nocvss.json 1
check critical-unfixable.json      0
check high-nonblocking.json        0

if [ "$fail" -eq 0 ]; then echo "osv-critical-gate self-test: all assertions passed. ✅"; fi
exit $fail
