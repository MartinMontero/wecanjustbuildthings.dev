import type { DependencyRef, ExcludedOrg, PolicyMatch } from './types.ts';

/** PyPI normalizes names: case-insensitive, runs of -_. collapse to a single -. */
function normalizePy(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}

function npmScopeOf(name: string): string | undefined {
  if (name.startsWith('@') && name.includes('/')) {
    return name.slice(0, name.indexOf('/'));
  }
  return undefined;
}

/**
 * Decide whether a single declared/resolved dependency matches the exclusion
 * policy, using only signals derivable from the package coordinate (no network).
 *
 * Network-based owner resolution (npm `maintainers`, crates `links.publisher`,
 * …) is an optional enrichment performed by the indexing pipeline; the engine
 * itself stays deterministic and offline so CI and the test suite are stable.
 */
export function matchDependency(dep: DependencyRef, orgs: ExcludedOrg[]): PolicyMatch[] {
  const out: PolicyMatch[] = [];
  const { name } = dep;

  for (const org of orgs) {
    switch (dep.ecosystem) {
      case 'js': {
        const scope = dep.scope ?? npmScopeOf(name);
        if (scope && org.npm_scopes.includes(scope)) {
          out.push({ org_key: org.key, signal: 'npm_scope', matched_value: scope });
        }
        if (org.npm_packages.includes(name)) {
          out.push({ org_key: org.key, signal: 'npm_package', matched_value: name });
        }
        break;
      }
      case 'py': {
        const n = normalizePy(name);
        if (org.pypi_packages.some((p) => normalizePy(p) === n)) {
          out.push({ org_key: org.key, signal: 'pypi_package', matched_value: name });
        }
        break;
      }
      case 'rust': {
        if (org.crates_packages.includes(name)) {
          out.push({ org_key: org.key, signal: 'crates_package', matched_value: name });
        }
        break;
      }
      case 'go': {
        const hit = org.go_module_prefixes.find(
          (pre) => name === pre.replace(/\/$/, '') || name.startsWith(pre),
        );
        if (hit) {
          out.push({ org_key: org.key, signal: 'go_module_prefix', matched_value: hit });
        }
        break;
      }
      case 'ruby': {
        if (org.rubygems_packages.includes(name)) {
          out.push({ org_key: org.key, signal: 'rubygems_package', matched_value: name });
        }
        break;
      }
      case 'elixir': {
        if (org.hex_packages.includes(name)) {
          out.push({ org_key: org.key, signal: 'hex_package', matched_value: name });
        }
        break;
      }
      case 'dart': {
        if (org.pub_packages.includes(name)) {
          out.push({ org_key: org.key, signal: 'pub_package', matched_value: name });
        }
        break;
      }
      case 'kotlin': {
        const group = dep.scope ?? (name.includes(':') ? name.split(':')[0] : name);
        if (group && org.maven_groups.some((g) => group === g || group.startsWith(`${g}.`))) {
          out.push({ org_key: org.key, signal: 'maven_group', matched_value: group });
        }
        break;
      }
      default:
        break;
    }
  }

  return out;
}

/** Convenience: does this dependency violate the policy at all? */
export function isExcluded(dep: DependencyRef, orgs: ExcludedOrg[]): boolean {
  return matchDependency(dep, orgs).length > 0;
}
