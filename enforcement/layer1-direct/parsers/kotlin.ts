import type { DependencyRef } from '../../types.ts';
import type { ManifestParseResult } from './js.ts';

/**
 * Gradle build files (Groovy and Kotlin DSL) are Turing-complete; only declared
 * coordinates are statically detectable. We match the common
 * `configuration 'group:artifact:version'` / `configuration("group:artifact")`
 * forms and surface version-catalog / variable references we cannot resolve as
 * `unparseable_dependency_block` warnings (Part 4 honesty flag).
 */
const CONFIGS =
  'implementation|api|compileOnly|runtimeOnly|testImplementation|testApi|androidTestImplementation|kapt|ksp|annotationProcessor|classpath';

export function parseGradle(content: string, file: string): ManifestParseResult {
  const deps: DependencyRef[] = [];
  const warnings: string[] = [];

  // Match a string coordinate "group:artifact[:version]" after a known configuration.
  const coordRe = new RegExp(`\\b(?:${CONFIGS})\\b[\\s(]*['"]([^'":]+):([^'":]+)(?::([^'"]+))?['"]`, 'g');
  let m: RegExpExecArray | null;
  while ((m = coordRe.exec(content)) !== null) {
    const group = m[1]!;
    const artifact = m[2]!;
    deps.push({
      name: `${group}:${artifact}`,
      version: m[3],
      ecosystem: 'kotlin',
      source_file: file,
      scope: group,
      dep_type: 'gradle',
    });
  }

  // Version catalog (libs.*) and variable interpolation cannot be resolved here.
  const catalogRe = new RegExp(`\\b(?:${CONFIGS})\\b[\\s(]*(?:libs\\.|\\$\\{|"\\$)`);
  if (catalogRe.test(content)) {
    warnings.push(
      `${file}: contains version-catalog (libs.*) or interpolated coordinates that cannot be resolved statically (unparseable_dependency_block)`,
    );
  }

  return { deps, warnings };
}
