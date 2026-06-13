import type { ChainNode, Ecosystem, LockGraph } from '../types.ts';

export function nodeKey(name: string, version?: string): string {
  return version ? `${name}@${version}` : name;
}

export function emptyGraph(ecosystem: Ecosystem, lockfile: string): LockGraph {
  return {
    ecosystem,
    lockfile,
    nodes: new Map<string, ChainNode>(),
    edges: new Map<string, string[]>(),
    roots: [],
    edges_known: true,
    warnings: [],
  };
}
