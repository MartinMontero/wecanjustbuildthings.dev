# Nostr MLS group messaging (Marmot) — archetype

A starting point for building **end-to-end-encrypted group messaging** on Nostr
with an AI agent, using the [Marmot protocol](https://wecanjustbuildthings.dev/catalog/marmot/)
(MLS over Nostr) — the protocol behind the White Noise client — with the
[exclusion policy](https://wecanjustbuildthings.dev/policies/) baked into the
project constitution.

> ⚠️ **Marmot is experimental, unaudited software.** Its own spec recommends
> against production use until it reaches stable status. Build to learn and
> contribute; see the guide,
> [Build encrypted group messaging on Nostr](https://wecanjustbuildthings.dev/guides/encrypted-group-messaging-marmot/).

## What's here

```
.specify/memory/constitution.md          binding project principles (exclusion policy + crypto-delegation)
.specify/templates/{spec,plan,tasks}.md   Spec Kit templates with constitution checks
specs/000-example-encrypted-group/        a worked spec → plan → tasks example
.claude/CLAUDE.md                         Claude Code project context
package.json                              clean, catalog-sourced starter deps (the Marmot TS stack)
```

## The one rule that matters most

**You never implement cryptography.** MLS group operations, key schedules,
AEAD, and NIP-59 gift-wrapping come from vetted libraries — `ts-mls` and
`@internet-privacy/marmot-ts` — never from ad-hoc or model-written code.
Reconstructing MLS by hand is a stop-and-ask, not a task. This archetype is
**integration glue**; the audited library is the math.

## Use it

1. Copy this directory into a new project:
   ```sh
   cp -r templates/spec-kit/nostr-mls-group-messaging my-app && cd my-app
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
OpenAI / xAI dependencies, OSI-licensed deps verified at a commit, **crypto
delegated to vetted MLS libraries (never hand-rolled)**, Marmot protocol numbers
pinned from the spec at a commit, and the operational discipline (rate limiting,
KeyPackage rotation, no silent failures on the trust path) that determines
whether what you ship is safe in the long tail.
