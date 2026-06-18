#!/usr/bin/env python3
"""
PreToolUse guard for wecanjustbuildthings.dev — deterministic backstop.

Hard-blocks two non-negotiable rules and feeds the reason back to Claude (exit 2):
  RULE 1  No Meta / OpenAI / xAI packages, imports, install commands, or API hosts.
          (Google is EXPLICITLY PERMITTED — never blocked.)
  RULE 2  The existing `operational_advisory` CI gate must not be edited, weakened,
          or overwritten. Additive CI must go in NEW workflow files.

This is a BACKSTOP, not a full classifier. CLAUDE.md guidance and human review
remain the primary controls. Matching is precise (real dependency keys, imports,
install targets, and API hosts — NOT prose), so a comment mentioning "OpenAI"
will not trip the guard. Tune the lists below for your repo.

>>> YOU MUST SET PROTECTED_CI_PATHS to the real path(s) of your operational_advisory
    workflow file(s). <<<
"""
import json
import re
import sys

# ---- Files the guard should never police (its own machinery + policy text) ----
EXEMPT_PATH_SUBSTRINGS = (".claude/hooks/guard.py", ".claude/settings.json", "claude.md")

# ---- RULE 1: excluded AI vendors (Meta / OpenAI / xAI). Google is PERMITTED. ----
# Matched only as real dependencies / imports / install targets / API hosts.
EXCLUDED_PACKAGES = [
    r"openai",
    r"@openai/[\w.\-]+",
    r"@xai-org/[\w.\-]+",
    r"xai-sdk",
    r"@meta-llama/[\w.\-]+",
    r"meta-llama",
    r"llama-stack-client",
]
EXCLUDED_HOSTS = [
    r"api\.openai\.com",
    r"api\.x\.ai",
    r"llama\.developer\.meta\.com",
]

_PKG = "|".join(EXCLUDED_PACKAGES)
DEP_KEY_RE = re.compile(r'["\'](?:' + _PKG + r')["\']\s*:', re.I)            # "openai": "^4.0.0"
IMPORT_RE  = re.compile(r'\b(?:import|require|from)\b[^\n;]*["\'](?:' + _PKG + r')(?:/[\w.\-/]*)?["\']', re.I)
INSTALL_RE = re.compile(r'\b(?:npm|pnpm|yarn|bun)\b.*?\b(?:add|install|i)\b.*?(?:' + _PKG + r')', re.I | re.S)
HOST_RE    = re.compile("|".join(EXCLUDED_HOSTS), re.I)

# ---- RULE 2: protect the operational_advisory CI gate ----
PROTECTED_TOKEN = "operational_advisory"
# >>> SET THESE to the exact path(s) of the workflow file(s) that define the gate:
#
# NOTE (security audit, 2026-06-18): a read-only audit of this repo found NO
# workflow that literally defines a check named `operational_advisory`. The
# token-based RULE 2 above (PROTECTED_TOKEN) therefore matches nothing today and
# is kept verbatim as a forward guard. To honour Constraint 4 ("never weaken the
# blocking CI gate; additive CI only") we instead protect the actual PR-blocking
# gate workflows identified with evidence. CONFIRM/CORRECT with the maintainer
# which file truly carries `operational_advisory`, then narrow this list if needed.
PROTECTED_CI_PATHS = [
    ".github/workflows/verify.yml",       # Enforcement & checks — 3-layer Meta/OpenAI/xAI exclusion gate (npm run enforce)
    ".github/workflows/security-pr.yml",  # Security PR gate — OSV-Scanner CRITICAL-only blocking gate
    ".github/workflows/quality.yml",      # Accessibility & performance — axe-core + Lighthouse gate
]


def block(reason):
    sys.stderr.write("BLOCKED by project guard — " + reason + "\n")
    sys.exit(2)


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)  # unparseable input: don't brick the agent (backstop only)

    tool = data.get("tool_name", "")
    ti = data.get("tool_input", {}) or {}
    file_path = ti.get("file_path") or ""
    fp_low = file_path.lower()

    if any(s in fp_low for s in EXEMPT_PATH_SUBSTRINGS):
        sys.exit(0)  # never police the guard's own files / policy text

    # Text this call would WRITE or RUN (original case; regexes are case-insensitive).
    if tool == "Write":
        text = ti.get("content") or ""
    elif tool == "Edit":
        text = ti.get("new_string") or ""
    elif tool == "Bash":
        text = ti.get("command") or ""
    else:
        text = ""

    # ---- RULE 1: excluded vendors ----
    if HOST_RE.search(text):
        block("introduces an excluded-vendor API host. Meta/OpenAI/xAI are forbidden; "
              "Google is permitted. Stop and ask the human.")
    if tool in ("Write", "Edit"):
        m = DEP_KEY_RE.search(text) or IMPORT_RE.search(text)
        if m:
            block("adds an excluded-vendor dependency/import (" + m.group(0).strip() + "). "
                  "Meta/OpenAI/xAI are forbidden; Google is permitted. Stop and ask the human.")
    if tool == "Bash" and INSTALL_RE.search(text):
        block("installs an excluded-vendor package. Meta/OpenAI/xAI are forbidden; "
              "Google is permitted. Stop and ask the human.")

    # ---- RULE 2: protect operational_advisory ----
    if tool == "Edit" and PROTECTED_TOKEN in (ti.get("old_string") or "").lower():
        block("edits the existing `operational_advisory` CI gate, which must not be "
              "weakened, disabled, or bypassed. Put additive CI in a NEW workflow file, "
              "or stop and ask the human.")
    if tool in ("Write", "Edit"):
        for p in PROTECTED_CI_PATHS:
            if p and p.lower() in fp_low:
                block("modifies a protected CI file (" + file_path + ") carrying the "
                      "`operational_advisory` gate. Additive CI must go in a NEW file. "
                      "Stop and ask the human.")

    sys.exit(0)  # no decision -> normal permission flow continues


if __name__ == "__main__":
    main()
