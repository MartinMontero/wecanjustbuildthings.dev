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

  const add = (modulePath: string, version: string | undefined, indirect: boolean) => {
    deps.push({
      name: modulePath,
      version,
      ecosystem: 'go',
      source_file: file,
      dep_type: indirect ? 'indirect' : 'require',
    });
  };

  for (const raw of lines) {
    const trimmed = raw.trim(); // keep the `// indirect` marker for detection
    if (trimmed.startsWith('require (')) {
      inRequireBlock = true;
      continue;
    }
    if (inRequireBlock) {
      if (trimmed === ')') {
        inRequireBlock = false;
        continue;
      }
      const m = trimmed.match(/^([^\s]+)\s+([^\s]+)/);
      if (m) add(m[1]!, m[2]!, /\/\/\s*indirect/.test(trimmed));
      continue;
    }
    // single-line: require github.com/foo/bar v1.2.3
    const single = trimmed.match(/^require\s+([^\s]+)\s+([^\s]+)/);
    if (single) add(single[1]!, single[2]!, /\/\/\s*indirect/.test(trimmed));
  }

  return { deps, warnings };
}
