import { parse as parseYaml } from 'yaml';
import type { DependencyRef } from '../../types.ts';
import type { ManifestParseResult } from './js.ts';

export function parsePubspecYaml(content: string, file: string): ManifestParseResult {
  const deps: DependencyRef[] = [];
  const warnings: string[] = [];
  let doc: Record<string, unknown>;
  try {
    doc = (parseYaml(content) ?? {}) as Record<string, unknown>;
  } catch (err) {
    return { deps, warnings: [`${file}: invalid YAML (${(err as Error).message})`] };
  }

  const collect = (obj: unknown, depType: string) => {
    if (!obj || typeof obj !== 'object') return;
    for (const [name, spec] of Object.entries(obj as Record<string, unknown>)) {
      if (name === 'flutter') continue;
      const version = typeof spec === 'string' ? spec : undefined;
      deps.push({ name, version, ecosystem: 'dart', source_file: file, dep_type: depType });
    }
  };

  collect(doc.dependencies, 'dependencies');
  collect(doc.dev_dependencies, 'dev_dependencies');
  return { deps, warnings };
}
