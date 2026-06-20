# INTEGRATION_PLAN.md — Marmot / White Noise *build* canon

Phase-0 output for the brief "Absorb the White Noise / Marmot *build* canon into
wecanjustbuildthings.dev." This is the execution record: what changes, in what order, the
exact mechanism per entry, and the decisions already ruled on. Read it with `CLAUDE.md`
(repo files win on any conflict).

## 0. Provenance & confidence

- **Working tree:** `0bff0dd` — *not* the brief's `7eb20a9`. The skills-enforcement gate
  and the operator runbook merged into the base since the brief was written; neither
  touched `scripts/build-catalog.ts`, `src/schema/catalog.ts`, or the catalog, so every
  §4 fact still holds. **Decision 8: proceed from `0bff0dd`.**
- **Verified live:** catalog = **1,355** entries; the 16-entry cluster exists and is
  mis-tagged; `inferProtocols` regex (`build-catalog.ts:96`) = `nostr|nip-N|nostrify|ndk`
  (root cause); `PROTECTED_SLUGS = ['index','shakespeare']`; `--add` / `--source seed` /
  `entry_type: row.entry_type` behave as the brief states; `protocol ∈ CATALOG_ENTRY_TYPES`
  → strict required fields; `baseSlug(name,eco)` reproduces clean slugs exactly.
- **Verified primary source:** `marmot` LICENSE = **MIT, © 2025 Parres**; the MIP list +
  statuses (MIP-00..04 Review, MIP-05 Draft) confirmed from the spec repo README.
- **Could NOT verify here:** `whitenoise.chat/build`, `/llms-full.txt`, `/llms.txt` → 403.
  Appendix-A numeric facts (event kinds, ciphersuite, `0xF2EE`) live in `marmot/mips/0X.md`
  and **will be pinned from there at a commit** when they become skill/guide content
  (**Decision 10**).

## 1. Reconciliation — brief vs live catalog

The brief's claims hold, with two refinements found live:
- `nostr-blossom` is **already** `["nostr"]` → a no-op (one fewer change).
- `rust-lib-whitenoise` is confirmed `ecosystem: dart`, `license: NOASSERTION` (the §7.4
  anomaly) — **do not "fix" until verified from the repo (Decision 4)**.

All 16 cluster entries are currently `under_review` (so retagging loses no `verified`
status on the cluster itself).

## 2. Decisions (ruled)

| # | Ruling |
|---|---|
| 1 | Merge `Claude.md` → `CLAUDE.md`; delete `Claude.md`. **(done in this branch)** |
| 2 | Archetype = **new** sibling (`nostr-mls-group-messaging`), not an extension of `nostr-web-client`. |
| 3 | Odd slugs → **curate in place** (keep the URL; hand-author under the same slug + `PROTECTED_SLUGS` if needed). No URL changes. |
| 4 | `rust-lib-whitenoise` → **verify from the repo at a commit before re-tagging** ecosystem/license. |
| 5 | Protocol retag via **seed rows now**; defer the `inferProtocols` regex change (avoids re-touching 1,355 entries). |
| 6 | Germ → **investigate from a primary source; add only if OSS repo + license-at-a-SHA + non-excluded owner**; name as a candidate, imply no partnership. |
| 7 | Fix the stale `~842 → 1,355` count. **(done)** |
| 8 | Proceed from `0bff0dd`. |
| 9 | Write this `INTEGRATION_PLAN.md`. **(done)** |
| 10 | Pin every Marmot number from `marmot/mips/0X.md` at a commit. |

## 3. ⚠️ Phase 1 gating issue — `GITHUB_TOKEN`

The brief's curation mechanism (`npm run data:fetch -- --source seed`) re-fetches licenses
for **every** seed slug. **`GITHUB_TOKEN` is not set in the current environment.** A
tokenless regen would hit GitHub's unauthenticated rate limit and **downgrade the 8
currently-`verified` seed entries** (nostr-tools, nostr-dev-kit-ndk, noble-curves,
scure-base, typescript, vite, zod, eslint) to `under_review` — converting verified
guarantees back into "trust me," which the design intent forbids.

**Therefore Phase 1 will not run a tokenless regen.** Options (operator choice):
- **A (recommended):** provide a read-only `GITHUB_TOKEN` (public-repo scope is enough) so
  the seed-row curation pins licenses at a SHA — and may *upgrade* the cluster
  `under_review → verified` as a bonus.
- **B:** run the prepared `--source seed` regen in CI / the maintainer's environment (where
  the token exists); this branch supplies the seed rows.
- **C (fallback, no token):** hand-author the cluster entries + add them to
  `PROTECTED_SLUGS`. Durable and zero-downgrade-risk, but those ~14 entries become
  permanently hand-managed (no auto license/maintenance refresh).

## 4. Phase 1 — catalog (curate + add)

**Curate → `["nostr"]`** (seed rows resolving to the existing slug): `mdk-core`,
`mdk-macros`, `mdk-memory-storage`, `mdk-sqlite-storage`, `mdk-storage-traits`,
`whitenoise-macros`, `internet-privacy-marmot-ts`, `blossom-client-sdk`.

**Curate → `["nostr","atproto"]`** (MLS-generic, serves both — Appendix B): `openmls`,
`openmls-basic-credential`, `openmls-rust-crypto`, `openmls-sled-storage`, `openmls-traits`,
`ts-mls`.

**No change:** `nostr-blossom` (already `["nostr"]`).

**Net-new (`--add <file>`, one commit each):**
- **Marmot Protocol** — first `protocol` entry; `protocols: ["nostr"]`; MIT (confirmed);
  hand-author + `PROTECTED_SLUGS`, or `--add` with a token. Strict fields required.
- **Blossom server** (`hzrd149/blossom`, MIP-04) — `service`, `["nostr"]`; license verified
  at a commit in Phase 1.
- **Germ** — candidate only (Decision 6).

Gate: `npm run check && npm run enforce`. One entry per commit
(`catalog: curate|add <slug> (<spdx> @ <sha7>)`).

## 5. Phase 2 — skills + Goose recipes (dual, attributed)

Each → `skills/<n>/SKILL.md` **and** `goose-recipes/<n>.yaml`, with an attribution block
(White Noise / Marmot / source + license) and **cryptography deferred to the spec + MDK /
marmot-ts** (never reconstructed by a model). Numeric facts pinned from `marmot/mips/0X.md`.

1. `marmot-group-setup` — the 6-step flow (identity → KeyPackage `443` to `10051` relays →
   group w/ Group Data Ext `0xF2EE` → Welcome `444` via NIP-59 gift wrap → send via
   `exporter_secret`→ChaCha20-Poly1305→`445` → receive/decrypt).
2. `marmot-relay-strategy` — `10050` (notification) vs `10051` (KeyPackage) relay lists.
3. `marmot-encrypted-media` — MIP-04 Blossom media (ChaCha20-Poly1305; separate upload key).
4. `marmot-push-notifications` — MIP-05 kinds `447`/`448`/`449`; **labelled Draft**.

Gate: `npm run check && npm run enforce`.

## 6. Phase 3 — guide

"Build encrypted group messaging on Nostr (Marmot/MLS)" — what Marmot is, why MLS-over-
Nostr, how MDK / marmot-ts / KeyPackages / relays / Blossom fit, driving it from Build
Studio, White Noise as the production client. **Must include** the honesty notes (beta;
MIPs in review; ~150-member Welcome ceiling; no first-class atproto in-repo encryption;
White Noise and Germ are **not** wire-interoperable) and a "choose your protocol by threat
model" subsection (Appendix B). Gate: `npm run check` → `npm run build`.

## 7. Phase 4 — Spec-Kit archetype (new sibling)

`templates/spec-kit/nostr-mls-group-messaging/` mirroring `nostr-web-client/`'s shape
(`README.md`, `package.json`, `.claude/CLAUDE.md` constitution), constitution forbidding
excluded deps + pinning catalog-verified versions. Gate:
`npx tsx enforcement/cli.ts all --tree templates/spec-kit/nostr-mls-group-messaging`.

## 8. Phase 5 — Build Studio + cost + full verify

Confirm the now-`nostr`-tagged entries assemble a "secure messaging" stack in Build Studio
and the shared session still type-checks; no new inference (`npm run check:path-a`). Extend
`build/cost.mdx` additively only if hosting is implied. Gate: `npm run verify:all`.

## 9. Phase 6 — i18n + PR

After English lands: `npm run translate:catalog` for `es/`+`ar/` with
`machine_translated: true`. PR description states additions, the reconciliation summary,
licenses verified-at-a-SHA vs honestly `under_review`, and that `operational_advisory` /
Path A / vendor policy are intact. Gate: `npm run verify:all`.

## 10. AT-Protocol transfer (Appendix B)

- `openmls*` + `ts-mls` → `["nostr","atproto"]` (Phase 1) — the concrete "MLS transfers".
- MLS skills written protocol-neutral where they describe MLS; Nostr-wire specifics stay
  Nostr-only.
- E2EE-as-overlay (never in the public log) baked into the guide as a design rule.
- Germ as the atproto exemplar — candidate only.
- Teach threat-model-based protocol choice; never imply White Noise ↔ Germ wire interop.

## 11. Definition of done

`npm run verify:all` green; `check:path-a` confirms no new inference; enforcement passes
(no excluded deps; new/curated entries license-verified **at a SHA** or honestly
`under_review`); the Marmot cluster correctly protocol-tagged with real descriptions;
`operational_advisory` + all CI unchanged (new CI = new files); every skill has a mirrored
recipe + attribution; guides link the catalog entries **and state the real limitations**;
translations flagged; no fabricated facts/paths/SHAs/licenses in the diff.

## 12. Phase-0 investigation results (Decisions 3/4/6 — resolved from primary sources)

**Decision 4 — `rust-lib-whitenoise` (RESOLVED).** Its `dependency_name` is
`rust_lib_whitenoise` (the `flutter_rust_bridge` crate name) and `registry_url` is
`github.com/parres-hq/whitenoise` — the White Noise **Flutter/Dart app**. So `ecosystem:
dart` is correct (the app's bridge crate), NOT a wrong-repo mis-extraction.
`parres-hq/whitenoise` LICENSE = **AGPL-3.0** (verified: "GNU AFFERO GENERAL PUBLIC LICENSE
Version 3"). → Phase 1: keep the slug + `dart`; fix `NOASSERTION → AGPL-3.0`; tag
`["nostr"]`; replace the junk auto-description ("Misc & Everything Else (dart)") with a real
one (the White Noise encrypted-messaging client's Rust core bridge).

**Decision 3 refinement — `internet-privacy-marmot-ts`.** The slug faithfully reflects the
real scoped npm package `@internet-privacy/marmot-ts` (repo `marmot-protocol/marmot-ts`,
MIT). **Keep the slug** (no rename/redirect); retag `["nostr"]` + real description.

**Decision 6 — Germ (QUALIFIES).** Org `github.com/germ-network` (founders Tessa Brown /
Mark Sui; not an excluded org). `germ-network/lexicon` (Germ's ATProto lexicon) =
**MIT, © 2026 Germ Network, Inc.** (verified). `germ-network/autonomous-comm-protocol` has
NO readable LICENSE at `main` (404) — do NOT catalog that one. → Phase 1: add
`germ-network/lexicon` as the atproto exemplar (`protocols: ["atproto"]`, MIT pinned at a
SHA), described accurately as Germ's ATProto lexicon — NOT overclaimed as the full MLS
messenger. Reference Germ-the-messenger in the guide as the live MLS-over-atproto proof
point (cite reporting), no partnership implied.

