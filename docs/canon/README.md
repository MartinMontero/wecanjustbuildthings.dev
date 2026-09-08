# docs/canon — governing canon, home in the repo

**Precedence (per the BuilderOS spec, as stated in Martin's canon-homecoming
tasking 2026-09-07 — the BuilderOS spec text itself is not on this disk;
label: REPORTED):** **verified primary source > component canon > system
spec.** Within its lane, this repo's own canon governs.

## Homecoming landed here

| File | Role |
|---|---|
| `docs/canon/triad-canon.md` | **The triad canon's canonical home — this repo, per the canon's own header** ("The connective layer (the WCJBT repo) holds the canonical copy … If a copy ever disagrees with the canonical one, the canonical one wins"). This file fills that home (it was empty until now — flagged by Alfred's W2 landing audit 2026-07-14). Content verified byte-identical-modulo-EOL to the Holmes and Alfred mirrors, with the D-15 vocabulary migration applied identically to all three. Mirrors live at `Holmes: docs/triad-canon.md` and `Alfred: docs/triad-canon.md`; revise HERE, then re-distribute. |

## Governing canon already in this repo

`CLAUDE.md`, `POLICIES.md`, `SECURITY.md`, `DESIGN.md`,
`docs/claude-project-instructions.md`, `ROADMAP.md`,
`docs/OPERATOR-RUNBOOK.md`, `enforcement/` (the three-layer enforcement
engine), `osv-scanner.toml`.

## ABSENT (checked, not assumed — 2026-09-07)

- `PROJECT_INSTRUCTIONS.md` (named in the homecoming tasking): not on
  disk in this repo or anywhere else. The in-repo equivalent is
  `docs/claude-project-instructions.md`. If a separate
  `PROJECT_INSTRUCTIONS.md` exists in the Kimi project, export it and it
  lands here.
- No `00`-style numbered instruction set exists on this side.

## Reference material (stays put; not governing)

`docs/archive/*`, `docs/mobile-audit.md`, `wisdom-intuition-knowledge-judgment-v2.md`
(repo root — the Map, v2; research/scholarship), `docs/assets/*`.

## The vocabulary (D-15, Martin 2026-09-01)

Claim labels in governing canon are the **five system states**:
EXECUTED / VERIFIED-LIVE / CANON / REPORTED / UNVERIFIED (build-workflow
vocabulary per Alfred ADR-0005). The retired `[DIRECTIONAL]`/`[NEEDS-CAVEAT]`
markers map: `[DIRECTIONAL]` → REPORTED; `[NEEDS-CAVEAT]` → the state its
sourcing earns, caveat preserved verbatim.
