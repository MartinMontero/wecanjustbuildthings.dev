import type { DependencyRef, ExcludedOrg, PolicyMatch } from './types.ts';

/** Loose normalization: case-insensitive, and -_/. collapse to a single -.
 *  Matches how PyPI and crates.io canonicalize names (so `Async_OpenAI`
 *  === `async-openai`). */
function loose(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}

/** Case-insensitive exact membership (npm/rubygems/hex/pub names). */
function includesCI(list: string[], value: string): boolean {
  const v = value.toLowerCase();
  return list.some((x) => x.toLowerCase() === v);
}

/** Loose membership (PyPI / crates name canonicalization). */
function includesLoose(list: string[], value: string): boolean {
  const v = loose(value);
  return list.some((x) => loose(x) === v);
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
 * All comparisons are case-insensitive because every registry treats package
 * names case-insensitively — exact matching would be a trivially-bypassable
 * false negative in a security gate.
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
        if (scope && includesCI(org.npm_scopes, scope)) {
          out.push({ org_key: org.key, signal: 'npm_scope', matched_value: scope });
        }
        if (includesCI(org.npm_packages, name)) {
          out.push({ org_key: org.key, signal: 'npm_package', matched_value: name });
        }
        break;
      }
      case 'py': {
        if (includesLoose(org.pypi_packages, name)) {
          out.push({ org_key: org.key, signal: 'pypi_package', matched_value: name });
        }
        break;
      }
      case 'rust': {
        if (includesLoose(org.crates_packages, name)) {
          out.push({ org_key: org.key, signal: 'crates_package', matched_value: name });
        }
        break;
      }
      case 'go': {
        const lname = name.toLowerCase();
        const hit = org.go_module_prefixes.find((pre) => {
          const lpre = pre.toLowerCase();
          return lname === lpre.replace(/\/$/, '') || lname.startsWith(lpre);
        });
        if (hit) out.push({ org_key: org.key, signal: 'go_module_prefix', matched_value: hit });
        break;
      }
      case 'ruby': {
        if (includesCI(org.rubygems_packages, name)) {
          out.push({ org_key: org.key, signal: 'rubygems_package', matched_value: name });
        }
        break;
      }
      case 'elixir': {
        if (includesCI(org.hex_packages, name)) {
          out.push({ org_key: org.key, signal: 'hex_package', matched_value: name });
        }
        break;
      }
      case 'dart': {
        if (includesCI(org.pub_packages, name)) {
          out.push({ org_key: org.key, signal: 'pub_package', matched_value: name });
        }
        break;
      }
      case 'kotlin': {
        const group = (dep.scope ?? (name.includes(':') ? name.split(':')[0] : name)).toLowerCase();
        if (group && org.maven_groups.some((g) => group === g.toLowerCase() || group.startsWith(`${g.toLowerCase()}.`))) {
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
