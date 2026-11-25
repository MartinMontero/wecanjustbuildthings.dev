import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { IGNORE_DIRS, walkFiles } from '../fs-walk.ts';
import { InputFailure, firstLine, type InputError } from '../input-errors.ts';
import { lookupLockParser, unsupportedLockfileKind } from './parsers/index.ts';
import { findExcludedInGraph } from './walk.ts';
import type { ExcludedOrg, Layer2Finding, LayerReport, LockGraph } from '../types.ts';

/**
 * Scan a source tree for lockfiles and flag excluded packages in the closure.
 * Fails closed: a lockfile (or directory) that cannot be read or parsed, or a
 * lockfile format with no reader (e.g. bun.lock), is a named InputError and
 * blocks the run; it is never counted as clean.
 */
export function runLayer2OnTree(root: string, orgs: ExcludedOrg[]): LayerReport<Layer2Finding> {
  const findings: Layer2Finding[] = [];
  const warnings: string[] = [];
  const errors: InputError[] = [];
  let scanned = 0;

  const onUnreadableDir = (dir: string, err: unknown) =>
    errors.push({ file: dir, reason: 'unreadable_directory', detail: `could not list directory: ${firstLine(err)}` });

  for (const file of walkFiles(root, IGNORE_DIRS, onUnreadableDir)) {
    const name = basename(file);

    const unsupported = unsupportedLockfileKind(name);
    if (unsupported) {
      errors.push({
        file,
        reason: 'unsupported_lockfile',
        detail: `${unsupported}: the engine has no reader for this format, so its packages cannot be checked`,
      });
      continue;
    }

    const parser = lookupLockParser(name);
    if (!parser) continue;

    let content: string;
    try {
      content = readFileSync(file, 'utf8');
    } catch (err) {
      errors.push({ file, reason: 'unreadable_file', detail: `could not read file: ${firstLine(err)}` });
      continue;
    }

    let graph: LockGraph;
    try {
      graph = parser(content, file);
    } catch (err) {
      errors.push(
        err instanceof InputFailure
          ? err.toInputError()
          : { file, reason: 'unparseable_lockfile', detail: `parser error: ${firstLine(err)}` },
      );
      continue;
    }

    scanned += 1;
    warnings.push(...graph.warnings);
    if (!graph.edges_known) {
      warnings.push(`${file}: closure-only lockfile — excluded packages are detected but dependency chains cannot be traced.`);
    }
    findings.push(...findExcludedInGraph(graph, orgs));
  }

  return {
    layer: 2,
    status: findings.length > 0 || errors.length > 0 ? 'block' : 'pass',
    findings,
    warnings,
    errors,
    scanned,
    generated_at: new Date().toISOString(),
  };
}
