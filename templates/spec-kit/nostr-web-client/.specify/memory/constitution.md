# Project constitution — Nostr / AT Protocol web client

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
catalog's verification standard). Prefer copyleft-compatible licenses for a
project that itself ships under AGPL-3.0-or-later unless a deliberate exception is
documented.

## Article III — Protocol correctness

- **Nostr:** events must be NIP-01 compliant; relay AUTH (NIP-42) failures must be
  surfaced, never swallowed silently; signing uses audited crypto
  (`@noble/curves`), never ad-hoc implementations.
- **AT Protocol:** use the official lexicons via `@atproto/api`; respect rate
  limits and handle session refresh explicitly.

## Article IV — Operational discipline (the long-tail rules)

These exist because the failures that hurt communities happen in month six, not
on demo day:

- **Rate limiting** on every public endpoint and relay connection — from day one,
  not as a post-incident patch.
- **Authentication paths are tested.** No untested auth hooks ship.
- **No silent failures.** Errors on the trust path (signing, AUTH, key handling)
  are surfaced to the user or logs.
- **User data minimization.** Collect nothing you don't need; store keys
  client-side; never route user content through a third-party model.

## Article V — Verifiability

The product must be a stable, auditable artifact: pinned dependencies, a real
license, and a green run of the enforcement engine. "An agent wrote it" is not a
substitute for "it passes the checks."

## Amendments

Changing this constitution requires a human decision recorded in the commit
message. Agents propose; humans ratify.
