# Project constitution — Nostr MLS group messaging (Marmot)

This constitution is **binding** on every spec, plan, and task generated in this
project. Agents read it first and do not override it without explicit written
human consent.

## Article I — Provider exclusion (non-negotiable)

No dependency, transitively or directly, may be owned by **Meta, OpenAI, or
xAI**. No code may call their endpoints or read their config keys. This is
enforced, not advised:

```sh
# Must pass before any commit:
npx tsx ../../../enforcement/cli.ts all --tree .
```

Any AI assistance used to build this project must use a **permitted** provider
(Anthropic, DeepSeek, Kimi, OpenRouter, or local Ollama), BYOK. See the
[Shakespeare BYOK recipe](https://wecanjustbuildthings.dev/recipes/shakespeare-byok-configuration/).

## Article II — Licensing

Every dependency must carry an OSI-approved license, verified at a commit (see the
catalog's verification standard). The Marmot TS stack pinned in `package.json`
(`@internet-privacy/marmot-ts`, `ts-mls`, `nostr-tools`, `@noble/curves`,
`blossom-client-sdk`) is catalog-verified. Prefer copyleft-compatible licenses for
a project that itself ships under AGPL-3.0-or-later unless a deliberate exception
is documented.

## Article III — Cryptography & protocol correctness (the load-bearing article)

**Never hand-roll cryptography.** This is the single most important rule in this
project, because a subtly-wrong MLS or AEAD implementation is exploitable and
invisible.

- MLS group state, key schedules, the ChaCha20-Poly1305 AEAD, the exporter-secret
  derivation, and NIP-59 gift-wrapping come from **`ts-mls`** and
  **`@internet-privacy/marmot-ts`** — never from ad-hoc or model-written code.
  Reconstructing any of it is a **stop-and-ask**, not a task.
- **Marmot event kinds and identifiers are pinned from the spec at a commit** and
  re-verified before use (the spec is in `review`/`draft` and has already moved —
  e.g. KeyPackages migrated from a legacy `kind:443` to today's `kind:30443`):
  - KeyPackage: `kind:30443` (addressable; legacy `443` is migration-only)
  - KeyPackage relay list: `kind:10051`; inbox / notification relays: `kind:10050`
  - Welcome: `kind:444`, gift-wrapped per NIP-59 (`kind:1059` → `kind:13` → `444`)
  - Group Event (message): `kind:445`
  - Marmot Group Data Extension: `0xF2EE`
- **Nostr correctness:** events are NIP-01 compliant; signing uses audited crypto
  (`@noble/curves`), never ad-hoc; an AEAD authentication failure drops the event
  and never exposes unauthenticated plaintext.
- **Honesty about maturity:** Marmot is experimental and unaudited; surface this to
  users and never present it as production-ready E2EE without a documented,
  human-ratified risk decision.

## Article IV — Operational discipline (the long-tail rules)

These exist because the failures that hurt communities happen in month six, not
on demo day:

- **Rate limiting** on every relay connection and public endpoint — from day one.
- **KeyPackage hygiene:** rotate a KeyPackage after it is used to join a group;
  never reuse one beyond its `last_resort` allowance; dispose of private key
  material promptly.
- **No silent failures.** Errors on the trust path (signing, MLS processing, AEAD,
  key handling) are surfaced to the user or logs — never swallowed.
- **Data minimization & self-custody.** Keys stay client-side; messages and keys
  are never routed through a third-party model or server. Collect nothing you
  don't need.
- **Group-size limits are surfaced.** Welcomes above ~150 members exceed many
  relays' size limits (MIP-02); design for small/medium groups and tell the user.

## Article V — Verifiability

The product must be a stable, auditable artifact: pinned dependencies, a real
license, and a green run of the enforcement engine. "An agent wrote it" is not a
substitute for "it passes the checks."

## Amendments

Changing this constitution requires a human decision recorded in the commit
message. Agents propose; humans ratify.
