import type { DependencyRef } from '../../types.ts';

export interface ManifestParseResult {
  deps: DependencyRef[];
  warnings: string[];
}

const FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

export function parsePackageJson(content: string, file: string): ManifestParseResult {
  const deps: DependencyRef[] = [];
  const warnings: string[] = [];
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(content) as Record<string, unknown>;
  } catch (err) {
    return { deps, warnings: [`${file}: invalid JSON (${(err as Error).message})`] };
  }
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
