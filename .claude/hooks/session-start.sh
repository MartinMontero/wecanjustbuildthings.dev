#!/bin/bash
# SessionStart hook for Claude Code on the web.
# Installs Node dependencies so tests, linters, and the build work during the
# session. Runs only in the remote (web) environment; safe to run repeatedly.
set -euo pipefail

# Only run in Claude Code on the web (remote) environment.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Cache-friendly, idempotent install (prefer `install` over `ci` so the cached
# container state is reused). Non-interactive.
npm install --no-fund --no-audit
