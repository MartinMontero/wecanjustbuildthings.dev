import { z } from 'astro/zod';

/**
 * Single source of truth for catalog/recipe frontmatter shapes.
 *
 * These are extended onto Starlight's `docsSchema` (see src/content.config.ts),
 * so EVERY field must be optional at the top level — the same collection holds
 * generic docs pages (homepage, About, …) that carry none of these fields.
 * Required-ness is enforced conditionally in `superRefine`, keyed off
 * `entry_type`, so a missing license on a `tool` entry fails `astro check`
 * while a plain page validates cleanly.
 */

export const ECOSYSTEMS = [
  'js',
  'rust',
  'py',
  'go',
  'elixir',
  'dart',
  'ruby',
  'kotlin',
  'swift',
  'php',
  'other',
] as const;

export const ENTRY_TYPES = [
  'tool',
  'framework',
  'library',
  'service',
  'protocol',
  'dataset',
  'recipe',
  'extension',
  'archetype',
  'policy',
  'pie',
  'page',
] as const;

/** Entry types that are catalog dependencies and must carry verification metadata. */
export const CATALOG_ENTRY_TYPES = ['tool', 'framework', 'library', 'service', 'protocol'] as const;

export const MAINTENANCE_STATUS = ['active', 'minimal', 'dormant', 'abandoned', 'unknown'] as const;
export const VERIFICATION_STATUS = ['verified', 'blocked', 'under_review'] as const;

/** Protocol families a tool serves. Drives the Nostr / AT Protocol / general flows. */
export const PROTOCOLS = [
  'nostr',
  'atproto',
  'lightning',
  'cashu',
  'activitypub',
  'matrix',
  'general',
] as const;

const recipeConfigSurface = z.enum(['ui_setting', 'env_var', 'config_file', 'build_flag', 'cli_flag']);

const recipeGuard = z.object({
  description: z.string().min(1),
  config_surface: recipeConfigSurface,
  setting_path: z.string().min(1).optional(),
  must_be_one_of: z.array(z.string().min(1)).default([]),
  must_not_be_one_of: z.array(z.string().min(1)).default([]),
});

const recipeVerificationStep = z.object({
  description: z.string().min(1),
  method: z.enum(['network_observation', 'config_inspection', 'manual', 'automated_test']),
  duration_minutes: z.number().int().positive().optional(),
  blocked_hosts: z.array(z.string().min(1)).default([]),
});

/**
 * The full set of fields layered onto Starlight docs frontmatter.
 * Pass this object to `docsSchema({ extend: catalogExtend })`.
 */
export const catalogFields = z.object({
  /** Discriminator. Absent ⇒ a plain docs page. */
  entry_type: z.enum(ENTRY_TYPES).optional(),

  // ---- Catalog dependency fields (required when entry_type ∈ CATALOG_ENTRY_TYPES) ----
  dependency_name: z.string().min(1).optional(),
  ecosystem: z.enum(ECOSYSTEMS).optional(),
  category: z.string().min(1).optional(),
  what_it_does: z.string().min(1).optional(),
  homepage_url: z.url().optional(),
  repo_url: z.url().optional(),
  registry_url: z.url().optional(),
  protocols: z.array(z.enum(PROTOCOLS)).default([]),

  // ---- License verification (the accountability core) ----
  license_spdx: z.string().min(1).optional(),
  license_source_url: z.url().optional(),
  license_source_commit_sha: z.string().min(7).optional(),

  // ---- Maintenance ----
  maintenance_status: z.enum(MAINTENANCE_STATUS).default('unknown'),
  last_release_at: z.string().optional(),
  /** The concrete release the license was verified at, recorded so generated
   *  starters can pin to it instead of `latest`. Optional: some entries resolve
   *  no version (e.g. source-only repos). */
  version: z.string().optional(),

  // ---- AOS adoption metadata ----
  aos_repos_using: z.number().int().nonnegative().optional(),
  aos_repos_list: z.array(z.string()).default([]),

  // ---- PIE navigation anchor ----
  pie_anchor: z.string().optional(),

  // ---- i18n provenance ----
  /** Set by scripts/translate-catalog.ts on generated es/ar copies so the flag
   *  is first-class (lets templates surface a "machine translated" advisory). */
  machine_translated: z.boolean().optional(),

  // ---- Enforcement / exception ----
  provider_agnostic: z.boolean().default(false),
  verification_status: z.enum(VERIFICATION_STATUS).default('verified'),
  verification_blocked_reason: z.string().optional(),
  /** Set when a tool is built by an excluded org but permissively licensed and
   *  not data-routing (e.g. Meta-origin React) — included with a visible advisory. */
  origin_advisory: z.string().optional(),
  verified_at: z.string().optional(),

  // ---- Recipe contract (required when entry_type === 'recipe') ----
  recipe_type: z.enum(['configuration', 'integration', 'deployment']).optional(),
  target_entry: z.string().optional(),
  target_entry_slug: z.string().optional(),
  excluded_providers_unreachable_when: z.array(recipeGuard).optional(),
  verification_steps: z.array(recipeVerificationStep).optional(),

  // ---- Goose extension contract (required when entry_type === 'extension') ----
  // The MCP trust boundary: vetted extension config lives here, in the Catalog, and is
  // surfaced to recipes only when verification_status === 'verified' (see extensions.json).
  goose_extension_type: z.enum(['builtin', 'stdio', 'sse']).optional(),
  goose_extension_command: z.string().min(1).optional(),
  goose_extension_args: z.array(z.string()).default([]),
  goose_extension_uri: z.url().optional(),
  goose_extension_timeout: z.number().int().positive().optional(),
});

/**
 * Conditional requirements. Starlight's `extend` accepts a Zod schema; we add a
 * `superRefine` so `astro check` enforces the right fields per entry type.
 */
export const catalogExtend = catalogFields.superRefine((data, ctx) => {
  const isCatalogEntry =
    data.entry_type !== undefined &&
    (CATALOG_ENTRY_TYPES as readonly string[]).includes(data.entry_type);

  if (isCatalogEntry) {
    const required: Array<[keyof typeof data, unknown]> = [
      ['dependency_name', data.dependency_name],
      ['ecosystem', data.ecosystem],
      ['category', data.category],
      ['what_it_does', data.what_it_does],
      ['license_spdx', data.license_spdx],
      ['license_source_url', data.license_source_url],
    ];
    for (const [field, value] of required) {
      if (value === undefined || value === null || value === '') {
        ctx.addIssue({
          code: "custom",
          path: [field as string],
          message: `Catalog entry (entry_type: ${data.entry_type}) requires "${String(field)}".`,
        });
      }
    }

    // A verified entry must pin a commit SHA; a blocked entry must say why.
    if (data.verification_status === 'verified' && !data.license_source_commit_sha) {
      ctx.addIssue({
        code: "custom",
        path: ['license_source_commit_sha'],
        message: 'A verified catalog entry must pin license_source_commit_sha (the commit the license was read at).',
      });
    }
    if (data.verification_status === 'blocked' && !data.verification_blocked_reason) {
      ctx.addIssue({
        code: "custom",
        path: ['verification_blocked_reason'],
        message: 'A blocked entry must document verification_blocked_reason.',
      });
    }
  }

  if (data.entry_type === 'recipe') {
    if (!data.recipe_type) {
      ctx.addIssue({ code: "custom", path: ['recipe_type'], message: 'Recipe requires recipe_type.' });
    }
    if (!data.target_entry_slug) {
      ctx.addIssue({
        code: "custom",
        path: ['target_entry_slug'],
        message: 'Recipe requires target_entry_slug (the catalog entry it configures).',
      });
    }
    if (!data.excluded_providers_unreachable_when || data.excluded_providers_unreachable_when.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ['excluded_providers_unreachable_when'],
        message: 'Recipe requires at least one excluded_providers_unreachable_when guard.',
      });
    }
    if (!data.verification_steps || data.verification_steps.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ['verification_steps'],
        message: 'Recipe requires at least one verification_step.',
      });
    }
  }

  if (data.entry_type === 'extension') {
    if (!data.goose_extension_type) {
      ctx.addIssue({ code: "custom", path: ['goose_extension_type'], message: 'Extension requires goose_extension_type.' });
    }
    if (data.goose_extension_type === 'stdio' && !data.goose_extension_command) {
      ctx.addIssue({ code: "custom", path: ['goose_extension_command'], message: 'A stdio extension requires goose_extension_command.' });
    }
    if (data.goose_extension_type === 'sse' && !data.goose_extension_uri) {
      ctx.addIssue({ code: "custom", path: ['goose_extension_uri'], message: 'An sse extension requires goose_extension_uri.' });
    }
  }
});

export type CatalogFrontmatter = z.infer<typeof catalogFields>;
