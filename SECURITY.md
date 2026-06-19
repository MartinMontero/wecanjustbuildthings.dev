# Security Policy

## Reporting a vulnerability

Please report security issues **privately** via
[GitHub Security Advisories](https://github.com/martinmontero/wecanjustbuildthings.dev/security/advisories/new)
rather than opening a public issue. We aim to acknowledge within **5 business
days**.

Include what you found, how to reproduce it, and the impact. For an enforcement
false positive/negative, a failing test case is the most useful report.

## Scope

This is a **static site**: no server-side app, no database, no user accounts, no
runtime user data. The attack surface is the build pipeline, the dependencies,
and the hosting configuration.

## What we enforce on ourselves

- Every dependency is screened by the [three-layer enforcement
  engine](https://wecanjustbuildthings.dev/policies/enforcement/) on every PR.
- Licenses are pinned to a commit, so a silent relicense is detectable.
- A weekly job re-checks licenses and maintenance and opens an issue on drift.
- No model-provider keys are required or stored anywhere; anything that talks to a
  model does so client-side, BYOK.
- **CVE scanning on every PR and nightly** against the locked dependency set, with
  two independent scanners (OSV-Scanner + Grype): a build is blocked by an
  actionable (fix-available) CRITICAL, and a newly-disclosed CRITICAL against a
  locked dependency opens a tracked issue. See
  [Supply-chain security](https://wecanjustbuildthings.dev/policies/supply-chain-security/).
- **An SBOM (CycloneDX + SPDX) and a signed build-provenance attestation** are
  produced for every build of `main`, verifiable with `gh attestation verify`,
  `cosign`, or `slsa-verifier`.
- **The CI pipeline is hardened**: every GitHub Action is pinned to a full commit
  SHA (enforced by zizmor), each runner is hardened with egress monitoring
  (harden-runner), Node versions are pinned, and a dead-link check runs on every
  PR. Trivy is deliberately excluded (CVE-2026-33634).
- **Security response headers + CSP**: every response carries HSTS, `nosniff`,
  `Referrer-Policy`, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy`, and a
  `Permissions-Policy` lockdown. HTML pages additionally carry a strict,
  hash-based **Content-Security-Policy** (`default-src 'none'`; `script-src 'self'`
  + a per-build hash for each inline framework script, no `'unsafe-inline'`;
  `connect-src 'self'`). It is generated at build into `dist/_headers` from a
  single source (`src/lib/security-headers.ts`) and ships **Report-Only** first —
  see the rollout note below.

### Rolling the CSP from Report-Only to enforce

1. Deploy with the default (`Content-Security-Policy-Report-Only`) and exercise the
   live flows: Sign in with Nostr/Bluesky, the GitHub one-click in Build Studio,
   catalog search, and the `/admin/` CMS. Violations are logged to the Worker at
   `/api/csp-report` (visible via `wrangler tail`) and in the browser console.
2. The `/admin/` CMS (Sveltia) calls GitHub from the browser, so it needs a broader
   `connect-src` than the rest of the site. Cloudflare `_headers` *combines*
   overlapping rules (it cannot send a second, narrower CSP for `/admin/*` only),
   so give the admin route its own policy via the Worker before enforcing — confirm
   the exact hosts from the Report-Only violations rather than guessing.
3. Once the reports are clean, build with `CSP_MODE=enforce` (flips the header name
   to `Content-Security-Policy`) and redeploy.

## Accepted risk

An unfixable or non-exploitable CRITICAL is recorded as a machine-readable
[OpenVEX](https://openvex.dev) document under `security/vex/`, with a written
justification — never suppressed silently. Scanner-level ignores in
`osv-scanner.toml` / `.grype.yaml` carry the same written reason and a review date.

## Supported versions

The deployed `main` branch is the supported version. Fixes land on `main` and
deploy automatically.
