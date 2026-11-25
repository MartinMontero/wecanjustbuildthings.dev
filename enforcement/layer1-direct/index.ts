import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { IGNORE_DIRS, walkFiles } from '../fs-walk.ts';
import { matchDependency } from '../matcher.ts';
import { InputFailure, firstLine, type InputError } from '../input-errors.ts';
import { lookupManifestParser, type ManifestParseResult } from './parsers/index.ts';
import type { ExcludedOrg, Layer1Finding, LayerReport } from '../types.ts';

/**
 * Scan a source tree for manifests and flag directly-declared excluded deps.
 * Fails closed: a manifest (or directory) that cannot be read or parsed is a
 * named InputError and blocks the run; it is never counted as clean.
 */
export function runLayer1OnTree(root: string, orgs: ExcludedOrg[]): LayerReport<Layer1Finding> {
  const findings: Layer1Finding[] = [];
  const warnings: string[] = [];
  const errors: InputError[] = [];
  let scanned = 0;

  const onUnreadableDir = (dir: string, err: unknown) =>
    errors.push({ file: dir, reason: 'unreadable_directory', detail: `could not list directory: ${firstLine(err)}` });

  for (const file of walkFiles(root, IGNORE_DIRS, onUnreadableDir)) {
    const parser = lookupManifestParser(basename(file));
    if (!parser) continue;

    let content: string;
    try {
      content = readFileSync(file, 'utf8');
    } catch (err) {
      errors.push({ file, reason: 'unreadable_file', detail: `could not read file: ${firstLine(err)}` });
      continue;
    }

    let result: ManifestParseResult;
    try {
      result = parser(content, file);
    } catch (err) {
      errors.push(
        err instanceof InputFailure
          ? err.toInputError()
          : { file, reason: 'unparseable_manifest', detail: `parser error: ${firstLine(err)}` },
      );
      continue;
    }

    scanned += 1;
    warnings.push(...result.warnings);
    for (const dep of result.deps) {
      for (const match of matchDependency(dep, orgs)) {
        findings.push({
          ...match,
          manifest_file: file,
          dependency: dep.name,
          dep_type: dep.dep_type,
        });
      }
    }
  }

  return {
    layer: 1,
    status: findings.length > 0 || errors.length > 0 ? 'block' : 'pass',
    findings,
    warnings,
    errors,
    scanned,
    generated_at: new Date().toISOString(),
  };
}
