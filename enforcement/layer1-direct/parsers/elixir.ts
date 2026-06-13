import type { DependencyRef } from '../../types.ts';
import type { ManifestParseResult } from './js.ts';

/**
 * mix.exs is Elixir source, not a declarative manifest. We tokenize the
 * standard `defp deps do [ ... ] end` form. Anything outside that shape is
 * surfaced as an `unparseable_dependency_block` warning — never silently
 * skipped (Part 4 honesty flag).
 */
export function parseMixExs(content: string, file: string): ManifestParseResult {
  const deps: DependencyRef[] = [];
  const warnings: string[] = [];

  const depsFn = content.match(/defp?\s+deps\s+do(.*?)\bend\b/s);
  if (!depsFn) {
    warnings.push(`${file}: no standard "defp deps do ... end" block found (unparseable_dependency_block)`);
    return { deps, warnings };
  }
  const block = depsFn[1]!;

  // Standard tuple form: {:dep_name, "~> 1.0"} or {:dep_name, github: "..."}
  const tupleRe = /\{\s*:([a-z][a-z0-9_]*)\s*,/g;
  let m: RegExpExecArray | null;
  while ((m = tupleRe.exec(block)) !== null) {
    deps.push({ name: m[1]!, ecosystem: 'elixir', source_file: file, dep_type: 'deps' });
  }

  // Detect interpolation / function calls inside the deps list we can't resolve.
  if (/#\{|Enum\.|\bdeps\(\)/.test(block)) {
    warnings.push(`${file}: deps block contains dynamic constructs; some entries may be missed (unparseable_dependency_block)`);
  }

  return { deps, warnings };
}
