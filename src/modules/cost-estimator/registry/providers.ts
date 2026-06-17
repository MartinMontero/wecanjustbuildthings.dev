/**
 * In-bounds provider registry + dated pricing snapshots.
 *
 * Honesty rules (enforced by review + providers.test.ts):
 *  - Only sovereignty-friendly / independent providers. NEVER Meta/OpenAI/xAI
 *    (owner-excluded platform-wide) and NEVER AWS/Oracle (registry-excluded).
 *  - No verifiable machine-readable live pricing endpoint exists for any provider
 *    below (checked Jun 2026), so every one resolves from a SNAPSHOT.
 *  - Each `unitPrice` is `null` until a human confirms it against `sourceUrl`.
 *    Do NOT fabricate a plausible-looking number to fill a gap — leave it null.
 *  - `sourceUrl`s below are verified-real pricing pages; `lastVerified` stays null
 *    until the prices themselves are confirmed.
 */

/** Excluded vendor ids — may never appear as a provider here. */
export const EXCLUDED_PROVIDER_IDS = ['meta', 'openai', 'xai', 'aws', 'oracle'] as const;

/** Obvious aliases of the excluded vendors, so a rename can't sneak one in. */
export const EXCLUDED_PROVIDER_ALIASES = [
  'meta', 'facebook', 'instagram', 'whatsapp', 'threads',
  'openai', 'azure-openai', 'azureopenai',
  'xai', 'x-ai', 'grok',
  'aws', 'amazon', 'amazon-web-services', 'amazonaws', 'amazon web services',
  'oracle', 'oci', 'oracle-cloud', 'oraclecloud',
] as const;

export type PriceUnit = 'flat-month' | '1M-requests' | 'GB-egress' | 'GB-month';

export type LineKey = 'base' | 'compute' | 'bandwidth' | 'storage' | 'database';

/** A snapshot price line. `unitPrice: null` ⇒ TODO: confirm (never fabricate). */
export interface SnapshotLine {
  key: LineKey;
  label: string;
  unit: PriceUnit;
  unitPrice: number | null;
}

export interface ProviderSnapshot {
  providerId: string;
  providerName: string;
  /** Why it's in-bounds (independence / sovereignty). */
  note: string;
  currency: string; // ISO 4217
  /** A verifiable machine-readable live pricing endpoint, or null if none exists. */
  liveEndpoint: string | null;
  /** Primary source the snapshot prices must be confirmed against (verified real). */
  sourceUrl: string;
  /** ISO date the prices were last confirmed. null ⇒ TODO: confirm. */
  lastVerified: string | null;
  lines: SnapshotLine[];
}

export const PROVIDERS: readonly ProviderSnapshot[] = [
  {
    providerId: 'cloudflare',
    providerName: 'Cloudflare',
    note: 'Independent global edge platform; this site already runs on it. Pricing is published in human docs only — no first-party machine-readable pricing API (verified Jun 2026).',
    currency: 'USD',
    liveEndpoint: null, // verified absent: Cloudflare exposes no first-party machine-readable pricing API
    sourceUrl: 'https://developers.cloudflare.com/workers/platform/pricing/',
    lastVerified: null, // TODO: confirm
    lines: [
      { key: 'base', label: 'Workers Paid base', unit: 'flat-month', unitPrice: null }, // TODO: confirm (docs note a ~$5/mo account minimum)
      { key: 'compute', label: 'Worker requests', unit: '1M-requests', unitPrice: null }, // TODO: confirm
      { key: 'bandwidth', label: 'Egress / bandwidth', unit: 'GB-egress', unitPrice: null }, // TODO: confirm (Workers/R2 advertise $0 egress — confirm)
      { key: 'storage', label: 'R2 object storage', unit: 'GB-month', unitPrice: null }, // TODO: confirm — see https://developers.cloudflare.com/r2/pricing/
      { key: 'database', label: 'D1 database storage', unit: 'GB-month', unitPrice: null }, // TODO: confirm
    ],
  },
  {
    providerId: 'vexxhost',
    providerName: 'VEXXHOST',
    note: 'Independent, sovereignty-friendly OpenStack public cloud (Canada). Pay-as-you-go pricing page only — no public machine-readable pricing API found (verified Jun 2026).',
    currency: 'USD',
    liveEndpoint: null,
    sourceUrl: 'https://vexxhost.com/pricing/',
    lastVerified: null, // TODO: confirm
    lines: [
      { key: 'compute', label: 'Compute instance', unit: 'flat-month', unitPrice: null }, // TODO: confirm
      { key: 'bandwidth', label: 'Bandwidth / egress', unit: 'GB-egress', unitPrice: null }, // TODO: confirm
      { key: 'storage', label: 'Block / object storage', unit: 'GB-month', unitPrice: null }, // TODO: confirm
      { key: 'database', label: 'Managed database', unit: 'GB-month', unitPrice: null }, // TODO: confirm
    ],
  },
  {
    providerId: 'denvr',
    providerName: 'Denvr Dataworks',
    note: 'Independent sovereign AI/GPU cloud. Serves open models via an OpenAI-compatible API format (a wire format, not OpenAI ownership). Pricing is page/console-based — no public machine-readable pricing API found (verified Jun 2026).',
    currency: 'USD',
    liveEndpoint: null,
    sourceUrl: 'https://www.denvr.com/pricing',
    lastVerified: null, // TODO: confirm
    lines: [
      { key: 'compute', label: 'Compute / GPU (normalized to month)', unit: 'flat-month', unitPrice: null }, // TODO: confirm
      { key: 'bandwidth', label: 'Bandwidth / egress', unit: 'GB-egress', unitPrice: null }, // TODO: confirm
      { key: 'storage', label: 'Storage', unit: 'GB-month', unitPrice: null }, // TODO: confirm
    ],
  },
] as const;

export function getProvider(providerId: string): ProviderSnapshot | undefined {
  return PROVIDERS.find((p) => p.providerId === providerId);
}
