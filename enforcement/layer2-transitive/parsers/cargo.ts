import TOML from '@iarna/toml';
import type { LockGraph } from '../../types.ts';
import { emptyGraph, nodeKey } from '../util.ts';

interface CargoPkg {
  name: string;
  version: string;
  source?: string;
  dependencies?: string[];
}

/** Cargo.lock (version 3/4). Roots are workspace members (packages with no `source`). */
export function parseCargoLock(content: string, file: string): LockGraph {
  const graph = emptyGraph('rust', file);
  let t: { package?: CargoPkg[] };
  try {
    t = TOML.parse(content) as { package?: CargoPkg[] };
  } catch (err) {
    graph.warnings.push(`${file}: invalid TOML (${(err as Error).message})`);
    return graph;
  }
  const pkgs = t.package ?? [];
  const nameVersions = new Map<string, string[]>();
  for (const p of pkgs) {
    graph.nodes.set(nodeKey(p.name, p.version), { name: p.name, version: p.version });
    const list = nameVersions.get(p.name) ?? [];
    list.push(p.version);
    nameVersions.set(p.name, list);
    if (!p.source) graph.roots.push(nodeKey(p.name, p.version));
  }
  for (const p of pkgs) {
    const targets = (p.dependencies ?? []).map((dep) => {
      const [dn, dv] = dep.split(' ');
      if (dv) return nodeKey(dn!, dv);
      const versions = nameVersions.get(dn!);
      return versions && versions.length === 1 ? nodeKey(dn!, versions[0]) : dn!;
    });
    graph.edges.set(nodeKey(p.name, p.version), targets);
  }
  return graph;
}
