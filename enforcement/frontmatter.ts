import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { walkFiles } from './fs-walk.ts';

export interface DocEntry {
  slug: string;
  file: string;
  frontmatter: Record<string, unknown>;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;

export function parseFrontmatter(content: string): Record<string, unknown> {
  const m = content.match(FRONTMATTER_RE);
  if (!m) return {};
  try {
    return (parseYaml(m[1]!) ?? {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Read every `.md`/`.mdx` doc under a directory, with parsed frontmatter. */
export function readDocEntries(dir: string): DocEntry[] {
  const entries: DocEntry[] = [];
  for (const file of walkFiles(dir)) {
    const ext = extname(file);
    if (ext !== '.md' && ext !== '.mdx') continue;
    const content = readFileSync(file, 'utf8');
    entries.push({
      slug: basename(file).replace(/\.mdx?$/, ''),
      file,
      frontmatter: parseFrontmatter(content),
    });
  }
  return entries;
}
