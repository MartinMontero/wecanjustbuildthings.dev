import type { DocEntry } from '../frontmatter.ts';
import type { ExcludedOrg, ProviderSignals, RecipeFinding } from '../types.ts';

export interface RecipeValidationContext {
  catalog: DocEntry[];
  orgs: ExcludedOrg[];
  signals: ProviderSignals[];
}

interface Guard {
  must_be_one_of?: unknown[];
  must_not_be_one_of?: unknown[];
}
interface Step {
  method?: string;
  blocked_hosts?: unknown[];
}

/**
 * Validate a provider-lockdown recipe against the contract. A recipe FORBIDS the
 * excluded providers (it is enforcement, never an exemption):
 *  - structural completeness;
 *  - target_entry_slug resolves to a catalog entry marked provider_agnostic;
 *  - every excluded LLM provider is named in must_not_be_one_of (so the recipe
 *    actually closes the loophole it exists to close);
 *  - no permitted provider is itself an excluded org;
 *  - verification steps block the excluded providers' endpoints.
 */
export function validateRecipe(recipe: DocEntry, ctx: RecipeValidationContext): RecipeFinding {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fm = recipe.frontmatter;

  if (!fm.recipe_type) errors.push('missing recipe_type');

  const slug = typeof fm.target_entry_slug === 'string' ? fm.target_entry_slug : undefined;
  if (!slug) {
    errors.push('missing target_entry_slug');
  } else {
    const target = ctx.catalog.find(
      (e) => e.slug === slug || e.frontmatter.dependency_name === slug,
    );
    if (!target) {
      errors.push(`target_entry_slug "${slug}" does not match any catalog entry`);
    } else if (target.frontmatter.provider_agnostic !== true) {
      errors.push(`target entry "${slug}" is not marked provider_agnostic: true`);
    }
  }

  const guards = Array.isArray(fm.excluded_providers_unreachable_when)
    ? (fm.excluded_providers_unreachable_when as Guard[])
    : [];
  if (guards.length === 0) errors.push('excluded_providers_unreachable_when must list at least one guard');

  const mustNot = new Set<string>();
  const mustBe = new Set<string>();
  for (const g of guards) {
    for (const v of g.must_not_be_one_of ?? []) mustNot.add(String(v));
    for (const v of g.must_be_one_of ?? []) mustBe.add(String(v));
  }

  for (const v of mustBe) {
    if (mustNot.has(v)) errors.push(`provider "${v}" is in both must_be_one_of and must_not_be_one_of`);
  }

  const excludedKeys = new Set(ctx.orgs.map((o) => o.key));
  const requiredExcluded = ctx.orgs.filter((o) => o.llm_provider).map((o) => o.key);

  for (const key of requiredExcluded) {
    if (!mustNot.has(key)) {
      errors.push(`excluded LLM provider "${key}" must appear in must_not_be_one_of (otherwise the recipe does not exclude it)`);
    }
  }
  for (const v of mustBe) {
    if (excludedKeys.has(v)) errors.push(`permitted provider "${v}" is an excluded organization`);
  }

  const steps = Array.isArray(fm.verification_steps) ? (fm.verification_steps as Step[]) : [];
  if (steps.length === 0) errors.push('verification_steps must list at least one step');
  for (const s of steps) {
    if (!s.method) warnings.push('a verification step is missing a method');
  }

  const blockedHosts = new Set<string>();
  for (const s of steps) for (const h of s.blocked_hosts ?? []) blockedHosts.add(String(h));
  for (const key of requiredExcluded) {
    const endpoints = ctx.signals.find((s) => s.key === key)?.endpoints ?? [];
    if (endpoints.length > 0 && !endpoints.some((e) => blockedHosts.has(e))) {
      // A recipe that claims an excluded provider is "unreachable" but verifies
      // nothing is not a valid exception — fail it.
      errors.push(`verification steps must block a ${key} endpoint (expected one of: ${endpoints.join(', ')})`);
    }
  }

  for (const v of mustNot) {
    if (!excludedKeys.has(v)) {
      warnings.push(`must_not_be_one_of names "${v}", which is not in the exclusion policy (voluntary extra restriction — OK)`);
    }
  }

  return {
    recipe_file: recipe.file,
    status: errors.length > 0 ? 'block' : 'pass',
    errors,
    warnings,
  };
}
