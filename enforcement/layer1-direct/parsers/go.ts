import type { DependencyRef } from '../../types.ts';
import type { ManifestParseResult } from './js.ts';

/**
 * Parse go.mod `require` directives directly from text. We deliberately avoid
 * shelling out to `go mod edit -json` here so the parser works on standalone
 * fixtures and in environments without the Go toolchain; Layer 2's transitive
 * walk is where `go mod graph` is used when edges are needed.
 */
export function parseGoMod(content: string, file: string): ManifestParseResult {
  const deps: DependencyRef[] = [];
  const warnings: string[] = [];
  const lines = content.split(/\r?\n/);
  let inRequireBlock = false;
  let inReplaceBlock = false;

  const add = (modulePath: string, version: string | undefined, depType: string) => {
    deps.push({ name: modulePath, version, ecosystem: 'go', source_file: file, dep_type: depType });
  };

  // A `replace X => github.com/openai/Y vN` reroutes the build to the RHS module,
  // so the replacement target must be screened too. Local-path replacements
  // (./ ../ /) are not modules and are skipped.
  const addReplaceTarget = (rhs: string) => {
    const m = rhs.trim().match(/^([^\s]+)(?:\s+([^\s]+))?/);
    if (!m) return;
    const target = m[1]!;
    if (target.startsWith('.') || target.startsWith('/')) return;
    add(target, m[2], 'replace');
  };

  for (const raw of lines) {
    const trimmed = raw.trim(); // keep the `// indirect` marker for detection
    if (trimmed.startsWith('require (')) {
      inRequireBlock = true;
      continue;
    }
    if (trimmed.startsWith('replace (')) {
      inReplaceBlock = true;
      continue;
    }
    if (inRequireBlock) {
      if (trimmed === ')') {
        inRequireBlock = false;
        continue;
      }
      const m = trimmed.match(/^([^\s]+)\s+([^\s]+)/);
      if (m) add(m[1]!, m[2]!, /\/\/\s*indirect/.test(trimmed) ? 'indirect' : 'require');
      continue;
    }
    if (inReplaceBlock) {
      if (trimmed === ')') {
        inReplaceBlock = false;
        continue;
      }
      const arrow = trimmed.indexOf('=>');
      if (arrow >= 0) addReplaceTarget(trimmed.slice(arrow + 2));
      continue;
    }
    // single-line require / replace
    const single = trimmed.match(/^require\s+([^\s]+)\s+([^\s]+)/);
    if (single) {
      add(single[1]!, single[2]!, /\/\/\s*indirect/.test(trimmed) ? 'indirect' : 'require');
      continue;
    }
    if (trimmed.startsWith('replace ')) {
      const arrow = trimmed.indexOf('=>');
      if (arrow >= 0) addReplaceTarget(trimmed.slice(arrow + 2));
    }
  }

  return { deps, warnings };
}
