import type { DependencyRef } from '../../types.ts';
import type { ManifestParseResult } from './js.ts';

/** Parse `gem "name", ...` lines from a Gemfile. */
export function parseGemfile(content: string, file: string): ManifestParseResult {
  const deps: DependencyRef[] = [];
  const warnings: string[] = [];
  const gemRe = /^\s*gem\s+['"]([^'"]+)['"]/;
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '');
    const m = line.match(gemRe);
    if (m) deps.push({ name: m[1]!, ecosystem: 'ruby', source_file: file, dep_type: 'gem' });
  }
  return { deps, warnings };
}
