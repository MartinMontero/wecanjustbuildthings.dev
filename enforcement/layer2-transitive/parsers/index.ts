import type { LockGraph } from '../../types.ts';
import { parseNpmLock, parsePnpmLock, parseYarn1, parseYarnBerry } from './npm-family.ts';
import { parseCargoLock } from './cargo.ts';
import { parseUvLock, parsePoetryLock, parseRequirementsLock } from './python.ts';
import { parseGoModClosure } from './go.ts';
import { parseGemfileLock } from './ruby.ts';
import { parseMixLock } from './elixir.ts';
import { parsePubspecLock } from './dart.ts';
import { parseGradleLockfile } from './gradle.ts';

export type LockParser = (content: string, file: string) => LockGraph;

/** yarn.lock is v1 (classic) or Berry; Berry lockfiles carry a `__metadata` block. */
function parseYarnLock(content: string, file: string): LockGraph {
  return /^__metadata:/m.test(content) ? parseYarnBerry(content, file) : parseYarn1(content, file);
}

interface Rule {
  test: (filename: string) => boolean;
  parser: LockParser;
}

const RULES: Rule[] = [
  { test: (f) => f === 'package-lock.json' || f === 'npm-shrinkwrap.json', parser: parseNpmLock },
  { test: (f) => f === 'pnpm-lock.yaml', parser: parsePnpmLock },
  { test: (f) => f === 'yarn.lock', parser: parseYarnLock },
  { test: (f) => f === 'Cargo.lock', parser: parseCargoLock },
  { test: (f) => f === 'uv.lock', parser: parseUvLock },
  { test: (f) => f === 'poetry.lock', parser: parsePoetryLock },
  { test: (f) => /^requirements.*\.txt$/.test(f), parser: parseRequirementsLock },
  { test: (f) => f === 'go.mod', parser: parseGoModClosure },
  { test: (f) => f === 'Gemfile.lock', parser: parseGemfileLock },
  { test: (f) => f === 'mix.lock', parser: parseMixLock },
  { test: (f) => f === 'pubspec.lock', parser: parsePubspecLock },
  { test: (f) => f === 'gradle.lockfile', parser: parseGradleLockfile },
];

export function lookupLockParser(filename: string): LockParser | undefined {
  return RULES.find((r) => r.test(filename))?.parser;
}

/**
 * Lockfiles for ecosystems the matcher covers (js, py) that the engine has NO
 * reader for. Finding one fails the run (unsupported_lockfile) instead of being
 * skipped: before this list existed, a tree whose only lockfile was bun.lock
 * reported "0 lockfiles clean" and passed. Remove an entry only in the same
 * change that adds its reader to RULES above, with a fixture-backed test.
 */
const UNSUPPORTED_LOCKFILES = new Map<string, string>([
  ['bun.lock', 'Bun text lockfile (bun.lock)'],
  ['bun.lockb', 'Bun binary lockfile (bun.lockb)'],
  ['deno.lock', 'Deno lockfile (deno.lock)'],
  ['Pipfile.lock', 'Pipenv lockfile (Pipfile.lock)'],
  ['pdm.lock', 'PDM lockfile (pdm.lock)'],
]);

/** A short description when `filename` is a recognised lockfile with no reader; otherwise undefined. */
export function unsupportedLockfileKind(filename: string): string | undefined {
  return UNSUPPORTED_LOCKFILES.get(filename);
}
