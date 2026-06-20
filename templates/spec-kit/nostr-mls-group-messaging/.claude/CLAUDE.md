# Project context for Claude Code

Read these in full before any task:
- @.specify/memory/constitution.md — binding project principles (DO NOT override
  without explicit human consent)
- @specs/000-example-encrypted-group/ — a worked example spec → plan → tasks

## Standing rules

- STOP AND ASK when information is missing. Never speculate.
- **Never hand-roll cryptography.** MLS, key schedules, AEAD, and NIP-59
  gift-wrapping come from `ts-mls` / `@internet-privacy/marmot-ts` — never from
  ad-hoc or model-written code. Reconstructing MLS is a stop-and-ask, not a task.
- No dependency owned by Meta, OpenAI, or xAI — directly or transitively.
- Run the enforcement engine before committing and never bypass a layer:
  `npx tsx ../../../enforcement/cli.ts all --tree .`
- Use a permitted model provider (Anthropic, DeepSeek, Kimi, OpenRouter, or local
  Ollama), BYOK. Never an excluded provider.
- Marmot is experimental/unaudited — surface that to users; pin every Marmot
  event kind from `marmot-protocol/marmot` at a named commit (constitution
  Article III).
- Operational discipline is not optional: rate limiting, KeyPackage rotation,
  tested trust paths, no silent failures, data minimization (constitution
  Article IV).

## Workflow with Spec Kit

This archetype is meant to be initialized with GitHub Spec Kit:

```sh
uvx --from git+https://github.com/github/spec-kit.git specify init . --here --ai claude
```

Then drive features with the slash commands:
`/speckit.specify` → `/speckit.plan` → `/speckit.tasks`, always honoring the
constitution above. The companion skills `marmot-group-setup`,
`marmot-relay-strategy`, `marmot-encrypted-media`, and
`marmot-push-notifications` (in this repo's `skills/`) encode the event flow.
