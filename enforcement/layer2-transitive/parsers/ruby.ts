import type { LockGraph } from '../../types.ts';
import { emptyGraph, nodeKey } from '../util.ts';

/**
 * Gemfile.lock (Bundler 2.x). The GEM > specs section is indentation-structured:
 * 4-space lines are resolved gems (`name (version)`), 6-space lines are that
 * gem's runtime dependencies. DEPENDENCIES lists the direct deps (roots).
 */
export function parseGemfileLock(content: string, file: string): LockGraph {
  const graph = emptyGraph('ruby', file);
  const lines = content.split(/\r?\n/);
  const nameToVersion = new Map<string, string>();

  let section: 'specs' | 'deps' | null = null;
  let currentSpec: { name: string; version?: string } | null = null;
  const pendingEdges: Array<{ from: string; depName: string }> = [];

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (/^(GEM|GIT|PATH|PLATFORMS|DEPENDENCIES|BUNDLED WITH|RUBY VERSION|CHECKSUMS)\b/.test(trimmed)) {
      section = trimmed.startsWith('DEPENDENCIES') ? 'deps' : null;
      currentSpec = null;
      continue;
    }
    if (trimmed === 'specs:') {
      section = 'specs';
      continue;
    }
    if (!trimmed) continue;

    const indent = raw.length - raw.trimStart().length;
    if (section === 'specs') {
      if (indent === 4) {
        const m = trimmed.match(/^([^\s(]+)\s*\(([^)]+)\)/);
        if (m) {
          currentSpec = { name: m[1]!, version: m[2] };
          graph.nodes.set(nodeKey(m[1]!, m[2]), { name: m[1]!, version: m[2] });
          nameToVersion.set(m[1]!, m[2]!);
        }
      } else if (indent >= 6 && currentSpec) {
        const m = trimmed.match(/^([^\s(]+)/);
        if (m) pendingEdges.push({ from: nodeKey(currentSpec.name, currentSpec.version), depName: m[1]! });
      }
    } else if (section === 'deps') {
      const m = trimmed.match(/^([^\s(!]+)/);
      if (m) graph.roots.push(nodeKey(m[1]!, nameToVersion.get(m[1]!)));
    }
  }

  for (const { from, depName } of pendingEdges) {
    const list = graph.edges.get(from) ?? [];
    list.push(nodeKey(depName, nameToVersion.get(depName)));
    graph.edges.set(from, list);
  }
  return graph;
}
