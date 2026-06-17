---
name: supply-chain-security
description: >-
  Use when adding supply-chain SECURITY enforcement (CVE scanning, SBOM, build
  provenance, CI hardening) to wecanjustbuildthings.dev or to any builder project
  it ships. Scaffolds three GitHub Actions workflows — a PR gate, a nightly
  re-scan of the locked dependency set, and a build-provenance/SBOM job — that
  hard-fail only on an ACTIONABLE (fix-available) CRITICAL, across every language
  ecosystem. Mirrors the project's block-don't-warn enforcement discipline.
  Triggers: "add security scanning", "scan for CVEs", "add an SBOM", "harden the
  CI / actions", "supply-chain security", "add a vulnerability gate", "pin actions
  to SHAs".
---

# supply-chain-security

This skill closes the gap between *provenance* ("who built it" — the Meta/OpenAI/xAI
exclusion the enforcement engine already checks) and *security* ("is it safe, and
is it still safe"). It scaffolds the same posture this repo uses into any builder
project, parameterized by the ecosystems the project actually contains.

**It reproduces the *correct* pattern, not the naive one.** A plain
`severity: CRITICAL` line does **not** gate correctly with OSV-Scanner; the gotchas
below are load-bearing. Read them before generating anything.

## Hard rules — non-negotiable

1. **Pin every action to a full commit SHA**, never a moving tag. Resolve the SHA
   from the action's canonical repo (`git ls-remote https://github.com/<owner>/<repo> refs/tags/<vX.Y.Z>`)
   and annotate it `@<sha> # vX.Y.Z`. `.github/zizmor.yml` (`unpinned-uses: hash-pin`)
   fails the build if any tag slips back in — so it's machine-enforced.
2. **Never introduce Trivy in any form.** `aquasecurity/trivy-action` / `setup-trivy`
   were compromised in March 2026 (CVE-2026-33634 / GHSA-69fq-xp46-6x23): tags were
   force-pushed to credential-stealing malware. The scanning pipeline is itself
   attack surface — that is *why* every action is SHA-pinned and the runner hardened.
3. **OSV-Scanner has no "fail only on CRITICAL" flag.** Its `scan` exits non-zero on
   ANY severity (the CVSS-threshold request, google/osv-scanner#1400, was closed
   without implementation). So: run the scan with `|| true` to capture JSON, then
   post-process. Fail the build when **either**:
   - any `results[].packages[].groups[].max_severity` parses to a number `>= 9.0`, **OR**
   - (the no-CVSS fallback, for advisories shipped without a CVSS score, e.g. some
     RustSec/distro records) any vulnerability's `database_specific.severity == "CRITICAL"`.
   A pure CVSS filter silently lets the no-CVSS criticals through. Both signals,
   always. Reference implementation: `scripts/osv-critical-gate.sh` (+ its self-test
   in `scripts/tests/osv-gate/`).
4. **Block only on *actionable* (fix-available) criticals** — a critical with a
   `fixed` event in its affected ranges. An unpatchable critical must not wedge the
   build forever; report it and record it as accepted risk in an OpenVEX doc under
   `security/vex/`, never by lowering the gate.
5. **Harden every job**: `step-security/harden-runner` (egress-policy `audit`,
   tightened to `block` with an allowlist once the egress set is known) and
   least-privilege `permissions:` per job.
6. **No excluded-vendor tooling.** Nothing from Meta, OpenAI, or xAI. **Google is
   permitted** — OSV-Scanner / OSV.dev is fine.

## What it scaffolds

- **`.github/workflows/security-pr.yml`** — PR gate: harden-runner → `dependency-review-action`
  (`fail-on-severity: critical`, a best-effort first line — keep it `continue-on-error`,
  as it needs the repo's Dependency Graph enabled) → OSV-Scanner JSON + the jq CRITICAL
  gate → Grype cross-check (`anchore/scan-action`, `fail-build: true`,
  `severity-cutoff: critical`, a *different* vulnerability DB — cross-scanner agreement
  is low, so the second scanner is deliberate) → SARIF to the Security tab → zizmor on
  the workflows. Wire this as a **required status check** so it blocks merge.
- **`.github/workflows/security-cron.yml`** — nightly (`0 3 * * *`) + `workflow_dispatch`:
  re-scan the **locked** dependency set (committed lockfiles / stored SBOM), not just
  new commits, against the current advisory DBs. On a newly-disclosed actionable
  CRITICAL, open or update a tracking issue (a red cron is easy to miss).
- **`.github/workflows/build-attest.yml`** — Syft SBOM (CycloneDX + SPDX), `npm audit
  signatures` (or the ecosystem equivalent) for dependency provenance, and
  `actions/attest-build-provenance` over the deployable artifact.
- **Configs**: `scripts/osv-critical-gate.sh`, `osv-scanner.toml`, `.grype.yaml`,
  `.github/zizmor.yml`, `security/vex/` — each suppression carries a written reason.

## Procedure

1. **Detect ecosystems.** Inventory lockfiles/manifests in the target project
   (`package-lock.json`/`pnpm-lock.yaml`, `Cargo.lock`, `requirements.txt`/`poetry.lock`/`uv.lock`,
   `go.sum`, `Gemfile.lock`, `mix.lock`, …). OSV-Scanner and Grype both scan all of
   these; no per-ecosystem wiring is needed beyond `--recursive`.
2. **Resolve SHAs** for every action from its canonical repo (rule 1). Do not copy
   tags.
3. **Generate the three workflows + configs** from the references in this repo, keeping
   the jq gate and the no-CVSS fallback intact (rule 3) and the fix-available filter
   (rule 4).
4. **Install OSV-Scanner reproducibly**: `go install github.com/google/osv-scanner/v2/cmd/osv-scanner@<pinned-version>`
   (verified via the Go checksum DB), or a checksum-verified release binary. Never
   `curl | sh` an unpinned installer.
5. **Self-test the gate** in CI (`scripts/tests/osv-gate/run.sh`) — the gate is
   attack surface; prove it fails on a known critical before trusting it.
6. **Wire the PR gate as a required check** (branch protection). This is a repo-settings
   step; document it for a maintainer if you lack admin.

## Stop-and-ask triggers

- The project pulls in tooling built by Meta, OpenAI, or xAI — stop; find a clean tool.
- A CRITICAL has no fix and you're unsure whether it's exploitable — open a VEX draft
  and ask, don't silently lower the gate.
- You cannot resolve an action's SHA from a primary source — stop; do not guess a SHA.
- The target uses a package manager whose lockfile a scanner can't parse — surface it
  rather than silently scanning less.

## Definition of done

- A new CRITICAL — introduced in a PR or newly disclosed against a locked dependency —
  reliably blocks the build or opens a tracked issue.
- An SBOM (CycloneDX + SPDX) is generated and the build artifact is provenance-attested.
- Every action is SHA-pinned; zizmor passes; harden-runner is on every job.
- No Meta/OpenAI/xAI tooling was introduced.
- The gate's own self-test passes.
