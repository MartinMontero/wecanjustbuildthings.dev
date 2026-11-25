# Changelog

All notable changes to wecanjustbuildthings.dev, MVP → v1 (2026-09-07).
Milestones follow PLAN.md (M0–M8); PR numbers are the merge records on `main`.

## [Unreleased]

### Security
- **Exclusion engine fails closed on unreadable input** (W0, BuilderOS audit):
  the Layer 1/Layer 2 tree scans used to log a warning for a manifest or
  lockfile they could not parse and then count it as clean, so a broken
  `pyproject.toml` declaring an excluded package passed. Now any unparseable
  manifest or lockfile, unresolved yarn merge conflict, lockfile with no reader
  (`bun.lockb`, `deno.lock`, `Pipfile.lock`, `pdm.lock`), unreadable file, or
  missing/unlistable `--tree` directory fails the run (exit 1) with a named
  reason. Covered by `enforcement/tests/fail-closed.test.ts`.
- **Layer 2 reads `bun.lock`** (Bun's text lockfile): every package row is
  checked against the policy, with chains resolved by a port of Bun's own
  lookup rule (`find_resolution`, oven-sh/bun `src/install/lockfile/bun.lock.rs`).
  Unknown `lockfileVersion` values (Bun defines 0-3) and unrecognised row
  shapes fail closed. The binary `bun.lockb` still fails as unsupported.
  Covered by `enforcement/tests/bun-lock.test.ts`.
- **proxy-addr 2.0.7→2.0.8** (transitive via `@lhci/cli`→`express@4.22.2`,
  dev-only): fixes GHSA-jqcg-44mw-7w3h (CVSS 9.1 CRITICAL, IPv4-mapped IPv6
  trust-subnet spoofing), the actionable CRITICAL tracked in issue #77 that
  blocked the nightly security re-scan. `express@4.22.2` already ranges
  `proxy-addr ~2.0.7`, so the fix is a lockfile-only re-resolution — no
  parent bump, no override. Guarded by a new lockfile-assertion test
  (`scripts/security-lockfile.test.ts`) that fails if the vulnerable version
  is ever re-locked.
- **GHSA-26w7-cxv4-gfx2 acceptance renewed to 2027-02-23** (owner decision,
  2026-11-25). The Astro AVIF/libheif RCE is fixed only in astro >= 7.2.8;
  every ground of the `not_affected` VEX statement was re-verified first
  (static output, no runtime image processing, 0 `.avif` files, sharp 0.35.4
  with libheif 1.23.2). `osv-scanner.toml`, `.grype.yaml` and the VEX document
  are updated together. The Astro 7 upgrade that retires the acceptance is
  planned in `docs/astro-7-upgrade-plan.md` (BACKLOG C5).

## [v1] — 2026-09-07

### Added
- **Design system v1:** token layer (light/dark), Build Plate hero,
  WorkOrderGrid landing, Receipt trust primitive (Astro + Svelte twin),
  verdict washes, Footer override, workbench page class. (M1 #61, M5 #69)
- **Guided build flow:** intent → blueprint → handoff (ZIP / GitHub / Goose
  deeplink), deterministic Mentor Engine, skills capture, in-browser
  exclusion re-check gating handoff. (M2 #62–64)
- **Trust surfaces:** catalog badges, `/policies/enforcement/` verdict band,
  Studio policy gate, receipt-styled PolicyChecker with localized verdicts.
  (M2 #62–64)
- **Catalog explorer:** responsive receipt-card grid, facet disclosures with
  live counts, designed loading/error/zero-result states, locale-aware CTA.
  (M3 #67)
- **Honesty chips:** every unconfirmed figure across Cost Estimator and Model
  Compass renders "unverified — awaiting human check" (en/es/ar) instead of
  `TODO: confirm`. (M4 #68)
- **i18n security gate:** 2 distinct approvals on security-sensitive pages,
  trusted-base checkout (M0 #56–60); locales en/es/ar across the product
  surface, including the Arabic B10 sign-in line.
- **Arabic display face:** Readex Pro subset (32.6 KB, OFL) on `:lang(ar)`
  headings; self-hosted like all fonts. (M6 #70)
- **Console:** token-compliant standalone admin console; Nostr (NIP-07/46)
  and Bluesky sign-in; superadmin roster management. (M6 #70, earlier auth)
- **Verification layer:** VERIFICATION.md (measured ceilings + loop evidence),
  SHIP.md, this changelog, checkpoint test for the font/ledger invariants.
  (M6 #70, M8 this PR)

### Changed
- All five UI islands fully tokenized — zero `--sl-*`, zero raw hex, zero
  off-scale rems. (M4 #68)
- Landing: 18 stock CardGrid/LinkCard usages replaced by the bespoke
  WorkOrderGrid. (M5 #69)
- Copy register pass across landing + tool intros in en/es/ar (plain verbs,
  jargon defined on first use). (M5 #69)
- Hydration: `client:visible` for below-fold data islands; ModelCompass
  static-render evaluated and deferred with numbers. (M6 #70)
- Long catalog cluster lists skip off-screen layout/paint
  (`content-visibility: auto`) — `/pie/cooking/` Lighthouse perf 0.88 → 0.93+.
  (M8 this PR)
- Docs brought truthful: ROADMAP current, README/CLAUDE.md Workers Builds
  topology, admin-spec phase ledger, unified catalog counts, mobile-doc
  headers marked historical. (M7 #65)

### Security
- Dependency hygiene inside Astro 6: 34 → 16 advisories (HIGH 19 → 7,
  CRITICAL 0) — nanoid 3.3.12→3.3.18, js-yaml, postcss, sharp, qs and the
  dev chain; Astro-7-only remainder recorded accepted-with-evidence in
  AUDIT.md. (F-8 #66)
- Supply-chain stack verified: OSV/Grype/Syft/SBOM/VEX/zizmor present;
  Trivy stays excluded (CVE-2026-33634). (re-verified M8)
- guard.py stale-ref check recognizes GitHub's own commits (B13 #59).

### Owner-court (not shipped in v1, tracked in BACKLOG.md)
- B2 CSP ENFORCE flip · B3 Sveltia OAuth backend · B8 catalog corpus
  translation run · B9 native review of machine-translated pages ·
  B11/B12 deferred (Goose live loop, server-side recipe signing).
