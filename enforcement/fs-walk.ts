import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Directories never worth scanning (build output, vendored deps, VCS). */
export const IGNORE_DIRS = new Set([
  'node_modules',
  'target',
  'vendor',
  '.venv',
  'venv',
  '.gradle',
  'build',
  'dist',
  '.next',
  'out',
  '.git',
  '.astro',
  'coverage',
  '.cache',
  '.fetch-cache',
  'reports', // never scan the engine's own JSON output (it contains matched strings)
]);

export function* walkFiles(root: string, ignore: Set<string> = IGNORE_DIRS): Generator<string> {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      if (ignore.has(entry.name)) continue;
      yield* walkFiles(full, ignore);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}
