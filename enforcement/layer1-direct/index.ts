import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { walkFiles } from '../fs-walk.ts';
import { matchDependency } from '../matcher.ts';
import { lookupManifestParser } from './parsers/index.ts';
import type { ExcludedOrg, Layer1Finding, LayerReport } from '../types.ts';

/** Scan a source tree for manifests and flag directly-declared excluded deps. */
export function runLayer1OnTree(root: string, orgs: ExcludedOrg[]): LayerReport<Layer1Finding> {
  const findings: Layer1Finding[] = [];
  const warnings: string[] = [];
  let scanned = 0;

  for (const file of walkFiles(root)) {
    const parser = lookupManifestParser(basename(file));
    if (!parser) continue;
    scanned += 1;
    const { deps, warnings: parserWarnings } = parser(readFileSync(file, 'utf8'), file);
    warnings.push(...parserWarnings);
    for (const dep of deps) {
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
    status: findings.length > 0 ? 'block' : 'pass',
    findings,
    warnings,
    scanned,
    generated_at: new Date().toISOString(),
  };
}
