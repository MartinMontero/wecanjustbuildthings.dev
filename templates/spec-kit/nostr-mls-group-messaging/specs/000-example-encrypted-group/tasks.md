# Tasks: A minimal encrypted group

## Setup
- [ ] T0 — Scaffold (Node ≥ 22, TypeScript, Vite); add `@internet-privacy/marmot-ts`,
      `ts-mls`, `nostr-tools`, `@noble/curves`; wire enforcement into CI.

## Implementation
- [ ] T1 — `keys.ts`: generate/load the Nostr keypair; persist the secret to
      browser storage only; expose it as the MLS identity.
      Acceptance: the secret never appears in any network request (test asserts it).
- [ ] T2 — `keypackage.ts`: build a KeyPackage via the library; publish `kind:30443`
      (random `d`) and a `kind:10051` relay list.
      Acceptance: a peer can fetch the `kind:30443` from the advertised relays.
- [ ] T3 — `group.ts`: create the MLS group (`0xF2EE` extension) via the library.
      Acceptance: group state is produced entirely by `marmot-ts`/`ts-mls`; no
      crypto is implemented in this repo (reviewer-checked).
- [ ] T4 — `welcome.ts`: build + NIP-59 gift-wrap the Welcome (`1059`→`13`→`444`),
      deliver to the invitee's inbox; invitee unwraps, joins, and rotates their
      KeyPackage.
      Acceptance: the invitee joins from the gift wrap alone; the consumed
      KeyPackage is replaced.
- [ ] T5 — `messages.ts`: send and receive one `kind:445` Group Event.
      Acceptance: both members decrypt it; a tampered ciphertext is dropped and the
      failure is surfaced, never exposing plaintext.

## Operational hardening (Article IV)
- [ ] T6 — Relay strategy: KeyPackages on `kind:10051`, Welcomes to `kind:10050`
      inbox; per-relay status, no silent drops.
- [ ] T7 — KeyPackage rotation after join; no reuse beyond `last_resort`.
- [ ] T8 — Trust-path tests (MLS processing, AEAD failure ⇒ drop, signing); audit
      for swallowed exceptions.

## Verification gate
- [ ] `npx tsx ../../../enforcement/cli.ts all --tree .` exits 0
- [ ] All tests green
- [ ] No hand-rolled cryptography in the diff
- [ ] No Meta / OpenAI / xAI dependency (direct or transitive)
