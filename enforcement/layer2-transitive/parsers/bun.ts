// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * bun.lock: Bun's text lockfile (Bun 1.2+). Primary source: Bun's own writer
 * and loader, oven-sh/bun src/install/lockfile/bun.lock.rs (read 2026-11-25).
 *
 * Format facts used here (from that source):
 *  - JSONC: the writer emits trailing commas.
 *  - lockfileVersion is 0, 1, 2 or 3. Any other value fails closed here.
 *  - `workspaces` is required ("" = root, other keys = workspace paths), each
 *    with a `name` and dependency groups. `packages` is optional.
 *  - `packages` keys are tree paths: "name", or "parent/name" for a nested copy.
 *  - each `packages` value is an array whose [0] is "name@resolution"; the INFO
 *    object (dependency maps) is [2] for npm rows (after the registry string)
 *    and [1] for file/link/tarball/git/github rows; workspace rows have none.
 *
 * Fail closed: every package row becomes a node, so detection never depends on
 * edge resolution. Anything the reader does not recognise (syntax, version,
 * row shape) throws InputFailure('unparseable_lockfile') instead of being skipped.
 */
import { InputFailure, firstLine, requireMapping } from '../../input-errors.ts';
import type { LockGraph } from '../../types.ts';
import { emptyGraph, nodeKey } from '../util.ts';

/** lockfileVersion values defined by Bun's `Version` enum (V0..V3). */
const KNOWN_VERSIONS = new Set([0, 1, 2, 3]);
/** Dependency groups in a workspace entry or a package INFO object. */
const DEP_GROUPS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const;

/**
 * Strip JSONC comments and trailing commas so JSON.parse can read the text.
 * String-aware: nothing inside a JSON string is altered. An unterminated
 * string or block comment is left for JSON.parse to reject.
 */
export function stripJsonc(text: string): string {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i]!;
    if (ch === '"') {
      let j = i + 1;
      while (j < n && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (ch === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') i += 1;
    } else if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end === -1) return out + text.slice(i); // let JSON.parse report it
      i = end + 2;
    } else if (ch === ',') {
      // Drop the comma if only whitespace/comments stand between it and } or ].
      let j = i + 1;
      for (;;) {
        while (j < n && /\s/.test(text[j]!)) j += 1;
        if (text[j] === '/' && text[j + 1] === '/') {
          while (j < n && text[j] !== '\n') j += 1;
        } else if (text[j] === '/' && text[j + 1] === '*') {
          const end = text.indexOf('*/', j + 2);
          j = end === -1 ? n : end + 2;
        } else break;
      }
      if (text[j] !== '}' && text[j] !== ']') out += ch;
      i += 1;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

/**
 * Resolve dependency `depName` of the package at tree path `pkgPath` to a
 * `packages` key. Ported from Bun's `PkgMap::find_resolution`: try
 * "<pkgPath>/<dep>", then walk toward the root one package segment at a time
 * (a scoped "@scope/name" is one segment), ending with "<dep>" at the root.
 * (Bun's extra stop for optional peers under bundled packages only affects
 * which copy a chain shows, never which packages exist, so it is omitted.)
 */
export function findBunResolution(keys: ReadonlySet<string>, pkgPath: string, depName: string): string | undefined {
  let offset = pkgPath.length + 1; // the walk prefix is pkgPath.slice(0, offset) + '/'
  for (;;) {
    const candidate = (offset === 0 ? '' : `${pkgPath.slice(0, offset - 1)}/`) + depName;
    if (keys.has(candidate)) return candidate;
    if (offset === 0) return undefined;

    const head = pkgPath.slice(0, offset - 1);
    const slash = head.lastIndexOf('/');
    if (slash === -1) {
      offset = 0;
      continue;
    }
    const at = head.lastIndexOf('@');
    if (at === -1) {
      offset = slash + 1;
      continue;
    }
    if (at > slash) return undefined; // malformed path segment
    const nextSlash = pkgPath.slice(0, slash).lastIndexOf('/');
    if (nextSlash === -1) {
      if (at !== 0) return undefined;
      offset = 0;
      continue;
    }
    if (nextSlash > at) {
      offset = slash + 1; // the scoped package sits farther up
      continue;
    }
    if (nextSlash + 1 !== at) return undefined;
    offset = at;
  }
}

function fail(file: string, detail: string): never {
  throw new InputFailure('unparseable_lockfile', file, detail);
}

function isMapping(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Dependency names from the groups of a workspace entry or INFO object; malformed groups fail closed. */
function depNames(holder: Record<string, unknown>, file: string, where: string): string[] {
  const names: string[] = [];
  for (const group of DEP_GROUPS) {
    const g = holder[group];
    if (g === undefined) continue;
    if (!isMapping(g)) fail(file, `${where}: "${group}" is not an object`);
    names.push(...Object.keys(g));
  }
  return names;
}

/** Split "name@resolution" (a scoped name keeps its leading "@"). */
function splitIdent(ident: string, file: string, key: string): { name: string; resolution: string } {
  const sep = ident.indexOf('@', 1);
  if (sep <= 0) fail(file, `packages["${key}"]: "${ident}" is not "name@resolution"`);
  return { name: ident.slice(0, sep), resolution: ident.slice(sep + 1) };
}

export function parseBunLock(content: string, file: string): LockGraph {
  const graph = emptyGraph('js', file);

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonc(content.replace(/^﻿/, '')));
  } catch (err) {
    fail(file, `could not parse as JSONC: ${firstLine(err)}`);
  }
  const doc = requireMapping(parsed, 'unparseable_lockfile', file, 'JSONC');

  const version = doc.lockfileVersion;
  if (typeof version !== 'number' || !KNOWN_VERSIONS.has(version)) {
    fail(file, `lockfileVersion ${JSON.stringify(version)} is not one this reader knows (0-3)`);
  }
  if (!isMapping(doc.workspaces)) fail(file, 'missing "workspaces" object');
  if (doc.packages !== undefined && !isMapping(doc.packages)) fail(file, '"packages" is not an object');
  const packages = (doc.packages ?? {}) as Record<string, unknown>;

  // Pass 1: every row is a node (detection never depends on edges).
  const keyToNode = new Map<string, string>();
  const keyToDeps = new Map<string, string[]>();
  for (const [key, row] of Object.entries(packages)) {
    if (!Array.isArray(row) || row.length === 0 || typeof row[0] !== 'string') {
      fail(file, `packages["${key}"] is not an array starting with "name@resolution"`);
    }
    const { name, resolution } = splitIdent(row[0], file, key);
    let info: Record<string, unknown> | undefined;
    for (let i = 1; i < row.length; i += 1) {
      const el: unknown = row[i];
      if (isMapping(el)) info ??= el;
      else if (typeof el !== 'string') fail(file, `packages["${key}"][${i}] is neither a string nor an object`);
    }
    if (resolution === 'root:') continue; // the project itself (bin metadata only)
    const nk = nodeKey(name, resolution);
    graph.nodes.set(nk, { name, version: resolution });
    keyToNode.set(key, nk);
    keyToDeps.set(key, info ? depNames(info, file, `packages["${key}"]`) : []);
  }

  // Pass 2: edges, resolved the way Bun's loader does (affects chains only).
  const keys = new Set(keyToNode.keys());
  for (const [key, deps] of keyToDeps) {
    const targets: string[] = [];
    for (const dep of deps) {
      const hit = findBunResolution(keys, key, dep);
      if (hit) targets.push(keyToNode.get(hit)!);
    }
    graph.edges.set(keyToNode.get(key)!, targets);
  }

  // Roots: workspace dependencies. Root ("") deps resolve by name; another
  // workspace's deps try "<wsName>/<dep>" (or "./<wsName>/<dep>" when that
  // workspace is unlinked), then "<dep>", as in Bun's loader.
  for (const [wsPath, ws] of Object.entries(doc.workspaces as Record<string, unknown>)) {
    if (!isMapping(ws)) fail(file, `workspaces["${wsPath}"] is not an object`);
    const deps = depNames(ws, file, `workspaces["${wsPath}"]`);
    const wsName = typeof ws.name === 'string' ? ws.name : '';
    const own = packages[wsName];
    const linked = Array.isArray(own) && own[0] === `${wsName}@workspace:${wsPath}`;
    const prefix = linked ? '' : './';
    for (const dep of deps) {
      const hit = wsPath === '' ? (keys.has(dep) ? dep : undefined) : [`${prefix}${wsName}/${dep}`, dep].find((k) => keys.has(k));
      if (hit) graph.roots.push(keyToNode.get(hit)!);
    }
  }
  return graph;
}
