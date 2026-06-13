import type { LockGraph } from '../../types.ts';
import { emptyGraph, nodeKey } from '../util.ts';

/**
 * gradle.lockfile (Gradle 7+ unified format), one line per resolved coordinate:
 *   group:artifact:version=conf1,conf2
 * Closure-only — no edges (edges_known = false; Part 4 honesty flag).
 */
export function parseGradleLockfile(content: string, file: string): LockGraph {
  const graph = emptyGraph('kotlin', file);
  graph.edges_known = false;
  const lineRe = /^([^:=\s]+):([^:=\s]+):([^=\s]+)=/;
  for (const raw of content.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('empty=')) continue;
    const m = trimmed.match(lineRe);
    if (m) {
      const name = `${m[1]}:${m[2]}`;
      graph.nodes.set(nodeKey(name, m[3]), { name, version: m[3] });
    }
  }
  return graph;
}
