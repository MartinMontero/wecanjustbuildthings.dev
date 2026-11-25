import { InputFailure } from '../../input-errors.ts';
import type { DependencyRef } from '../../types.ts';
import type { ManifestParseResult } from './js.ts';

/**
 * mix.exs is Elixir source, not a declarative manifest. We tokenize the
 * standard deps function in all three common spellings: `defp deps do [ ... ] end`,
 * `defp deps() do [ ... ] end`, and the keyword form `defp deps, do: [ ... ]`
 * (an unclosed keyword list fails closed as unparseable_manifest). Anything outside that shape is
 * surfaced as an `unparseable_dependency_block` warning — never silently
 * skipped (Part 4 honesty flag).
 */
/**
 * The text between the `[` at `open` and its matching `]`, skipping strings,
 * charlists and `#` comments. Undefined when the list is never closed.
 */
function bracketList(content: string, open: number): string | undefined {
  let depth = 0;
  for (let i = open; i < content.length; i += 1) {
    const ch = content[i]!;
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < content.length && content[j] !== ch) j += content[j] === '\\' ? 2 : 1;
      i = j;
    } else if (ch === '#') {
      while (i < content.length && content[i] !== '\n') i += 1;
    } else if (ch === '[') {
      depth += 1;
    } else if (ch === ']') {
      depth -= 1;
      if (depth === 0) return content.slice(open + 1, i);
    }
  }
  return undefined;
}

export function parseMixExs(content: string, file: string): ManifestParseResult {
  const deps: DependencyRef[] = [];
  const warnings: string[] = [];

  // `defp deps do ... end` or `defp deps() do ... end`
  let block = content.match(/defp?\s+deps(?:\s*\(\s*\))?\s+do\b(.*?)\bend\b/s)?.[1];
  if (block === undefined) {
    // Keyword one-liner, possibly wrapped: `defp deps, do: [ ... ]`
    const kw = /defp?\s+deps(?:\s*\(\s*\))?\s*,\s*do:\s*\[/.exec(content);
    if (kw) {
      block = bracketList(content, kw.index + kw[0].length - 1);
      if (block === undefined) {
        throw new InputFailure('unparseable_manifest', file, 'the "defp deps, do: [" list is never closed');
      }
    }
  }
  if (block === undefined) {
    warnings.push(`${file}: no standard "defp deps do ... end" block found (unparseable_dependency_block)`);
    return { deps, warnings };
  }

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
