import type { LockGraph } from '../../types.ts';
import { emptyGraph, nodeKey } from '../util.ts';

/**
 * mix.lock is an Elixir map literal, one entry per line:
 *   "name": {:hex, :name, "version", "hash", [:mix], [{:dep, "~> 1.0", ...}], "hexpm", ...},
 * We extract the name, version, and the bracketed inner dependency list. Edges
 * are best-effort; mix.lock omits versions for deps so they resolve by name.
 */
export function parseMixLock(content: string, file: string): LockGraph {
  const graph = emptyGraph('elixir', file);
  const nameToVersion = new Map<string, string>();
  const pendingEdges: Array<{ from: string; depName: string }> = [];

  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    const head = line.match(/^"([^"]+)"\s*:\s*\{/);
    if (!head) continue;
    const name = head[1]!;
    // version is the first "x.y.z"-style quoted string after the package atom
    const verMatch = line.match(/:[a-z_]+\s*,\s*:[a-z0-9_]+\s*,\s*"([^"]+)"/);
    const version = verMatch ? verMatch[1] : undefined;
    graph.nodes.set(nodeKey(name, version), { name, version });
    if (version) nameToVersion.set(name, version);

    // inner deps list: [{:dep, "...", ...}, {:dep2, ...}]
    const listMatch = line.match(/\[((?:\s*\{:[a-z0-9_]+[^}]*\}\s*,?)*)\]/);
    if (listMatch && listMatch[1]) {
      const depRe = /\{:([a-z0-9_]+)/g;
      let m: RegExpExecArray | null;
      while ((m = depRe.exec(listMatch[1])) !== null) {
        if (m[1] === 'mix' || m[1] === 'hex' || m[1] === 'git') continue;
        pendingEdges.push({ from: nodeKey(name, version), depName: m[1]! });
      }
    }
  }

  for (const { from, depName } of pendingEdges) {
    const list = graph.edges.get(from) ?? [];
    list.push(nodeKey(depName, nameToVersion.get(depName)));
    graph.edges.set(from, list);
  }
  return graph;
}
