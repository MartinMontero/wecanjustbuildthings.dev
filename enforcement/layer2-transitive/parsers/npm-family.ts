import { parse as parseYaml } from 'yaml';
import yarnLockfile from '@yarnpkg/lockfile';
import { parseSyml } from '@yarnpkg/parsers';
import type { ChainNode, LockGraph } from '../../types.ts';
import { emptyGraph, nodeKey } from '../util.ts';

function pkgNameFromPath(path: string): string {
  const marker = 'node_modules/';
  const idx = path.lastIndexOf(marker);
  return idx >= 0 ? path.slice(idx + marker.length) : path;
}

/** npm package-lock.json (lockfileVersion 2/3, `packages` map; v1 `dependencies` fallback). */
export function parseNpmLock(content: string, file: string): LockGraph {
  const graph = emptyGraph('js', file);
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(content) as Record<string, unknown>;
  } catch (err) {
    graph.warnings.push(`${file}: invalid JSON (${(err as Error).message})`);
    return graph;
  }

  const packages = json.packages as Record<string, Record<string, unknown>> | undefined;
  if (packages) {
    const byPath = new Map<string, { name: string; version?: string; deps: Record<string, string> }>();
    for (const [path, meta] of Object.entries(packages)) {
      const name = path === '' ? String(json.name ?? '(root)') : pkgNameFromPath(path);
      const version = meta.version as string | undefined;
      const deps: Record<string, string> = {
        ...((meta.dependencies as Record<string, string>) ?? {}),
        ...((meta.optionalDependencies as Record<string, string>) ?? {}),
        ...((meta.peerDependencies as Record<string, string>) ?? {}),
      };
      byPath.set(path, { name, version, deps });
      if (path !== '') graph.nodes.set(nodeKey(name, version), { name, version });
    }

    const resolve = (fromPath: string, depName: string): string | undefined => {
      let prefix = fromPath;
      for (;;) {
        const candidate = prefix === '' ? `node_modules/${depName}` : `${prefix}/node_modules/${depName}`;
        if (byPath.has(candidate)) return candidate;
        if (prefix === '') return undefined;
        const idx = prefix.lastIndexOf('/node_modules/');
        prefix = idx === -1 ? '' : prefix.slice(0, idx);
      }
    };

    for (const [path, meta] of byPath) {
      const targets: string[] = [];
      for (const depName of Object.keys(meta.deps)) {
        const resolvedPath = resolve(path, depName);
        if (!resolvedPath) continue;
        const t = byPath.get(resolvedPath)!;
        targets.push(nodeKey(t.name, t.version));
      }
      if (path === '') graph.roots.push(...targets);
      else graph.edges.set(nodeKey(meta.name, meta.version), targets);
    }
    return graph;
  }

  // Legacy v1: recursive `dependencies` tree.
  const walk = (deps: Record<string, Record<string, unknown>> | undefined): string[] => {
    if (!deps) return [];
    const keys: string[] = [];
    for (const [name, meta] of Object.entries(deps)) {
      const version = meta.version as string | undefined;
      const k = nodeKey(name, version);
      graph.nodes.set(k, { name, version });
      const childKeys = walk(meta.dependencies as Record<string, Record<string, unknown>> | undefined);
      graph.edges.set(k, childKeys);
      keys.push(k);
    }
    return keys;
  };
  graph.roots = walk(json.dependencies as Record<string, Record<string, unknown>> | undefined);
  return graph;
}

interface KeyParts {
  name: string;
  version: string;
}
function splitNameVersion(spec: string): KeyParts {
  let s = spec.startsWith('/') ? spec.slice(1) : spec;
  const paren = s.indexOf('(');
  if (paren >= 0) s = s.slice(0, paren);
  // pnpm v6+/v9 and yarn use `name@version`; pnpm v5 uses `/name/version`.
  const at = s.lastIndexOf('@');
  if (at > 0) return { name: s.slice(0, at), version: s.slice(at + 1) };
  const slash = s.lastIndexOf('/');
  if (slash > 0) return { name: s.slice(0, slash), version: s.slice(slash + 1) };
  return { name: s, version: '' };
}

/** pnpm-lock.yaml (v9 `snapshots` + `importers`; v6 `packages` fallback). */
export function parsePnpmLock(content: string, file: string): LockGraph {
  const graph = emptyGraph('js', file);
  let doc: Record<string, unknown>;
  try {
    doc = (parseYaml(content) ?? {}) as Record<string, unknown>;
  } catch (err) {
    graph.warnings.push(`${file}: invalid YAML (${(err as Error).message})`);
    return graph;
  }

  const snapshots = (doc.snapshots ?? doc.packages ?? {}) as Record<string, Record<string, unknown>>;
  for (const k of Object.keys(snapshots)) {
    const { name, version } = splitNameVersion(k);
    graph.nodes.set(nodeKey(name, version), { name, version });
  }
  for (const [k, snap] of Object.entries(snapshots)) {
    const { name, version } = splitNameVersion(k);
    const deps: Record<string, string> = {
      ...((snap.dependencies as Record<string, string>) ?? {}),
      ...((snap.optionalDependencies as Record<string, string>) ?? {}),
    };
    const targets = Object.entries(deps).map(([dn, dv]) => {
      const { version: ver } = splitNameVersion(`${dn}@${dv}`);
      return nodeKey(dn, ver);
    });
    graph.edges.set(nodeKey(name, version), targets);
  }

  const importers = (doc.importers ?? { '.': { dependencies: doc.dependencies, devDependencies: doc.devDependencies } }) as Record<
    string,
    Record<string, Record<string, { specifier?: string; version?: string } | string>>
  >;
  for (const imp of Object.values(importers)) {
    for (const block of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      const deps = imp[block];
      if (!deps) continue;
      for (const [dn, spec] of Object.entries(deps)) {
        const rawVer = typeof spec === 'string' ? spec : (spec.version ?? '');
        const { version: ver } = splitNameVersion(`${dn}@${rawVer}`);
        graph.roots.push(nodeKey(dn, ver));
      }
    }
  }
  return graph;
}

/** yarn.lock v1 (classic). */
export function parseYarn1(content: string, file: string): LockGraph {
  const graph = emptyGraph('js', file);
  let parsed: { type: string; object: Record<string, { version?: string; dependencies?: Record<string, string> }> };
  try {
    parsed = yarnLockfile.parse(content.replace(/\r\n/g, '\n')) as typeof parsed;
  } catch (err) {
    graph.warnings.push(`${file}: parse error (${(err as Error).message})`);
    return graph;
  }
  if (parsed.type !== 'success') graph.warnings.push(`${file}: yarn lockfile parse status ${parsed.type}`);

  const rangeToVersion = new Map<string, string>();
  const nameToVersion = new Map<string, string>();
  for (const [keyStr, val] of Object.entries(parsed.object)) {
    const version = val.version;
    if (!version) continue;
    for (const descriptor of keyStr.split(', ')) {
      rangeToVersion.set(descriptor.trim(), version);
      const at = descriptor.lastIndexOf('@');
      if (at > 0) nameToVersion.set(descriptor.slice(0, at), version);
    }
  }

  const resolve = (name: string, range: string): ChainNode => {
    const version =
      rangeToVersion.get(`${name}@${range}`) ?? rangeToVersion.get(`${name}@npm:${range}`) ?? nameToVersion.get(name);
    return { name, version };
  };

  for (const [keyStr, val] of Object.entries(parsed.object)) {
    if (!val.version) continue;
    const at = keyStr.split(', ')[0]!.lastIndexOf('@');
    const name = keyStr.slice(0, at > 0 ? at : keyStr.length);
    const self = nodeKey(name, val.version);
    graph.nodes.set(self, { name, version: val.version });
    const targets = Object.entries(val.dependencies ?? {}).map(([dn, dr]) => {
      const node = resolve(dn, dr);
      return nodeKey(node.name, node.version);
    });
    graph.edges.set(self, targets);
  }
  return graph;
}

/** yarn.lock Berry (v2+, YAML-ish syml). */
export function parseYarnBerry(content: string, file: string): LockGraph {
  const graph = emptyGraph('js', file);
  let obj: Record<string, { version?: string; dependencies?: Record<string, string> }>;
  try {
    obj = parseSyml(content) as typeof obj;
  } catch (err) {
    graph.warnings.push(`${file}: parse error (${(err as Error).message})`);
    return graph;
  }

  const descriptorToVersion = new Map<string, string>();
  const nameToVersion = new Map<string, string>();
  for (const [keyStr, val] of Object.entries(obj)) {
    if (keyStr === '__metadata' || !val.version) continue;
    for (const descriptor of keyStr.split(', ')) {
      descriptorToVersion.set(descriptor.trim(), val.version);
      const m = descriptor.match(/^(@?[^@]+)@/);
      if (m) nameToVersion.set(m[1]!, val.version);
    }
  }

  for (const [keyStr, val] of Object.entries(obj)) {
    if (keyStr === '__metadata' || !val.version) continue;
    const first = keyStr.split(', ')[0]!;
    const m = first.match(/^(@?[^@]+)@/);
    const name = m ? m[1]! : first;
    const self = nodeKey(name, val.version);
    graph.nodes.set(self, { name, version: val.version });
    const targets = Object.entries(val.dependencies ?? {}).map(([dn, dr]) => {
      const version = descriptorToVersion.get(`${dn}@${dr}`) ?? nameToVersion.get(dn);
      return nodeKey(dn, version);
    });
    graph.edges.set(self, targets);
  }
  return graph;
}
