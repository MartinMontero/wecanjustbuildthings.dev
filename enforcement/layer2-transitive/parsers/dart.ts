import { parse as parseYaml } from 'yaml';
import type { LockGraph } from '../../types.ts';
import { emptyGraph, nodeKey } from '../util.ts';

/**
 * pubspec.lock carries no edge information — Layer 2 can confirm an excluded
 * package is present in the closure but cannot reconstruct the chain
 * (closure-only, edges_known = false; Part 4 honesty flag).
 */
export function parsePubspecLock(content: string, file: string): LockGraph {
  const graph = emptyGraph('dart', file);
  graph.edges_known = false;
  let doc: { packages?: Record<string, { version?: string; dependency?: string }> };
  try {
    doc = (parseYaml(content) ?? {}) as typeof doc;
  } catch (err) {
    graph.warnings.push(`${file}: invalid YAML (${(err as Error).message})`);
    return graph;
  }
  for (const [name, meta] of Object.entries(doc.packages ?? {})) {
    const version = meta.version;
    graph.nodes.set(nodeKey(name, version), { name, version });
    if (meta.dependency && meta.dependency.startsWith('direct')) graph.roots.push(nodeKey(name, version));
  }
  return graph;
}
