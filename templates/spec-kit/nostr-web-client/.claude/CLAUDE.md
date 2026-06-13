# Project context for Claude Code

Read these in full before any task:
- @.specify/memory/constitution.md — binding project principles (DO NOT override
  without explicit human consent)
- @specs/000-example-relay-pool/ — a worked example spec → plan → tasks

## Standing rules

- STOP AND ASK when information is missing. Never speculate.
- No dependency owned by Meta, OpenAI, or xAI — directly or transitively.
- Run the enforcement engine before committing and never bypass a layer:
  `npx tsx ../../../enforcement/cli.ts all --tree .`
- Use a permitted model provider (Anthropic, DeepSeek, Kimi, OpenRouter, or local
  Ollama), BYOK. Never an excluded provider.
- Operational discipline is not optional: rate limiting, tested auth, no silent
  failures on the trust path, data minimization (constitution Article IV).

## Workflow with Spec Kit

This archetype is meant to be initialized with GitHub Spec Kit:

```sh
uvx --from git+https://github.com/github/spec-kit.git specify init . --here --ai claude
```

Then drive features with the slash commands:
`/speckit.specify` → `/speckit.plan` → `/speckit.tasks`, always honoring the
constitution above.
