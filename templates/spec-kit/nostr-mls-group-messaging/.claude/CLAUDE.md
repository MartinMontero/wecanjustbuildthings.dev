# Project context for Claude Code

Read these in full before any task:
- @.specify/memory/constitution.md — binding project principles (DO NOT override
  without explicit human consent)
- @specs/000-example-encrypted-group/ — a worked example spec → plan → tasks

## Standing rules

- STOP AND ASK when information is missing. Never speculate.
- **Never hand-roll cryptography.** MLS, AEAD, key derivation, and NIP-59
  gift-wrapping come from `ts-mls` / `@internet-privacy/marmot-ts` — never from
  ad-hoc or model-written code. Reconstructing MLS is a stop-and-ask, not a task
  (constitution Article III).
- No dependency owned by Meta, OpenAI, or xAI — directly or transitively.
- Marmot protocol numbers (event kinds, extension ids) are **pinned from the spec
  at a commit**. Re-verify against `marmot-protocol/marmot` before relying on one.
- Run the enforcement engine before committing and never bypass a layer:
  `npx tsx ../../../enforcement/cli.ts all --tree .`
- Use a permitted model provider (Anthropic, DeepSeek, Kimi, OpenRouter, or local
  Ollama), BYOK. Never an excluded provider.
- Operational discipline is not optional: rate limiting, KeyPackage rotation,
  no silent failures on the trust path, keys client-side (constitution Article IV).

## Marmot is experimental

The protocol is unaudited and its authors advise against production use. Surface
this to users; never present it as production-ready E2EE without a documented risk
decision. See the guide:
https://wecanjustbuildthings.dev/guides/encrypted-group-messaging-marmot/

## Workflow with Spec Kit

This archetype is meant to be initialized with GitHub Spec Kit:

```sh
uvx --from git+https://github.com/github/spec-kit.git specify init . --here --ai claude
```

Then drive features with the slash commands:
`/speckit.specify` → `/speckit.plan` → `/speckit.tasks`, always honoring the
constitution above.
