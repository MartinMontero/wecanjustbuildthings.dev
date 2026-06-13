import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { ExcludedOrg, ProviderSignals } from './types.ts';

const here = dirname(fileURLToPath(import.meta.url));

function arr(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}

export const DEFAULT_ORGS_PATH = join(here, 'excluded-organizations.yaml');
export const DEFAULT_SIGNALS_PATH = join(here, 'excluded-provider-signals.yaml');

export function loadExcludedOrgs(path: string = DEFAULT_ORGS_PATH): ExcludedOrg[] {
  const raw = parseYaml(readFileSync(path, 'utf8')) as Record<string, Record<string, unknown>>;
  return Object.entries(raw).map(([key, v]) => ({
    key,
    display_name: String(v.display_name ?? key),
    llm_provider: Boolean(v.llm_provider),
    github_orgs: arr(v.github_orgs),
    npm_scopes: arr(v.npm_scopes),
    npm_packages: arr(v.npm_packages),
    pypi_maintainers: arr(v.pypi_maintainers),
    pypi_packages: arr(v.pypi_packages),
    crates_publishers: arr(v.crates_publishers),
    crates_packages: arr(v.crates_packages),
    hex_publishers: arr(v.hex_publishers),
    hex_packages: arr(v.hex_packages),
    rubygems_authors: arr(v.rubygems_authors),
    rubygems_packages: arr(v.rubygems_packages),
    maven_groups: arr(v.maven_groups),
    pub_publishers: arr(v.pub_publishers),
    pub_packages: arr(v.pub_packages),
    go_module_prefixes: arr(v.go_module_prefixes),
  }));
}

export function loadProviderSignals(path: string = DEFAULT_SIGNALS_PATH): ProviderSignals[] {
  const raw = parseYaml(readFileSync(path, 'utf8')) as Record<string, Record<string, unknown>>;
  return Object.entries(raw).map(([key, v]) => ({
    key,
    endpoints: arr(v.endpoints),
    imports: (v.imports ?? {}) as Partial<Record<string, string[]>>,
    config_keys: arr(v.config_keys),
  }));
}

/** Every org key known to the policy — used to validate recipe must_not_be_one_of. */
export function knownOrgKeys(orgs: ExcludedOrg[]): Set<string> {
  return new Set(orgs.map((o) => o.key));
}
