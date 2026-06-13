import TOML from '@iarna/toml';
import type { DependencyRef } from '../../types.ts';
import type { ManifestParseResult } from './js.ts';

/** Extract the distribution name from a PEP 508 requirement string. */
export function pep508Name(spec: string): string | null {
  const trimmed = spec.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) return null;
  // Strip environment markers and URLs.
  const beforeSemi = trimmed.split(';')[0]!;
  const beforeAt = beforeSemi.split('@')[0]!;
  const m = beforeAt.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)/);
  return m ? m[1]! : null;
}

export function parsePyprojectToml(content: string, file: string): ManifestParseResult {
  const deps: DependencyRef[] = [];
  const warnings: string[] = [];
  let t: Record<string, unknown>;
  try {
    t = TOML.parse(content) as Record<string, unknown>;
  } catch (err) {
    return { deps, warnings: [`${file}: invalid TOML (${(err as Error).message})`] };
  }

  const push = (name: string | null, depType: string) => {
    if (name) deps.push({ name, ecosystem: 'py', source_file: file, dep_type: depType });
  };

  // PEP 621: [project] dependencies = ["foo>=1", ...]
  const project = t.project as Record<string, unknown> | undefined;
  if (Array.isArray(project?.dependencies)) {
    for (const d of project.dependencies as unknown[]) push(pep508Name(String(d)), 'project.dependencies');
  }
  const optional = project?.['optional-dependencies'] as Record<string, unknown[]> | undefined;
  if (optional) {
    for (const [group, list] of Object.entries(optional)) {
      if (Array.isArray(list)) for (const d of list) push(pep508Name(String(d)), `optional.${group}`);
    }
  }

  // Poetry: [tool.poetry.dependencies] = { foo = "^1" } and groups
  const tool = t.tool as Record<string, unknown> | undefined;
  const poetry = tool?.poetry as Record<string, unknown> | undefined;
  const collectTable = (obj: unknown, depType: string) => {
    if (!obj || typeof obj !== 'object') return;
    for (const name of Object.keys(obj as Record<string, unknown>)) {
      if (name.toLowerCase() === 'python') continue;
      push(name, depType);
    }
  };
  if (poetry?.dependencies) collectTable(poetry.dependencies, 'poetry.dependencies');
  const groups = poetry?.group as Record<string, Record<string, unknown>> | undefined;
  if (groups) {
    for (const [g, val] of Object.entries(groups)) collectTable(val.dependencies, `poetry.group.${g}`);
  }

  // uv dev-dependencies: [tool.uv] dev-dependencies = [...]
  const uv = tool?.uv as Record<string, unknown> | undefined;
  if (Array.isArray(uv?.['dev-dependencies'])) {
    for (const d of uv['dev-dependencies'] as unknown[]) push(pep508Name(String(d)), 'uv.dev-dependencies');
  }

  return { deps, warnings };
}

export function parseRequirementsTxt(content: string, file: string): ManifestParseResult {
  const deps: DependencyRef[] = [];
  const warnings: string[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('-')) continue;
    const name = pep508Name(line);
    if (name) deps.push({ name, ecosystem: 'py', source_file: file, dep_type: 'requirements' });
  }
  return { deps, warnings };
}
