/**
 * Model Compass registry — the two-tier hybrid, sorted sovereignty-first.
 *
 * Honesty rules (enforced by models.test.ts):
 *  - Only sovereignty-friendly / independent options. NEVER an entry developed by
 *    an excluded org (Meta/OpenAI/xAI/AWS/Oracle — see EXCLUDED_PROVIDER_IDS).
 *    OpenAI's "GPT-OSS" (e.g. via a confidential-computing menu) is excluded too.
 *  - Every NUMBER (contextWindow, costPerMTok, benchmark score) is `null` until
 *    confirmed against `sourceUrl`; once a number is set, `lastVerified` must carry
 *    the date it was confirmed. Do NOT fabricate — leave a gap null.
 *  - `sourceUrl`s below are verified-real primary pages (model cards / repos / docs).
 *
 * Phase-3 population status (2026-06-18): context windows and the prices/benchmarks
 * noted inline are filled from the cited sources and AWAIT MAINTAINER SIGN-OFF on
 * review. Anything still `null` (most hosted prices, most benchmark scores) was not
 * confirmed and remains TODO.
 */
import type { ModelEntry } from '../core/types.ts';

// Re-export the single source of truth for excluded orgs (shared with the
// cost-estimator registry) so the CI guard and any future code agree.
export { EXCLUDED_PROVIDER_IDS, EXCLUDED_PROVIDER_ALIASES } from '../../cost-estimator/registry/providers.ts';

export const MODELS: readonly ModelEntry[] = [
  // ---- Most values-aligned: self-hostable open weights (EU / Canada) ----
  {
    id: 'mistral-large-3',
    displayName: 'Mistral Large 3',
    developer: 'Mistral AI',
    jurisdiction: 'France (EU)',
    tier: 'frontier',
    kind: 'open-weight-self-hostable',
    licenseSpdx: 'Apache-2.0',
    selfHostable: true,
    contextWindow: 256_000, // confirmed via mistral.ai/news/mistral-3
    costPerMTok: { input: 0.5, output: 1.5 }, // La Plateforme (mistral.ai/pricing) — confirm on sign-off
    codingBenchmark: { name: 'SWE-bench Verified', score: null, sourceUrl: 'https://mistral.ai/news/mistral-3/', vendorReported: true }, // score TODO: confirm
    caution: { level: 'none', jurisdiction: null, reason: null, mitigation: null },
    sourceUrl: 'https://mistral.ai/news/mistral-3/',
    lastVerified: '2026-06-18',
  },
  {
    id: 'cohere-command-a-plus',
    displayName: 'Cohere Command A+',
    developer: 'Cohere',
    jurisdiction: 'Canada',
    tier: 'both',
    kind: 'open-weight-self-hostable',
    licenseSpdx: 'Apache-2.0',
    selfHostable: true,
    contextWindow: 128_000, // confirmed via cohere.com/blog/command-a-plus
    costPerMTok: { input: null, output: null }, // no public per-token price (quote-only, cohere.com/pricing) — self-host the Apache-2.0 weights instead
    codingBenchmark: { name: 'SWE-bench Verified', score: null, sourceUrl: 'https://cohere.com/blog/command-a-plus', vendorReported: true }, // score TODO: confirm
    caution: {
      level: 'advisory',
      jurisdiction: 'Canada',
      reason: 'Hosted API runs under Canadian jurisdiction; a US endpoint is optionally available.',
      mitigation: 'Self-host the Apache-2.0 weights (≈2×H100) for zero third-party jurisdiction.',
    },
    sourceUrl: 'https://cohere.com/blog/command-a-plus',
    lastVerified: '2026-06-18',
  },
  // ---- Execution tier: self-hostable open weights ----
  {
    id: 'qwen3-coder-next',
    displayName: 'Qwen3-Coder-Next',
    developer: 'Alibaba (Qwen)',
    jurisdiction: 'China (origin)',
    tier: 'execution',
    kind: 'open-weight-self-hostable',
    licenseSpdx: 'Apache-2.0',
    selfHostable: true,
    contextWindow: 256_000, // native; extendable to ~1M. Confirmed via QwenLM/Qwen3-Coder + VentureBeat
    costPerMTok: null, // self-hosted compute
    codingBenchmark: { name: 'SWE-bench Verified', score: 70.6, sourceUrl: 'https://github.com/QwenLM/Qwen3-Coder', vendorReported: true }, // confirmed (VentureBeat / winbuzzer)
    caution: {
      level: 'advisory',
      jurisdiction: 'China (origin)',
      reason: 'China-origin weights; a hosted Qwen API would run under China jurisdiction.',
      mitigation: 'Self-host the Apache-2.0 weights — no prompt touches a third-party endpoint.',
    },
    sourceUrl: 'https://github.com/QwenLM/Qwen3-Coder',
    lastVerified: '2026-06-18',
  },
  {
    id: 'gemma-4',
    displayName: 'Gemma 4',
    developer: 'Google',
    jurisdiction: 'US (origin)',
    tier: 'execution',
    kind: 'open-weight-self-hostable',
    licenseSpdx: 'Apache-2.0',
    selfHostable: true,
    contextWindow: 256_000, // confirmed via blog.google Gemma 4 / ai.google.dev model card
    costPerMTok: null, // self-hosted compute
    codingBenchmark: { name: 'SWE-bench Verified', score: null, sourceUrl: 'https://ai.google.dev/gemma/docs/core/model_card_4', vendorReported: true }, // score TODO: confirm
    caution: {
      level: 'advisory',
      jurisdiction: 'US (origin)',
      reason: 'US-origin open weights — distinct from the hosted Gemini API.',
      mitigation: 'Self-hosting is free of the Gemini API’s CLOUD Act exposure.',
    },
    sourceUrl: 'https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/',
    lastVerified: '2026-06-18',
  },
  // ---- Frontier, open weights but China-hosted default API ----
  {
    id: 'deepseek-v4-pro',
    displayName: 'DeepSeek V4-Pro',
    developer: 'DeepSeek',
    jurisdiction: 'China',
    tier: 'frontier',
    kind: 'open-weight-self-hostable',
    licenseSpdx: 'MIT',
    selfHostable: true,
    contextWindow: 1_000_000, // confirmed via huggingface.co/deepseek-ai/DeepSeek-V4-Pro
    costPerMTok: { input: 1.74, output: 3.48 }, // standard list (api-docs.deepseek.com/quick_start/pricing); a recurring 75%-off promo drops it to $0.435/$0.87
    codingBenchmark: { name: 'SWE-bench Verified', score: null, sourceUrl: 'https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro', vendorReported: true }, // score TODO: confirm
    caution: {
      level: 'warning',
      jurisdiction: 'China',
      reason: 'The hosted DeepSeek API processes data under China jurisdiction; the 2017 National Intelligence Law permits state access.',
      mitigation: 'Self-host the MIT weights to remove jurisdictional exposure.',
    },
    sourceUrl: 'https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro',
    lastVerified: '2026-06-18',
  },
  // ---- Approved-but-danger-zone: US-hosted proprietary APIs ----
  {
    id: 'claude-opus-4-8',
    displayName: 'Claude Opus 4.8',
    developer: 'Anthropic',
    jurisdiction: 'United States',
    tier: 'frontier',
    kind: 'frontier-hosted-api',
    licenseSpdx: null, // proprietary
    selfHostable: false,
    contextWindow: 1_000_000, // confirmed via platform.claude.com models overview
    costPerMTok: { input: 5, output: 25 }, // confirmed via platform.claude.com pricing
    codingBenchmark: { name: 'SWE-bench Verified', score: null, sourceUrl: 'https://platform.claude.com/docs/en/about-claude/models/overview', vendorReported: true }, // score TODO: confirm
    caution: {
      level: 'warning',
      jurisdiction: 'United States',
      reason: 'Processed under US jurisdiction (CLOUD Act / FISA 702 / export controls). On 2026-06-12 a US export-control directive forced Anthropic to suspend Fable 5 and Mythos 5 for all users — a live demonstration that US-hosted frontier APIs can be compelled or cut off.',
      mitigation: 'Prefer self-hosted open weights or an EU/Canada endpoint. (Opus 4.8 itself was unaffected by the directive.)',
    },
    sourceUrl: 'https://www.anthropic.com/news/fable-mythos-access',
    lastVerified: '2026-06-18',
  },
  {
    id: 'claude-haiku-4-5',
    displayName: 'Claude Haiku 4.5',
    developer: 'Anthropic',
    jurisdiction: 'United States',
    tier: 'execution',
    kind: 'frontier-hosted-api',
    licenseSpdx: null, // proprietary
    selfHostable: false,
    contextWindow: 200_000, // confirmed via platform.claude.com models overview
    costPerMTok: { input: 1, output: 5 }, // confirmed via platform.claude.com pricing
    codingBenchmark: { name: 'SWE-bench Verified', score: null, sourceUrl: 'https://platform.claude.com/docs/en/about-claude/models/overview', vendorReported: true }, // score TODO: confirm
    caution: {
      level: 'warning',
      jurisdiction: 'United States',
      reason: 'Processed under US jurisdiction (CLOUD Act / FISA 702 / export controls).',
      mitigation: 'Prefer self-hosted open weights or an EU/Canada endpoint for sovereignty-sensitive work.',
    },
    sourceUrl: 'https://platform.claude.com/docs/en/about-claude/models/overview',
    lastVerified: '2026-06-18',
  },
  {
    id: 'gemini-3-1-pro',
    displayName: 'Gemini 3.1 Pro',
    developer: 'Google',
    jurisdiction: 'United States',
    tier: 'frontier',
    kind: 'frontier-hosted-api',
    licenseSpdx: null, // proprietary
    selfHostable: false,
    contextWindow: 1_000_000, // confirmed via ai.google.dev Gemini models
    costPerMTok: { input: 2, output: 12 }, // ≤200K-token prompts (ai.google.dev/gemini-api/docs/pricing); prompts >200K bill $4/$18
    codingBenchmark: { name: 'SWE-bench Verified', score: null, sourceUrl: 'https://ai.google.dev/gemini-api/docs/models', vendorReported: true }, // score TODO: confirm
    caution: {
      level: 'warning',
      jurisdiction: 'United States',
      reason: 'Processed under US jurisdiction (CLOUD Act). Permitted (Google is not an excluded org) but flagged.',
      mitigation: 'For sovereignty, prefer self-hosted Gemma 4 (Apache-2.0) or an EU/Canada open-weight model.',
    },
    sourceUrl: 'https://ai.google.dev/gemini-api/docs/models',
    lastVerified: '2026-06-18',
  },
  // ---- Runtime / harness / privacy service (NOT models) ----
  {
    id: 'ollama',
    displayName: 'Ollama',
    developer: 'Ollama',
    jurisdiction: 'Self-hosted (local)',
    tier: 'runtime',
    kind: 'local-runtime',
    licenseSpdx: 'MIT',
    selfHostable: true,
    contextWindow: null, // n/a — depends on the model it runs
    costPerMTok: null, // local compute
    codingBenchmark: null,
    caution: { level: 'none', jurisdiction: null, reason: null, mitigation: null },
    sourceUrl: 'https://github.com/ollama/ollama',
    lastVerified: null,
  },
  {
    id: 'anythingllm',
    displayName: 'AnythingLLM',
    developer: 'Mintplex Labs',
    jurisdiction: 'Self-hosted (BYO model/keys)',
    tier: 'harness',
    kind: 'orchestration',
    licenseSpdx: 'MIT',
    selfHostable: true,
    contextWindow: null, // n/a — depends on the model it orchestrates
    costPerMTok: null,
    codingBenchmark: null,
    caution: { level: 'none', jurisdiction: null, reason: null, mitigation: null },
    sourceUrl: 'https://github.com/Mintplex-Labs/anything-llm',
    lastVerified: null,
  },
  {
    id: 'maple-ai',
    displayName: 'Maple AI',
    developer: 'OpenSecret',
    jurisdiction: 'United States',
    tier: 'both',
    kind: 'confidential-service',
    licenseSpdx: null, // open enclave code; not a single SPDX id
    selfHostable: false,
    contextWindow: null, // depends on the served open model
    costPerMTok: { input: null, output: null }, // subscription; per-model pricing TODO: confirm
    codingBenchmark: null,
    caution: {
      level: 'advisory',
      jurisdiction: 'United States',
      reason: 'OpenSecret is US-based.',
      mitigation: 'Confidential computing (AWS Nitro Enclaves + signed remote attestation), end-to-end encryption, and zero data retention substantially mitigate jurisdictional exposure. Serves open models only — exclude any OpenAI "GPT-OSS" option.',
    },
    sourceUrl: 'https://blog.opensecret.cloud/maple-ai-private-encrypted-chat/',
    lastVerified: null,
  },
] as const;

export function getModel(id: string): ModelEntry | undefined {
  return MODELS.find((m) => m.id === id);
}
