import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { walkFiles } from '../fs-walk.ts';
import { lookupLockParser } from './parsers/index.ts';
import { findExcludedInGraph } from './walk.ts';
import type { ExcludedOrg, Layer2Finding, LayerReport } from '../types.ts';

/** Scan a source tree for lockfiles and flag excluded packages in the closure. */
export function runLayer2OnTree(root: string, orgs: ExcludedOrg[]): LayerReport<Layer2Finding> {
  const findings: Layer2Finding[] = [];
  const warnings: string[] = [];
  let scanned = 0;

  for (const file of walkFiles(root)) {
    const parser = lookupLockParser(basename(file));
    if (!parser) continue;
    scanned += 1;
    const graph = parser(readFileSync(file, 'utf8'), file);
    warnings.push(...graph.warnings);
    if (!graph.edges_known) {
      warnings.push(`${file}: closure-only lockfile — excluded packages are detected but dependency chains cannot be traced.`);
    }
    findings.push(...findExcludedInGraph(graph, orgs));
  }

  return {
    layer: 2,
    status: findings.length > 0 ? 'block' : 'pass',
    findings,
    warnings,
    scanned,
    generated_at: new Date().toISOString(),
  };
}
