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

/**
 * Yield every file under `root`. A directory that cannot be listed (including a
 * `root` that does not exist) is skipped; pass `onUnreadableDir` to be told, so a
 * fail-closed caller can turn the skip into a failure instead of a silent pass.
 */
export function* walkFiles(
  root: string,
  ignore: Set<string> = IGNORE_DIRS,
  onUnreadableDir?: (dir: string, err: unknown) => void,
): Generator<string> {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch (err) {
    onUnreadableDir?.(root, err);
    return;
  }
  for (const entry of entries) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      if (ignore.has(entry.name)) continue;
      yield* walkFiles(full, ignore, onUnreadableDir);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}
