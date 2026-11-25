<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Astro 7 upgrade plan (BACKLOG C5 / ruling G5)

**Status:** planned, not started. Written 2026-11-25 against `main@2bd3156`.
**Owner gate:** G5 ruled Astro 7 *out of the Phase 3 effort*. Running this plan
as its own slice needs the owner's go-ahead (a G5 re-ruling for this slice).
**Deadline that drives it:** the accepted risk for GHSA-26w7-cxv4-gfx2 (Astro
AVIF/libheif RCE, fixed only in `astro` >= 7.2.8) was renewed to **2027-02-23**
(`osv-scanner.toml`, `.grype.yaml`, `security/vex/2026-ghsa-26w7-cxv4-gfx2.openvex.json`).
Landing this upgrade removes the risk at its source and retires that acceptance.

All facts below were read on 2026-11-25 from the npm registry and the primary
sources listed at the end; every "where here" entry is a grep of this repo.

## 1. What changes, in one picture

```
today                                after this slice
astro 6.4.8  (Vite 7)        ──►    astro 7.4.13  (Vite 8, Rust compiler, Sätteri markdown)
@astrojs/starlight 0.40.0    ──►    @astrojs/starlight 0.43.1   (needs astro >= 7.2.10)
@astrojs/svelte 8.1.2        ──►    @astrojs/svelte 9.1.6       (needs Node >= 22.23.4)
@astrojs/check 0.9.10        ──►    @astrojs/check 0.9.12
@astrojs/sitemap 3.7.4       ──►    @astrojs/sitemap 3.7.6
svelte 5.57.0, typescript 6.0.3, sharp 0.35.4      unchanged (already satisfy the new peers;
                                                    astro 7 itself requires sharp ^0.35.4)
GHSA-26w7-cxv4-gfx2 accepted (VEX not_affected) ──► fixed; scanner ignores removed
```

Everything else in the stack (the `/api/*` Worker, D1/KV bindings, the
enforcement engine, Alfred's use of the engine) does not import Astro and is
out of scope except as regression checks.

## 2. Breaking changes that touch this repo

| # | Change (source) | Where here | Action in this slice |
|---|---|---|---|
| 1 | Starlight 0.42.0 removed the never-used `tagline` config option | `astro.config.mjs:97` (`tagline: 'Build the tools ...'`) | Delete the line. The hero `tagline` frontmatter used by `Hero.astro` and the `index.mdx` pages is a different field and is unaffected. |
| 2 | Starlight 0.43.0 respects Astro's `scopedStyleStrategy`: default changes from forced `"where"` to `"attribute"` (higher specificity for scoped styles) | 7 component overrides (`SiteTitle`, `Hero`, `PageTitle`, `SocialIcons`, `Header`, `Footer`) plus a `:where(` rule in `src/styles/theme.css` | Parity first: set `scopedStyleStrategy: 'where'` in `astro.config.mjs` in this slice. Adopting `"attribute"` is a separate, visual-diffed change. |
| 3 | Astro 7 changes the `compressHTML` default from `true` to `'jsx'` (whitespace between inline elements can disappear) | not set anywhere, so the default flips | Parity first: set `compressHTML: true`; adopting `'jsx'` is a separate change with a screen diff. |
| 4 | Astro 7's Rust compiler: unclosed non-void tags are errors; invalid HTML is no longer auto-corrected; CSS output can differ cosmetically | all `.astro` files | Let `astro check` and the build surface them; fix in place. |
| 5 | Astro 7 moves to Vite 8 | two custom integrations with `astro:build:done` hooks in `astro.config.mjs` (`vendor-sveltia-cms` at line 23, `emit-security-headers` at line 46); no `vite:` block | Rebuild and confirm both hooks still run (Sveltia CMS copied into `dist/`, security headers emitted). The hook API is not listed as changed. |
| 6 | Starlight 0.43.0 ThemeSelect refactor; `StarlightThemeProvider.updatePickers()` removed | no ThemeSelect override; the name appears only as a sample string in `src/lib/security-headers.test.ts:29` (hash test input) | No code change. CSP hashes are computed from the built HTML, so the changed theme script is picked up; verify the generated headers after the build. |
| 7 | Starlight 0.42.0 mobile menu markup: no `<starlight-menu-button>` wrapper, no `aria-expanded`, no `data-mobile-menu-expanded` on `<body>` | no selectors for these found; `Header.astro` override wraps the default Header | Verify the compact-viewport nav with `npm run audit:mobile` and the e2e check. |
| 8 | Internal imports are not covered by the changelog | `Footer.astro` imports `virtual:starlight/components/{EditLink,LastUpdated,Pagination}`; overrides import `@astrojs/starlight/components/*` | `astro check` is the proof; adjust imports if any moved. |
| 9 | Astro 7 makes Sätteri the default Markdown processor; `@astrojs/markdown-remark` becomes an optional peer | no `remarkPlugins` / `rehypePlugins` / `remarkRehype` anywhere | No action; confirm MDX pages and Starlight asides render identically (screen diff). |
| 10 | Node floor: `astro` 7.4.13 and `@astrojs/svelte` >= 9.1.1 require Node >= 22.23.4 | `package.json` `engines.node` is `>=22.12.0`; `.node-version` and `.nvmrc` say `22`; CI uses `node-version: '22'` | Raise `engines.node` to `>=22.23.4`. CI resolves to the latest 22.x (v22.23.5, 2026-11-11); Cloudflare Workers Builds preinstalls 22.23.4, selected by `.node-version`. Alfred's CI installs this repo's dependencies with Node 22 too. |
| 11 | Browser floor rises: Starlight 0.41/0.42 drop Chromium < 116, Safari < 17.0, Firefox < 125 | product impact, not code | **Owner decision**: this audience includes non-developers on older phones (Safari < 17 means iOS 16 and older). Record the accepted floor in the release notes. |
| 12 | Not used here (0 hits): removed experimental flags, reserved `src/fetch.ts`, `@astrojs/db`, `astro:transitions` internals, `getContainerRenderer` | none | None. |

## 3. The slice, step by step (one PR)

1. Branch from `main`. Record "before" evidence: `gate.ps1` (12/12 today),
   `npm run test:e2e`, `npm run a11y`, `npm run audit:mobile`, and the screen set
   from `audit/shoot.mjs`.
2. Bump in one change: `astro`, `@astrojs/starlight`, `@astrojs/svelte`,
   `@astrojs/check`, `@astrojs/sitemap` to the versions in section 1; keep the
   `sharp` override. Regenerate `package-lock.json` with `npm install`.
3. Apply rows 1, 2, 3 and 10 of section 2 (tagline removal, the two parity
   flags, the Node floor).
4. Run `npm run verify:all` and fix whatever rows 4, 5 and 8 surface.
5. Re-run the "before" evidence and compare: e2e, a11y, mobile audit, screen
   diff (expect cosmetic CSS differences only, per row 4), and the generated
   security headers (row 6).
6. Retire the accepted risk: run osv-scanner **without** the ignore and confirm
   GHSA-26w7-cxv4-gfx2 is gone; then delete the `[[IgnoredVulns]]` entry in
   `osv-scanner.toml` and the entry in `.grype.yaml`, and update the VEX document
   to `"status": "fixed"` (a new `version`, per `security/vex/README.md`).
7. `gate.ps1` must report 12/12. Update `CHANGELOG.md`, close BACKLOG C5, and
   note the browser floor (row 11) in the release notes.

## 4. Done when

- `package-lock.json` resolves `astro` >= 7.2.8 (target 7.4.13).
- `gate.ps1` 12/12, including the supply-chain proof with **no** ignore entry
  for GHSA-26w7-cxv4-gfx2.
- e2e, a11y and mobile audits pass; screen diff shows no unintended change.
- Dependabot alert for GHSA-26w7-cxv4-gfx2 closes on `main`.

## 5. Risks and rollback

- **Risk:** visual regressions from rows 2-4. **Mitigation:** parity flags in this
  slice; the new defaults are adopted later, one at a time, each with a diff.
- **Risk:** an internal Starlight import moved (row 8). **Mitigation:** `astro
  check` fails loudly; fix before merge.
- **Risk:** a build environment on Node < 22.23.4. **Mitigation:** the raised
  `engines.node` makes the mismatch visible; all known environments resolve >= 22.23.4.
- **Rollback:** the slice is one PR; reverting its merge commit restores Astro 6.
  The renewed acceptance stays valid until 2027-02-23, so a revert does not
  turn the supply-chain gate red.

## 6. Decisions for the owner

1. Re-rule G5 for this slice (run it now as its own PR, or schedule it before 2027-02-23).
2. Accept the higher browser floor (row 11).
3. Confirm "parity first" (keep `scopedStyleStrategy: 'where'` and
   `compressHTML: true` in this slice; adopt the new defaults later).

## Sources (read 2026-11-25)

- npm registry: `astro`, `@astrojs/starlight`, `@astrojs/svelte`, `@astrojs/check`,
  `@astrojs/sitemap` latest versions, `peerDependencies`, `peerDependenciesMeta`, `engines`.
- Astro v7 upgrade guide: https://docs.astro.build/en/guides/upgrade-to/v7/
- Starlight changelog (0.41.0-0.43.1): https://github.com/withastro/starlight/blob/main/packages/starlight/CHANGELOG.md
- `@astrojs/svelte` changelog (9.0.0-9.1.6): https://github.com/withastro/astro/blob/main/packages/integrations/svelte/CHANGELOG.md
- Advisory: https://github.com/advisories/GHSA-26w7-cxv4-gfx2 and https://api.osv.dev/v1/vulns/GHSA-26w7-cxv4-gfx2
- Node.js release index: https://nodejs.org/dist/index.json
- Cloudflare Workers Builds build image: https://developers.cloudflare.com/workers/ci-cd/builds/build-image/
