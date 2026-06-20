# Feature spec: <NAME>

> Fill this in BEFORE planning. Describe the *what* and *why*, not the *how*.
> The constitution (`.specify/memory/constitution.md`) is binding on this spec.

## Problem

<!-- The community problem in one paragraph a non-developer would recognize. -->

## Users & their goal

<!-- Who uses this and what they're trying to accomplish. -->

## Scope

- In scope:
- Out of scope:

## Requirements

- [ ] Functional requirement 1
- [ ] Functional requirement 2

## Constitution checks (must hold)

- [ ] No dependency owned by Meta / OpenAI / xAI (Article I)
- [ ] All deps OSI-licensed, verifiable at a commit (Article II)
- [ ] No hand-rolled cryptography — MLS/AEAD/gift-wrap via `ts-mls` /
      `@internet-privacy/marmot-ts` (Article III)
- [ ] Marmot event kinds pinned from the spec at a commit (Article III)
- [ ] KeyPackage rotation, no silent failures on the trust path, keys client-side,
      group-size limit surfaced (Article IV)

## Open questions (stop-and-ask)

<!-- List anything ambiguous. Do not guess — ask. Reconstructing crypto is never
     an answer to an open question. -->
