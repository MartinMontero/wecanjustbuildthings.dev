import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { IGNORE_DIRS, walkFiles } from './fs-walk.ts';
import { InputFailure, firstLine, requireMapping, type InputError } from './input-errors.ts';

export interface DocEntry {
  slug: string;
  file: string;
  frontmatter: Record<string, unknown>;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;

/**
 * Parse a page's YAML frontmatter. A page with no frontmatter block yields {}.
 * Fails closed: frontmatter that is present but does not parse as a YAML
 * mapping throws InputFailure('unparseable_frontmatter'). It used to return {},
 * which silently dropped the page from every check keyed on its fields.
 */
export function parseFrontmatter(content: string, file = '(frontmatter)'): Record<string, unknown> {
  const m = content.match(FRONTMATTER_RE);
  if (!m) return {};
  let parsed: unknown;
  try {
    parsed = parseYaml(m[1]!) ?? {}; // an empty block declares nothing
  } catch (err) {
    throw new InputFailure('unparseable_frontmatter', file, `could not parse frontmatter as YAML: ${firstLine(err)}`);
  }
  return requireMapping(parsed, 'unparseable_frontmatter', file, 'YAML frontmatter');
}

/**
 * Read every `.md`/`.mdx` doc under a directory. Returns the readable entries
 * plus a named InputError for every directory, file, or frontmatter block that
 * could not be read, so a caller can report all of them and fail the run.
 */
export function collectDocEntries(dir: string): { entries: DocEntry[]; errors: InputError[] } {
  const entries: DocEntry[] = [];
  const errors: InputError[] = [];
  const onUnreadableDir = (d: string, err: unknown) =>
    errors.push({ file: d, reason: 'unreadable_directory', detail: `could not list directory: ${firstLine(err)}` });

  for (const file of walkFiles(dir, IGNORE_DIRS, onUnreadableDir)) {
    const ext = extname(file);
    if (ext !== '.md' && ext !== '.mdx') continue;
    let content: string;
    try {
      content = readFileSync(file, 'utf8');
    } catch (err) {
      errors.push({ file, reason: 'unreadable_file', detail: `could not read file: ${firstLine(err)}` });
      continue;
    }
    let frontmatter: Record<string, unknown>;
    try {
      frontmatter = parseFrontmatter(content, file);
    } catch (err) {
      errors.push(
        err instanceof InputFailure
          ? err.toInputError()
          : { file, reason: 'unparseable_frontmatter', detail: `frontmatter error: ${firstLine(err)}` },
      );
      continue;
    }
    entries.push({ slug: basename(file).replace(/\.mdx?$/, ''), file, frontmatter });
  }
  return { entries, errors };
}

/**
 * Read every `.md`/`.mdx` doc under a directory, with parsed frontmatter.
 * Fail-closed convenience for scripts: throws InputFailure on the first input
 * it cannot read rather than returning a silently incomplete list.
 */
export function readDocEntries(dir: string): DocEntry[] {
  const { entries, errors } = collectDocEntries(dir);
  const first = errors[0];
  if (first) throw new InputFailure(first.reason, first.file, first.detail);
  return entries;
}
