# Agent skills

These skills encode the catalog's engineering discipline into repeatable
workflows. They are **harness-agnostic**: each ships in two forms.

| Skill | What it does |
|---|---|
| [`catalog-entry-author`](./catalog-entry-author/SKILL.md) | Author one accurate, policy-clean catalog entry, verifying the license at a commit and running enforcement before commit. |
| [`license-watcher`](./license-watcher/SKILL.md) | Detect license drift weekly via three independent signals; open a PR. |
| [`maintenance-checker`](./maintenance-checker/SKILL.md) | Reclassify maintenance status weekly from primary-source activity; open a PR. |

## Using them with Claude Code

The `SKILL.md` files follow Anthropic's Skills format (`name` + trigger-rich
`description` + body). Drop the `skills/` directory into a Claude Code project (or
reference it from your global skills directory) and the skill activates when your
request matches its triggers.

## Using them with Goose

Equivalent **Goose recipes** live in [`../goose-recipes/`](../goose-recipes/).
Run one with:

```sh
goose run --recipe goose-recipes/catalog-entry-author.yaml
```

Both forms call the same underlying npm scripts (`npm run data:fetch`,
`npm run enforce`, `npm run watch:license`, `npm run watch:maintenance`), so the
behavior is identical regardless of harness.

## The one rule they all share

**Run the three-layer enforcement engine before committing, and never bypass a
layer.** A skill that can't make an entry pass cleanly stops and asks rather than
shipping a violation.
