# Agent skills

These skills encode the catalog's engineering discipline into repeatable
workflows. They are **harness-agnostic**: each ships in two forms.

| Skill | What it does |
|---|---|
| [`catalog-entry-author`](./catalog-entry-author/SKILL.md) | Author one accurate, policy-clean catalog entry, verifying the license at a commit and running enforcement before commit. |
| [`license-watcher`](./license-watcher/SKILL.md) | Detect license drift weekly via three independent signals; open a PR. |
| [`maintenance-checker`](./maintenance-checker/SKILL.md) | Reclassify maintenance status weekly from primary-source activity; open a PR. |
| [`supply-chain-security`](./supply-chain-security/SKILL.md) | Scaffold CVE scanning (OSV-Scanner + Grype), an SBOM, and build provenance as SHA-pinned, hardened CI that hard-fails only on an actionable CRITICAL. |

### Marmot — encrypted group messaging on Nostr (MLS over Nostr)

These four choreograph the [Marmot protocol](/catalog/marmot/) (the protocol behind
the White Noise client). They orchestrate Nostr events and **delegate all
cryptography to MDK / marmot-ts — never reconstructing MLS by hand**. Every protocol
number is pinned from the Marmot MIPs at commit `21a67b2`.

| Skill | What it does |
|---|---|
| [`marmot-group-setup`](./marmot-group-setup/SKILL.md) | The six-step group flow: identity → KeyPackage (`kind:30443`) → group (Group Data Ext `0xF2EE`) → Welcome (`kind:444` via NIP-59) → send/receive (`kind:445`). |
| [`marmot-relay-strategy`](./marmot-relay-strategy/SKILL.md) | Split KeyPackage relays (`kind:10051`, discovery) from inbox/notification relays (`kind:10050`, delivery) so invites and messages arrive. |
| [`marmot-encrypted-media`](./marmot-encrypted-media/SKILL.md) | MIP-04 (draft) media: ChaCha20-Poly1305 from the MLS exporter secret, stored on Blossom, shared via an `imeta` tag. |
| [`marmot-push-notifications`](./marmot-push-notifications/SKILL.md) | MIP-05 (draft) privacy-preserving push: the token lifecycle (`kind:447`/`448`/`449`) and gift-wrapped notification request (`kind:446`). |

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
