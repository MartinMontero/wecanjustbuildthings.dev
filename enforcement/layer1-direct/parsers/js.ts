import { InputFailure, firstLine, requireMapping } from '../../input-errors.ts';
import type { DependencyRef } from '../../types.ts';

/**
 * A parser that cannot read its input throws an InputFailure (fail closed); it
 * never returns empty deps for a file it could not parse. `warnings` is only for
 * a file that parsed but holds entries the parser cannot resolve statically.
 */
export interface ManifestParseResult {
  deps: DependencyRef[];
  warnings: string[];
}

const FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

export function parsePackageJson(content: string, file: string): ManifestParseResult {
  const deps: DependencyRef[] = [];
  const warnings: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new InputFailure('unparseable_manifest', file, `could not parse as JSON: ${firstLine(err)}`);
  }
  const json = requireMapping(parsed, 'unparseable_manifest', file, 'JSON');
  for (const field of FIELDS) {
    const block = json[field];
    if (block && typeof block === 'object') {
      for (const [name, version] of Object.entries(block as Record<string, unknown>)) {
        deps.push({ name, version: String(version), ecosystem: 'js', source_file: file, dep_type: field });
      }
    }
  }
  return { deps, warnings };
}
