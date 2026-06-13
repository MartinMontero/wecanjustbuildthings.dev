import { matchDependency } from '../matcher.ts';
import type { ChainNode, ExcludedOrg, Layer2Finding, LockGraph } from '../types.ts';

/** Nodes nothing else depends on — used as BFS roots when the format omits them. */
function inDegreeZeroRoots(graph: LockGraph): string[] {
  const hasIncoming = new Set<string>();
  for (const targets of graph.edges.values()) {
    for (const t of targets) hasIncoming.add(t);
  }
  return [...graph.nodes.keys()].filter((k) => !hasIncoming.has(k));
}

/** Shortest dependency chain from a root to `targetKey`, or just the node itself. */
function shortestChain(graph: LockGraph, targetKey: string): ChainNode[] {
  const roots = graph.roots.length > 0 ? graph.roots : inDegreeZeroRoots(graph);
  const prev = new Map<string, string | null>();
  const queue: string[] = [];
  for (const r of roots) {
    if (!prev.has(r)) {
      prev.set(r, null);
      queue.push(r);
    }
  }
  let found = prev.has(targetKey);
  while (queue.length > 0 && !found) {
    const cur = queue.shift()!;
    for (const next of graph.edges.get(cur) ?? []) {
      if (!prev.has(next)) {
        prev.set(next, cur);
        queue.push(next);
        if (next === targetKey) {
          found = true;
          break;
        }
      }
    }
  }

  const node = graph.nodes.get(targetKey);
  if (!prev.has(targetKey)) {
    return node ? [node] : [];
  }
  const path: string[] = [];
  let cursor: string | null | undefined = targetKey;
  while (cursor != null) {
    path.unshift(cursor);
    cursor = prev.get(cursor) ?? null;
  }
  return path.map((k) => graph.nodes.get(k)).filter((n): n is ChainNode => n !== undefined);
}

/** Find every excluded package in a lockfile closure and trace its chain. */
export function findExcludedInGraph(graph: LockGraph, orgs: ExcludedOrg[]): Layer2Finding[] {
  const findings: Layer2Finding[] = [];
  for (const [, node] of graph.nodes) {
    const matches = matchDependency(
      { name: node.name, version: node.version, ecosystem: graph.ecosystem, source_file: graph.lockfile },
      orgs,
    );
    if (matches.length === 0) continue;

    const chain = graph.edges_known
      ? shortestChain(graph, node.version ? `${node.name}@${node.version}` : node.name)
      : [node];

    for (const m of matches) {
      findings.push({
        org_key: m.org_key,
        signal: m.signal,
        matched_value: m.matched_value,
        lockfile: graph.lockfile,
        excluded_package: node.version ? `${node.name}@${node.version}` : node.name,
        chain: chain.length > 0 ? chain : [node],
        chain_known: graph.edges_known,
      });
    }
  }
  return findings;
}
