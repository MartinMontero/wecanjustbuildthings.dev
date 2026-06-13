import { parsePackageJson, type ManifestParseResult } from './js.ts';
import { parseCargoToml } from './rust.ts';
import { parsePyprojectToml, parseRequirementsTxt } from './py.ts';
import { parseGoMod } from './go.ts';
import { parseMixExs } from './elixir.ts';
import { parsePubspecYaml } from './dart.ts';
import { parseGemfile } from './ruby.ts';
import { parseGradle } from './kotlin.ts';

export type ManifestParser = (content: string, file: string) => ManifestParseResult;

interface Rule {
  test: (filename: string) => boolean;
  parser: ManifestParser;
}

const RULES: Rule[] = [
  { test: (f) => f === 'package.json', parser: parsePackageJson },
  { test: (f) => f === 'Cargo.toml', parser: parseCargoToml },
  { test: (f) => f === 'pyproject.toml', parser: parsePyprojectToml },
  { test: (f) => /^requirements.*\.txt$/.test(f), parser: parseRequirementsTxt },
  { test: (f) => f === 'go.mod', parser: parseGoMod },
  { test: (f) => f === 'mix.exs', parser: parseMixExs },
  { test: (f) => f === 'pubspec.yaml', parser: parsePubspecYaml },
  { test: (f) => f === 'Gemfile', parser: parseGemfile },
  { test: (f) => f === 'build.gradle' || f === 'build.gradle.kts', parser: parseGradle },
];

export function lookupManifestParser(filename: string): ManifestParser | undefined {
  return RULES.find((r) => r.test(filename))?.parser;
}

export type { ManifestParseResult };
