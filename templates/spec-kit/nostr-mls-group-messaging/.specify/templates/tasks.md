# Tasks: <NAME>

> Ordered, checkable tasks derived from the plan. Each task ends green
> (tests + enforcement) before the next begins.

## Setup
- [ ] Scaffold project; pin Node ≥ 22; add catalog-sourced dependencies (the
      Marmot TS stack).
- [ ] Wire the enforcement engine into a pre-commit / CI check.

## Implementation
- [ ] T1 — <task> (acceptance: <how you'll know it's done>)
- [ ] T2 — <task>
- [ ] T3 — <task>

> Every cryptographic step delegates to `ts-mls` / `@internet-privacy/marmot-ts`.
> If a task seems to require implementing MLS, AEAD, or gift-wrapping, STOP and ask.

## Operational hardening (Article IV — not optional)
- [ ] Rate limiting on every relay connection.
- [ ] KeyPackage rotation after use; no reuse beyond `last_resort`.
- [ ] Tests for the trust path (MLS processing, AEAD failure ⇒ drop, signing).
- [ ] Error surfacing on the trust path; no swallowed exceptions.
- [ ] Group-size limit (~150) surfaced to the user.

## Verification gate (must pass to ship)
- [ ] `npx tsx ../../../enforcement/cli.ts all --tree .` exits 0
- [ ] Unit/integration tests green
- [ ] No hand-rolled cryptography in the diff
- [ ] No dependency owned by Meta / OpenAI / xAI (direct or transitive)
