import { collectDocEntries } from './frontmatter.ts';
import { matchDependency } from './matcher.ts';
import type { Ecosystem, ExcludedOrg, Layer1Finding, LayerReport } from './types.ts';

const CATALOG_TYPES = new Set(['tool', 'framework', 'library', 'service', 'protocol']);

/**
 * Catalog-mode Layer 1: read each catalog entry's declared dependency from its
 * frontmatter and confirm it is not owned by an excluded organization. This is
 * the check `verify.yml` runs on every PR against the published catalog.
 * Fails closed: an entry whose frontmatter cannot be read, or a catalog
 * directory that cannot be listed, is a named error that blocks the run.
 */
export function runCatalogLayer1(dir: string, orgs: ExcludedOrg[]): LayerReport<Layer1Finding> {
  const findings: Layer1Finding[] = [];
  const warnings: string[] = [];
  let scanned = 0;

  const { entries, errors } = collectDocEntries(dir);
  for (const entry of entries) {
    const fm = entry.frontmatter;
    if (!CATALOG_TYPES.has(String(fm.entry_type))) continue;
    scanned += 1;

    const name = typeof fm.dependency_name === 'string' ? fm.dependency_name : '';
    const ecosystem = fm.ecosystem as Ecosystem | undefined;
    if (!name || !ecosystem) {
      warnings.push(`${entry.file}: catalog entry missing dependency_name or ecosystem`);
      continue;
    }

    for (const match of matchDependency({ name, ecosystem, source_file: entry.file }, orgs)) {
      findings.push({ ...match, manifest_file: entry.file, dependency: name });
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
