import TOML from '@iarna/toml';
import type { LockGraph } from '../../types.ts';
import { emptyGraph, nodeKey } from '../util.ts';

function normalizePy(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}

/** uv.lock (version 1). Roots are the project package(s) (source virtual/editable). */
export function parseUvLock(content: string, file: string): LockGraph {
  const graph = emptyGraph('py', file);
  let t: { package?: Array<Record<string, unknown>> };
  try {
    t = TOML.parse(content) as { package?: Array<Record<string, unknown>> };
  } catch (err) {
    graph.warnings.push(`${file}: invalid TOML (${(err as Error).message})`);
    return graph;
  }
  const pkgs = t.package ?? [];
  const nameToVersion = new Map<string, string>();
  for (const p of pkgs) {
    const name = String(p.name);
    const version = p.version as string | undefined;
    graph.nodes.set(nodeKey(name, version), { name, version });
    nameToVersion.set(normalizePy(name), version ?? '');
    const source = p.source as Record<string, unknown> | undefined;
    if (source && ('virtual' in source || 'editable' in source)) graph.roots.push(nodeKey(name, version));
  }
  for (const p of pkgs) {
    const name = String(p.name);
    const version = p.version as string | undefined;
    const deps = (p.dependencies as Array<{ name?: string }>) ?? [];
    const targets = deps
      .map((d) => d.name)
      .filter((n): n is string => Boolean(n))
      .map((n) => nodeKey(n, nameToVersion.get(normalizePy(n)) || undefined));
    graph.edges.set(nodeKey(name, version), targets);
  }
  return graph;
}

/** poetry.lock (lock-version 2.x). Roots fall back to in-degree-0 nodes. */
export function parsePoetryLock(content: string, file: string): LockGraph {
  const graph = emptyGraph('py', file);
  let t: { package?: Array<Record<string, unknown>> };
  try {
    t = TOML.parse(content) as { package?: Array<Record<string, unknown>> };
  } catch (err) {
    graph.warnings.push(`${file}: invalid TOML (${(err as Error).message})`);
    return graph;
  }
  const pkgs = t.package ?? [];
  const nameToVersion = new Map<string, string>();
  for (const p of pkgs) {
    const name = String(p.name);
    const version = p.version as string | undefined;
    graph.nodes.set(nodeKey(name, version), { name, version });
    nameToVersion.set(normalizePy(name), version ?? '');
  }
  for (const p of pkgs) {
    const name = String(p.name);
    const version = p.version as string | undefined;
    const deps = (p.dependencies as Record<string, unknown>) ?? {};
    const targets = Object.keys(deps).map((dn) => nodeKey(dn, nameToVersion.get(normalizePy(dn)) || undefined));
    graph.edges.set(nodeKey(name, version), targets);
  }
  return graph;
}

/**
 * requirements.txt — only transitively walkable when it carries pip-compile
 * `# via <parent>` provenance markers. Without them, closure-only (edges_known
 * = false), per the Part 4 honesty flag.
 */
export function parseRequirementsLock(content: string, file: string): LockGraph {
  const graph = emptyGraph('py', file);
  const lines = content.split(/\r?\n/);
  const hasVia = /#\s*via/.test(content);
  graph.edges_known = hasVia;

  const nodeOf = (spec: string) => {
    const m = spec.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)\s*==\s*([^\s;]+)/) ?? spec.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)/);
    if (!m) return null;
    return { name: m[1]!, version: m[2] };
  };

  // Pass 1: create every package node. pip-compile sorts alphabetically, so a
  // `# via <parent>` marker can name a parent defined later in the file — we must
  // know all nodes before resolving edges, or forward references get dropped.
  for (const raw of lines) {
    const trimmed = raw.replace(/\r$/, '').trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const node = nodeOf(trimmed);
    if (node) graph.nodes.set(nodeKey(node.name, node.version), node);
  }

  if (!hasVia) return graph;

  const nameToKey = new Map<string, string>();
  for (const [key, node] of graph.nodes) nameToKey.set(node.name.toLowerCase(), key);

  // Pass 2: attach `# via <parent>` edges (parent → current child).
  let current: { name: string; version?: string } | null = null;
  for (const raw of lines) {
    const trimmed = raw.replace(/\r$/, '').trim();
    if (!trimmed) continue;
    if (!trimmed.startsWith('#')) {
      current = nodeOf(trimmed);
      continue;
    }
    if (!current) continue;
    const viaInline = trimmed.match(/#\s*via\s+(.+)$/);
    const parentName = viaInline ? viaInline[1]!.trim() : trimmed.replace(/^#\s*/, '').trim();
    if (!parentName || parentName.startsWith('-')) continue; // skip "# via -r requirements.in"
    const parentKey = nameToKey.get(parentName.toLowerCase());
    if (parentKey) {
      const list = graph.edges.get(parentKey) ?? [];
      list.push(nodeKey(current.name, current.version));
      graph.edges.set(parentKey, list);
    }
  }
  return graph;
}
