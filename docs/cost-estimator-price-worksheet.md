# Cost Estimator — price intake worksheet

A confirm-against-source worksheet for the placeholder values in the Hosting Cost
Estimator. **Every price below is intentionally blank.** Per the zero-fabrication
rule (`CLAUDE.md` constraint 5; `core/types.ts:39-50`), no number was filled in by
the agent — a human confirms each value against its **primary source**, then
transcribes it into the code and stamps the verification date.

- Runbook context: `docs/OPERATOR-RUNBOOK.md` §B1 · ROADMAP "Decisions needed".
- This is **data entry + sign-off, not engineering** — the code path already
  carries `null` lines through for transparency and excludes them from the
  confirmed total.
- **Decision gate:** confirm the prices (fill them in) *or* hide the module until
  they are confirmed.

## How to use this worksheet

1. Open each **primary source** URL and read the current value for the field.
2. Write the number in the *Value to confirm* column (keep it in the listed unit).
3. When **all** of a provider's lines are confirmed, transcribe them into
   `src/modules/cost-estimator/registry/providers.ts` (`unitPrice`) and set that
   provider's `lastVerified` to the ISO date you confirmed them (e.g. `2026-06-29`).
4. For the tier bands/factors, get product-owner sign-off (these are product
   decisions, **not** external prices) and edit
   `src/modules/cost-estimator/config/tiers.ts`.
5. Run `npm run test` (`providers.test.ts` enforces the honesty rules) then
   `npm run build`.

> **Units** (`registry/providers.ts:27`): `flat-month` = fixed $/month ·
> `1M-requests` = $/1,000,000 requests · `GB-egress` = $/GB outbound ·
> `GB-month` = $/GB stored per month. Currency for every provider below: **USD**.

---

## Part 1 — Provider unit prices

Source: `src/modules/cost-estimator/registry/providers.ts`. **12** `unitPrice: null`
lines across 3 providers, plus **3** provider-level `lastVerified: null` stamps.
(The adapters in `adapters/*.ts` are snapshot-only wrappers — they hold no prices
of their own — so this file is the complete price surface.)

### Cloudflare (`providerId: cloudflare`)

Registry `sourceUrl`: `https://developers.cloudflare.com/workers/platform/pricing/`

| Loc | Field (`label`) | `key` | Unit | What it represents | Primary source to confirm against | Value to confirm | Notes |
|---|---|---|---|---|---|---|---|
| `providers.ts:64` | Workers Paid base | `base` | `flat-month` | Fixed monthly minimum to be on the Workers **Paid** plan (account-level) | https://developers.cloudflare.com/workers/platform/pricing/ | ☐ | Registry comment notes a ~$5/mo account minimum — confirm exact figure. |
| `providers.ts:65` | Worker requests | `compute` | `1M-requests` | Price per **1,000,000** Worker requests beyond the included allotment | https://developers.cloudflare.com/workers/platform/pricing/#workers | ☐ | Use **Workers Standard** rates — do **not** use the separate "Dynamic Workers" product table. |
| `providers.ts:66` | Egress / bandwidth | `bandwidth` | `GB-egress` | Price per GB of outbound bandwidth / egress | https://developers.cloudflare.com/workers/platform/pricing/ · https://developers.cloudflare.com/r2/pricing/ | ☐ | Workers/R2 advertise **$0 egress** — confirm whether the value is `0` (a confirmed `0` is a real price, not a `null`). |
| `providers.ts:67` | R2 object storage | `storage` | `GB-month` | Price per GB-month of R2 object storage | https://developers.cloudflare.com/r2/pricing/ | ☐ | Storage section. Class A/B operation charges are out of the current line schema. |
| `providers.ts:68` | D1 database storage | `database` | `GB-month` | Price per GB-month of D1 stored data | https://developers.cloudflare.com/d1/platform/pricing/ | ☐ | This line models **storage only**; D1 also bills rows read/written, which the current schema does not represent. |
| `providers.ts:62` | — | `lastVerified` | ISO date | Date all Cloudflare prices above were confirmed | (stamp after confirming the 5 lines) | ☐ | e.g. `2026-06-29`. |

### VEXXHOST (`providerId: vexxhost`)

Registry `sourceUrl`: `https://vexxhost.com/pricing/` · page-only, no machine-readable
pricing API (verified Jun 2026).

| Loc | Field (`label`) | `key` | Unit | What it represents | Primary source to confirm against | Value to confirm | Notes |
|---|---|---|---|---|---|---|---|
| `providers.ts:80` | Compute instance | `compute` | `flat-month` | Monthly price of a representative compute instance | https://vexxhost.com/pricing/ | ☐ | Decide which instance size is the standard the estimator quotes. |
| `providers.ts:81` | Bandwidth / egress | `bandwidth` | `GB-egress` | Price per GB egress | https://vexxhost.com/pricing/ | ☐ | |
| `providers.ts:82` | Block / object storage | `storage` | `GB-month` | Price per GB-month of block/object storage | https://vexxhost.com/pricing/ | ☐ | Confirm whether block vs object differ; pick one for this line. |
| `providers.ts:83` | Managed database | `database` | `GB-month` | Price per GB-month for a managed database | https://vexxhost.com/pricing/ | ☐ | |
| `providers.ts:78` | — | `lastVerified` | ISO date | Date all VEXXHOST prices above were confirmed | (stamp after confirming the 4 lines) | ☐ | |

### Denvr Dataworks (`providerId: denvr`)

Registry `sourceUrl`: `https://www.denvr.com/pricing` · page/console-based, no
machine-readable pricing API (verified Jun 2026).

| Loc | Field (`label`) | `key` | Unit | What it represents | Primary source to confirm against | Value to confirm | Notes |
|---|---|---|---|---|---|---|---|
| `providers.ts:95` | Compute / GPU (normalized to month) | `compute` | `flat-month` | Monthly price of a representative GPU/compute unit, normalized to a month | https://www.denvr.com/pricing | ☐ | Confirm which SKU and the hourly→monthly normalization basis (e.g. ×730h). |
| `providers.ts:96` | Bandwidth / egress | `bandwidth` | `GB-egress` | Price per GB egress | https://www.denvr.com/pricing | ☐ | |
| `providers.ts:97` | Storage | `storage` | `GB-month` | Price per GB-month of storage | https://www.denvr.com/pricing | ☐ | |
| `providers.ts:93` | — | `lastVerified` | ISO date | Date all Denvr prices above were confirmed | (stamp after confirming the 3 lines) | ☐ | |

> **`liveEndpoint: null` is not a gap to fill.** All three providers have
> `liveEndpoint: null`, a *confirmed-absent* fact (no first-party machine-readable
> pricing API exists, verified Jun 2026). Leave it `null` unless a verifiable
> endpoint later appears; the snapshot path is intentional.

---

## Part 2 — Tier bands & scaling factors (product decisions, **not** external prices)

Source: `src/modules/cost-estimator/config/tiers.ts`. These are **product
assumptions** about what a Seed/Growth/Scale builder looks like and how usage
scales — there is **no pricing URL** that confirms them. They need a
**product-owner decision**, not a primary-source lookup. The values below are the
**current placeholders in code** (each marked `// TODO: confirm`), shown so the
owner can confirm or replace them.

| Tier | `scale` (×Seed) | `monthlyActiveUsers` | `bandwidthGB` | `storageGB` | `compute` | Loc |
|---|---|---|---|---|---|---|
| `seed` | 1 | 500 | 10 | 5 | `edge` | `tiers.ts:26` |
| `growth` | 10 | 10,000 | 200 | 100 | `serverless` | `tiers.ts:28` |
| `scale` | 50 | 100,000 | 2,000 | 1,000 | `always-on` | `tiers.ts:30` |

What each field means (`tiers.ts:11-22`, `core/estimator.ts:55-66`):
- **`scale`** — multiplier applied to the builder's *entered* usage relative to
  Seed = 1 (projects "what if I were 10×/50× bigger").
- **`baseline.*`** — absolute fallback band used **per field only when the builder
  entered nothing** for that field.
- **`compute`** — the posture (`edge` / `serverless` / `always-on`) assumed at that
  tier when the builder didn't pick one.

**Decisions for the product owner:**
- [ ] Confirm/replace the three `scale` multipliers (1 / 10 / 50).
- [ ] Confirm/replace each baseline band (MAU, bandwidthGB, storageGB).
- [ ] Confirm the default `compute` posture per tier.

---

## Apply & verify checklist

- [ ] Cloudflare: 5 prices confirmed → `unitPrice` set → `lastVerified` stamped.
- [ ] VEXXHOST: 4 prices confirmed → `unitPrice` set → `lastVerified` stamped.
- [ ] Denvr: 3 prices confirmed → `unitPrice` set → `lastVerified` stamped.
- [ ] Tier bands/factors signed off → `tiers.ts` updated.
- [ ] `npm run test` green (`providers.test.ts` honesty rules) · `npm run build` green.
- [ ] Or: module hidden until prices are confirmed (the alternative decision).

*Primary-source URLs current as of 2026-06-29. Cloudflare URLs confirmed canonical
via the Cloudflare docs index; VEXXHOST/Denvr URLs per the registry (verified
Jun 2026) — re-check liveness when filling in values, as pricing pages move.*
