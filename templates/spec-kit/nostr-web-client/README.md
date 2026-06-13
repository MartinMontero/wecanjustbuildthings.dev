# Nostr / AT Protocol web client — archetype

A starting point for building a Nostr and/or AT Protocol web client with an AI
agent, with the [exclusion policy](https://wecanjustbuildthings.dev/policies/)
baked into the project constitution.

## What's here

```
.specify/memory/constitution.md   binding project principles (the exclusion policy)
.specify/templates/{spec,plan,tasks}.md   Spec Kit templates with constitution checks
specs/000-example-relay-pool/     a worked spec → plan → tasks example
.claude/CLAUDE.md                 Claude Code project context
package.json                      clean, catalog-sourced starter deps
```

## Use it

1. Copy this directory into a new project:
   ```sh
   cp -r templates/spec-kit/nostr-web-client my-app && cd my-app
   ```
2. (Optional) Initialize GitHub Spec Kit to get the slash commands:
   ```sh
   uvx --from git+https://github.com/github/spec-kit.git specify init . --here --ai claude
   ```
3. Configure your agent (Goose or Claude Code) with a **permitted** model
   provider (Anthropic, DeepSeek, Kimi, OpenRouter, or local Ollama), BYOK.
4. Drive a feature: `/speckit.specify` → `/speckit.plan` → `/speckit.tasks`,
   honoring `.specify/memory/constitution.md`.
5. Gate every change on the enforcement engine:
   ```sh
   npm install
   npx tsx ../../../enforcement/cli.ts all --tree .
   ```

## Why a constitution

The constitution makes the policy decisions *before* the agent runs: no Meta /
OpenAI / xAI dependencies, OSI-licensed deps verified at a commit, protocol
correctness, and the operational discipline (rate limiting, tested auth, no
silent failures) that determines whether what you ship is safe in the long tail.
