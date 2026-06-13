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
- CI pins action and Node versions and runs a dead-link check.

## Supported versions

The deployed `main` branch is the supported version. Fixes land on `main` and
deploy automatically.
