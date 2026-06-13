import type { LockGraph } from '../../types.ts';
import { emptyGraph, nodeKey } from '../util.ts';

/**
 * go.mod is module-flattened: after `go mod tidy` it lists every module in the
 * build (direct + `// indirect`), so the closure is complete — but it carries no
 * edges. Closure-only (edges_known = false). Use `go mod graph` output with
 * `parseGoModGraph` when chains are required.
 */
export function parseGoModClosure(content: string, file: string): LockGraph {
  const graph = emptyGraph('go', file);
  graph.edges_known = false;
  let inBlock = false;
  for (const raw of content.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (trimmed.startsWith('require (')) {
      inBlock = true;
      continue;
    }
    if (inBlock && trimmed === ')') {
      inBlock = false;
      continue;
    }
    const target = inBlock ? trimmed : trimmed.startsWith('require ') ? trimmed.slice('require '.length) : '';
    if (!target) continue;
    const m = target.match(/^([^\s]+)\s+([^\s]+)/);
    if (m) graph.nodes.set(nodeKey(m[1]!, m[2]!), { name: m[1]!, version: m[2]! });
  }
  return graph;
}

/** Build a graph with edges from `go mod graph` output ("parent@v child@v" lines). */
export function parseGoModGraph(content: string, file: string): LockGraph {
  const graph = emptyGraph('go', file);
  const split = (token: string) => {
    const at = token.lastIndexOf('@');
    return at > 0 ? { name: token.slice(0, at), version: token.slice(at + 1) } : { name: token, version: undefined };
  };
  const seen = new Set<string>();
  for (const raw of content.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const [parent, child] = trimmed.split(/\s+/);
    if (!parent || !child) continue;
    const p = split(parent);
    const c = split(child);
    const pk = nodeKey(p.name, p.version);
    const ck = nodeKey(c.name, c.version);
    graph.nodes.set(pk, p);
    graph.nodes.set(ck, c);
    const list = graph.edges.get(pk) ?? [];
    list.push(ck);
    graph.edges.set(pk, list);
    if (!seen.has(parent)) {
      seen.add(parent);
    }
  }
  // The main module is the parent that never appears as a child.
  const children = new Set<string>();
  for (const targets of graph.edges.values()) for (const t of targets) children.add(t);
  graph.roots = [...graph.nodes.keys()].filter((k) => !children.has(k));
  return graph;
}
