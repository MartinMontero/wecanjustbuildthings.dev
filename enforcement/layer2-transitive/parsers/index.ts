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
