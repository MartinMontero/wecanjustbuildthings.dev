# Tasks: <NAME>

> Ordered, checkable tasks derived from the plan. Each task ends green
> (tests + enforcement) before the next begins.

## Setup
- [ ] Scaffold project; pin Node ≥ 22; add catalog-sourced dependencies.
- [ ] Wire the enforcement engine into a pre-commit / CI check.

## Implementation
- [ ] T1 — <task> (acceptance: <how you'll know it's done>)
- [ ] T2 — <task>
- [ ] T3 — <task>

## Operational hardening (Article IV — not optional)
- [ ] Rate limiting on every public endpoint / relay connection.
- [ ] Tests for every authentication path (incl. NIP-42 AUTH failure handling).
- [ ] Error surfacing on the trust path; no swallowed exceptions.

## Verification gate (must pass to ship)
- [ ] `npx tsx ../../../enforcement/cli.ts all --tree .` exits 0
- [ ] Unit/integration tests green
- [ ] No dependency owned by Meta / OpenAI / xAI (direct or transitive)
