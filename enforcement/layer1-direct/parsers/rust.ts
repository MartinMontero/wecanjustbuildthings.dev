import TOML from '@iarna/toml';
import type { DependencyRef } from '../../types.ts';
import type { ManifestParseResult } from './js.ts';

export function parseCargoToml(content: string, file: string): ManifestParseResult {
  const deps: DependencyRef[] = [];
  const warnings: string[] = [];
  let t: Record<string, unknown>;
  try {
    t = TOML.parse(content) as Record<string, unknown>;
  } catch (err) {
    return { deps, warnings: [`${file}: invalid TOML (${(err as Error).message})`] };
  }

  const collect = (obj: unknown, depType: string) => {
    if (!obj || typeof obj !== 'object') return;
    for (const [name, spec] of Object.entries(obj as Record<string, unknown>)) {
      let version: string | undefined;
      if (typeof spec === 'string') version = spec;
      else if (spec && typeof spec === 'object') version = (spec as Record<string, unknown>).version as string | undefined;
      deps.push({ name, version, ecosystem: 'rust', source_file: file, dep_type: depType });
    }
  };

  collect(t.dependencies, 'dependencies');
  collect(t['dev-dependencies'], 'dev-dependencies');
  collect(t['build-dependencies'], 'build-dependencies');

  const workspace = t.workspace as Record<string, unknown> | undefined;
  if (workspace?.dependencies) collect(workspace.dependencies, 'workspace.dependencies');

  const target = t.target as Record<string, Record<string, unknown>> | undefined;
  if (target) {
    for (const [cfg, val] of Object.entries(target)) {
      collect(val.dependencies, `target.${cfg}.dependencies`);
      collect(val['dev-dependencies'], `target.${cfg}.dev-dependencies`);
    }
  }

  return { deps, warnings };
}
