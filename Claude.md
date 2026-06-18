# wecanjustbuildthings.dev — Project Context for Claude Code

## What this is
An Astro 5 (Starlight) + Cloudflare Pages platform guiding NON-DEVELOPER builders
through agentic software development. It drives "Goose" (AAIF/Linux Foundation
open-source agent runtime: github.com/aaif-goose/goose, docs goose-docs.ai) as a
USER-FACING agentic runtime. END USERS are non-developers; contributors are technical.

## Architecture invariants (do not violate)
- Stack: Astro 5 + Starlight + Cloudflare Pages. Catalog = Astro 5 Content Layer
  (glob/file loader + Zod schema), ~842 YAML entries.
- Model-free Path A: the PLATFORM makes ZERO LLM inference calls. Exactly ONE
  deterministic structured-reflection exception (reads structured JSON; never calls an LLM).
- Goose is driven via STABLE client-side recipe deeplinks: `goose://recipe?config=<base64>`
  built with btoa(JSON.stringify(recipe)) (UTF-8-safe). Goose runs on the USER's machine
  with the USER's own model + keys. goose serve / ACP-over-HTTP / TS SDK are EXPERIMENTAL — out of scope.
- ONE shared client-side build session object is wired across Build Studio, Mentor Engine,
  Skills Creator, and Catalog. All four read/write it. Pass typed fields, not full history.
- Mentor Engine = Yoda/Morpheus/J.A.R.V.I.S./Neo guidance metaphor, implemented as a Goose
  SKILL (persona) + deterministic reflection over recipe response.json_schema output.

## Vendor policy (AOS)
- EXCLUDE as inference/model providers: Meta, OpenAI, xAI ONLY.
- Google is PERMITTED (Fonts, Maps, Analytics, reCAPTCHA, etc.). Do NOT exclude Google.
- Never hardcode a model provider: Goose is model-agnostic; the USER chooses.

## MCP / security
- Catalog is the trust boundary. Generated recipes may reference ONLY allowlisted,
  vetted extensions/skills. Never surface raw MCP server config to non-devs.
- Rely on Goose "Trust and Execute" consent, extension allowlist, least-privilege,
  prompt-injection detection. Treat tool descriptions as untrusted unless from a trusted source.

## Workflow
- Plan before code. Separate audit -> plan -> execute. One vertical slice per session.
- Commit a checkpoint before any large refactor.
- Run typecheck + tests after each change; do not declare done until they pass.
- Keep changes minimal and scoped; no speculative abstractions.
- For deeplinks: always assert output starts with `goose://recipe?config=` and round-trips.

## Pointers (read on demand, don't inline)
- Catalog schema + loader: @src/content.config.ts
- Shared build session object: @src/lib/session.ts   (update path if it moves)
- Recipe serializer + deeplink: @src/lib/goose/
- Project overview: @README.md
