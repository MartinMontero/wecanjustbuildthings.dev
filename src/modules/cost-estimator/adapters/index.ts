import type { PricingProviderAdapter } from '../core/types.ts';
import { cloudflareAdapter } from './cloudflare.ts';
import { vexxhostAdapter } from './vexxhost.ts';
import { denvrAdapter } from './denvr.ts';

/** Every in-bounds adapter, in display order. All snapshot-resolved today. */
export const ALL_ADAPTERS: readonly PricingProviderAdapter[] = [
  cloudflareAdapter,
  vexxhostAdapter,
  denvrAdapter,
];
