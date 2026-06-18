/**
 * Catalog translation pipeline (offline, deterministic generator).
 *
 * This is a SEPARATE generator from the Astro build — it emits COMMITTED files.
 * The site build itself stays offline/deterministic; this script is run by a
 * maintainer (or CI job) to (re)generate the localized catalog, and its output
 * is checked into the repo. The build never calls an API.
 *
 *   English source : src/content/docs/catalog/**\/*.mdx  (incl. datasets/, excl. index.mdx)
 *   Spanish copies : src/content/docs/es/catalog/<same relative path>
 *   Arabic copies  : src/content/docs/ar/catalog/<same relative path>
 *
 * What gets translated per entry:
 *   - frontmatter `description` and `what_it_does` (free text)
 *   - the MDX body's human-readable English prose ONLY
 * What is preserved exactly:
 *   - all MDX/JSX/HTML tags + attributes, component names, the Aside import line,
 *     fenced/inline code, URLs, and the data VALUES inside <dl class="wcb-meta">
 *     and the <span class="wcb-badge ..."> badges (ecosystem code, license id,
 *     version, status). Visible label/boilerplate text IS translated.
 *   - `title` (the tool name) and every other frontmatter field/value.
 * Internal site links (href / markdown links starting with `/`) get the locale
 * prefix; `https://` and `#anchors` are left alone.
 * `machine_translated: true` is added to the output frontmatter.
 *
 * Run:    npm run translate:catalog            (dry-run identity translator, default)
 *         npm run translate:catalog -- --tag   (dry-run, prefixes [es]/[ar] markers)
 *         npm run translate:catalog -- --provider anthropic   (real translation)
 *
 * Uses only Node built-ins + js-yaml (already a dependency). No new deps.
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import yaml from 'js-yaml';

// ---------------------------------------------------------------------------
// Paths & constants
// ---------------------------------------------------------------------------

const REPO_ROOT = join(import.meta.dirname, '..');
const SRC_CATALOG = join(REPO_ROOT, 'src', 'content', 'docs', 'catalog');
const DOCS_ROOT = join(REPO_ROOT, 'src', 'content', 'docs');
const CACHE_DIR = join(REPO_ROOT, '.cache');

/** Supported target languages. */
type Lang = 'es' | 'ar';
const ALL_LANGS: readonly Lang[] = ['es', 'ar'] as const;

/** Frontmatter free-text fields we translate. Everything else is copied verbatim. */
const TRANSLATABLE_FIELDS = ['description', 'what_it_does'] as const;

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

interface CliOptions {
  langs: Lang[];
  limit: number | null;
  filter: string | null;
  /** true ⇒ dry-run (identity translator). The DEFAULT when no --provider given. */
  dryRun: boolean;
  /** in dry-run, prefix [es]/[ar] markers so output is visibly distinct. */
  tag: boolean;
  provider: 'anthropic' | null;
  model: string;
  force: boolean;
  concurrency: number;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    langs: [...ALL_LANGS],
    limit: null,
    filter: null,
    dryRun: true, // overridden to false if --provider is supplied (and not also --dry-run)
    tag: false,
    provider: null,
    model: 'claude-sonnet-4-6',
    force: false,
    concurrency: 4,
  };

  let explicitDryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case '--lang': {
        const raw = (next() ?? '').split(',').map((s) => s.trim()).filter(Boolean);
        const valid = raw.filter((l): l is Lang => (ALL_LANGS as readonly string[]).includes(l));
        if (valid.length !== raw.length) {
          const bad = raw.filter((l) => !(ALL_LANGS as readonly string[]).includes(l));
          fail(`--lang got unsupported value(s): ${bad.join(', ')} (allowed: ${ALL_LANGS.join(', ')})`);
        }
        if (valid.length) opts.langs = valid;
        break;
      }
      case '--limit': {
        const n = Number.parseInt(next() ?? '', 10);
        if (!Number.isFinite(n) || n < 0) fail('--limit expects a non-negative integer');
        opts.limit = n;
        break;
      }
      case '--filter':
        opts.filter = next() ?? null;
        break;
      case '--dry-run':
        opts.dryRun = true;
        explicitDryRun = true;
        break;
      case '--tag':
        opts.tag = true;
        break;
      case '--provider': {
        const p = next();
        if (p !== 'anthropic') fail(`--provider only supports "anthropic" (got "${p}")`);
        opts.provider = 'anthropic';
        break;
      }
      case '--model':
        opts.model = next() ?? opts.model;
        break;
      case '--force':
        opts.force = true;
        break;
      case '--concurrency': {
        const n = Number.parseInt(next() ?? '', 10);
        if (!Number.isFinite(n) || n < 1) fail('--concurrency expects a positive integer');
        opts.concurrency = n;
        break;
      }
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
        break;
      default:
        fail(`unknown flag: ${arg}`);
    }
  }

  // The dry-run identity translator is the default. A real translation only
  // happens when --provider is given AND --dry-run was not explicitly passed.
  if (opts.provider && !explicitDryRun) opts.dryRun = false;

  return opts;
}

function fail(msg: string): never {
  console.error(`translate-catalog: ${msg}`);
  process.exit(1);
}

function printHelp(): void {
  console.log(`translate-catalog — generate es/ar copies of catalog entries

Usage: tsx scripts/translate-catalog.ts [flags]

Flags:
  --lang es,ar          target languages (default: both)
  --limit N             only process the first N entries
  --filter <substring>  only entries whose relative path contains <substring>
  --dry-run             identity translator, no network (DEFAULT when no --provider)
  --tag                 in dry-run, prefix output with [es]/[ar] markers
  --provider anthropic  call the Anthropic Messages API (needs ANTHROPIC_API_KEY)
  --model <id>          model for --provider anthropic (default: claude-sonnet-4-6)
  --force               overwrite existing output files (default: skip / resumable)
  --concurrency N       parallel entries per batch (default: 4)
  -h, --help            show this help`);
}

// ---------------------------------------------------------------------------
// Translator abstraction (pluggable)
// ---------------------------------------------------------------------------

interface Translator {
  translate(text: string, lang: Lang): Promise<string>;
}

/**
 * Dry-run translator: no network. Returns input unchanged, or prefixes a
 * language marker when --tag is passed. Used to verify the plumbing offline.
 */
class IdentityTranslator implements Translator {
  constructor(private readonly tag: boolean) {}
  async translate(text: string, lang: Lang): Promise<string> {
    if (!this.tag) return text;
    // Only mark non-empty strings; an empty marker would corrupt structure.
    return text ? `[${lang}] ${text}` : text;
  }
}

const LANG_PROMPT: Record<Lang, string> = {
  es: 'natural Spanish, using the informal "tú" register',
  ar: 'Modern Standard Arabic',
};

/**
 * Anthropic Messages API translator. Each call translates one chunk of text.
 * The system prompt forbids touching markup/code/URLs/identifiers and asks for
 * the translated text only — so the caller can splice results back into the
 * MDX exactly where the English was.
 */
class AnthropicTranslator implements Translator {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    private readonly model: string,
    private readonly maxRetries = 5,
  ) {
    this.baseUrl = process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com';
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      fail(
        '--provider anthropic requires ANTHROPIC_API_KEY in the environment. ' +
          'Set it (and optionally ANTHROPIC_BASE_URL) before running.',
      );
    }
    this.apiKey = key;
  }

  async translate(text: string, lang: Lang): Promise<string> {
    // Don't spend a request on whitespace/empty input.
    if (!text.trim()) return text;

    const system =
      `You are a professional localizer translating documentation for an open-source ` +
      `software catalog into ${LANG_PROMPT[lang]}. ` +
      `Translate ONLY the human-readable prose. Preserve EXACTLY, unchanged: all ` +
      `Markdown/MDX/JSX/HTML tags and their attributes, component names, import ` +
      `statements, fenced and inline code, URLs, and identifiers (package names, ` +
      `license SPDX ids, version numbers, ecosystem codes, status values). ` +
      `Do not translate text inside code spans or code fences. Do not add, remove, ` +
      `or reorder any markup. Do not wrap the output in code fences or quotes. ` +
      `Return ONLY the translated text, with no preamble, explanation, or commentary.`;

    const body = {
      model: this.model,
      max_tokens: 8192,
      system,
      messages: [{ role: 'user', content: text }],
    };

    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const res = await fetch(`${this.baseUrl}/v1/messages`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          // 4xx (except 429) are not retryable — fail fast.
          if (res.status !== 429 && res.status >= 400 && res.status < 500) {
            fail(`Anthropic API ${res.status}: ${detail.slice(0, 500)}`);
          }
          throw new Error(`HTTP ${res.status}: ${detail.slice(0, 200)}`);
        }

        const json = (await res.json()) as {
          content?: Array<{ type: string; text?: string }>;
        };
        const out = (json.content ?? [])
          .filter((b) => b.type === 'text' && typeof b.text === 'string')
          .map((b) => b.text as string)
          .join('');
        return out;
      } catch (err) {
        lastErr = err;
        if (attempt < this.maxRetries) {
          // Exponential backoff with jitter: 0.5s, 1s, 2s, 4s, 8s (+/- jitter).
          const base = 500 * 2 ** attempt;
          const jitter = Math.floor(Math.random() * 250);
          await sleep(base + jitter);
        }
      }
    }
    fail(`Anthropic API failed after ${this.maxRetries + 1} attempts: ${String(lastErr)}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Translation-memory cache (per language)
// ---------------------------------------------------------------------------

/**
 * A small SHA-256-keyed translation memory. Boilerplate (Aside bodies, the
 * "Why it's in the catalog" paragraph, <dt> labels) repeats across thousands of
 * entries, so we translate each distinct string once and reuse it. Persisted to
 * .cache/catalog-i18n.<lang>.json between (and during) runs.
 */
class TranslationCache {
  private readonly map: Map<string, string>;
  private readonly path: string;
  private dirty = false;
  hits = 0;
  misses = 0;

  constructor(lang: Lang) {
    this.path = join(CACHE_DIR, `catalog-i18n.${lang}.json`);
    this.map = new Map();
    if (existsSync(this.path)) {
      try {
        const raw = JSON.parse(readFileSync(this.path, 'utf8')) as Record<string, string>;
        for (const [k, v] of Object.entries(raw)) this.map.set(k, v);
      } catch {
        console.warn(`  ~ cache ${this.path} unreadable — starting empty`);
      }
    }
  }

  private static key(text: string): string {
    return createHash('sha256').update(text, 'utf8').digest('hex');
  }

  get(text: string): string | undefined {
    const v = this.map.get(TranslationCache.key(text));
    if (v !== undefined) this.hits++;
    else this.misses++;
    return v;
  }

  set(text: string, translation: string): void {
    this.map.set(TranslationCache.key(text), translation);
    this.dirty = true;
  }

  /** Persist if anything changed since the last flush. */
  flush(): void {
    if (!this.dirty) return;
    mkdirSync(CACHE_DIR, { recursive: true });
    const obj: Record<string, string> = {};
    // Deterministic key order so the committed/regenerated cache diffs cleanly.
    for (const k of [...this.map.keys()].sort()) obj[k] = this.map.get(k)!;
    writeFileSync(this.path, JSON.stringify(obj, null, 2) + '\n', 'utf8');
    this.dirty = false;
  }
}

/**
 * Translate a single string with cache + dedup. Identical strings resolve to a
 * single underlying translation regardless of how many entries reference them.
 */
async function translateCached(
  text: string,
  lang: Lang,
  translator: Translator,
  cache: TranslationCache,
): Promise<string> {
  // Pure whitespace / empty: never translate (keeps MDX structure intact).
  if (!text.trim()) return text;
  const cached = cache.get(text);
  if (cached !== undefined) return cached;
  const out = await translator.translate(text, lang);
  cache.set(text, out);
  return out;
}

// ---------------------------------------------------------------------------
// Frontmatter (YAML) parse + reserialize
// ---------------------------------------------------------------------------

/** Split an .mdx file into [frontmatterYaml, body]. Throws if no frontmatter. */
function splitFrontmatter(source: string): { fm: string; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source);
  if (!match) throw new Error('no YAML frontmatter found');
  return { fm: match[1], body: match[2] };
}

/**
 * Reserialize a frontmatter object to YAML, QUOTING any value that contains a
 * colon or other YAML-significant characters. We hand-roll this (rather than
 * lean on js-yaml's dump) to match the existing generator's compact, one-key-
 * per-line style and its always-double-quote convention for strings.
 */
function serializeFrontmatter(obj: Record<string, unknown>): string {
  const lines: string[] = ['---'];
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    lines.push(`${key}: ${serializeYamlValue(value)}`);
  }
  lines.push('---');
  return lines.join('\n');
}

function serializeYamlValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((v) => serializeScalar(v)).join(', ')}]`;
  }
  return serializeScalar(value);
}

function serializeScalar(value: unknown): string {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  // JSON.stringify gives us safe, always-double-quoted YAML-compatible strings:
  // it escapes embedded quotes/newlines and naturally quotes anything with a
  // colon or other special character. Matches scripts/build-catalog.ts.
  return JSON.stringify(String(value));
}

// ---------------------------------------------------------------------------
// MDX body translation
// ---------------------------------------------------------------------------

const ASIDE_IMPORT = "import { Aside } from '@astrojs/starlight/components';";

/**
 * Localize internal site links: any href / markdown link target that starts
 * with a single `/` gets the `/<lang>` prefix. Absolute https:// and #anchors
 * are left alone. `//host` (protocol-relative) is also left alone.
 */
function localizeLinks(text: string, lang: Lang): string {
  let out = text;
  // HTML/JSX attributes: href="/policies/" -> href="/es/policies/"
  out = out.replace(/href=(["'])(\/(?!\/)[^"']*)\1/g, (_m, q: string, path: string) => {
    return `href=${q}/${lang}${path}${q}`;
  });
  // Markdown links: [text](/policies/) -> [text](/es/policies/)
  out = out.replace(/\]\((\/(?!\/)[^)\s]*)\)/g, (_m, path: string) => {
    return `](/${lang}${path})`;
  });
  return out;
}

/**
 * Tokenize the body into segments, marking each as either PROSE (translatable)
 * or VERBATIM (copied unchanged). The verbatim set is everything the task says
 * to preserve: tags, code, URLs, the Aside import, and the data VALUES inside
 * <dl class="wcb-meta"> (<dd>…</dd>) and the badge identifiers.
 *
 * Strategy: we translate visible TEXT NODES between tags, but selectively keep
 * certain text nodes verbatim:
 *   - the entire Aside import line
 *   - fenced code blocks (``` … ```) and inline code (`…`)
 *   - text inside <dd>…</dd> (the metadata values)
 *   - the value portion of a badge: "<dt>License</dt>" label IS translated, but
 *     in "license: MIT" the "MIT" stays — we translate only the prefix word.
 */
interface Segment {
  kind: 'prose' | 'verbatim';
  text: string;
}

/**
 * Carve the body into translatable prose segments and verbatim segments.
 *
 * We work in passes, each pass protecting a class of content by replacing it
 * with verbatim segments, leaving the gaps as candidate prose. The remaining
 * prose is text that sits between/inside tags; we then translate visible text
 * nodes while keeping the angle-bracket tags themselves verbatim.
 */
function tokenizeBody(body: string): Segment[] {
  // Master regex of things to keep VERBATIM, in priority order:
  //   1. fenced code blocks
  //   2. the Aside import line (exact)
  //   3. inline code spans
  //   4. <dd>...</dd> blocks (metadata VALUES — kept whole, incl. inner <a> + URL)
  //   5. any HTML/JSX tag (opening, closing, self-closing) — attributes preserved
  //   6. bare URLs
  // Everything NOT matched is candidate prose (visible text nodes).
  // First protect code (so we never translate code that happens to read like
  // prose): fenced blocks, then inline backtick spans.
  let segments: Segment[] = [{ kind: 'prose', text: body }];
  segments = protect(segments, /```[\s\S]*?```/g); // fenced code
  segments = protect(segments, /`[^`\n]*`/g); // inline code

  // Protect <dd>…</dd> metadata values as whole verbatim units (incl. inner
  // <a> + URL). Done before <code> so a dd is never fragmented.
  segments = protect(segments, /<dd>[\s\S]*?<\/dd>/g);

  // Protect <code>…</code> HTML spans — these hold identifiers (SPDX ids, commit
  // shas, version strings) that must survive byte-for-byte.
  segments = protect(segments, /<code>[\s\S]*?<\/code>/g);

  // Protect the Aside import line verbatim (defensive — it's also a "tag-ish"
  // line, but make it explicit so it's never touched).
  segments = protectExact(segments, ASIDE_IMPORT);

  // Split remaining prose into tags (verbatim) and text nodes (prose). A tag is
  // <...> ; everything else between tags is a visible text node. This runs
  // BEFORE bare-URL protection so that an <a href="URL"> stays a single whole
  // tag (protecting the URL first would split the tag into broken fragments).
  segments = splitTagsFromText(segments);

  // Protect any remaining bare URLs that sit inside prose text nodes (rare, but
  // the task lists URLs as preserve-exactly).
  segments = protect(segments, /https?:\/\/[^\s<>")\]]+/g);

  return segments;
}

/** Replace regex matches inside prose segments with verbatim segments. */
function protect(segments: Segment[], re: RegExp): Segment[] {
  const out: Segment[] = [];
  for (const seg of segments) {
    if (seg.kind !== 'prose') {
      out.push(seg);
      continue;
    }
    let last = 0;
    const text = seg.text;
    // Reset stateful global regex per segment.
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) out.push({ kind: 'prose', text: text.slice(last, m.index) });
      out.push({ kind: 'verbatim', text: m[0] });
      last = m.index + m[0].length;
      if (m[0].length === 0) re.lastIndex++; // guard against zero-width matches
    }
    if (last < text.length) out.push({ kind: 'prose', text: text.slice(last) });
  }
  return out;
}

/** Protect every exact occurrence of `literal` as a verbatim segment. */
function protectExact(segments: Segment[], literal: string): Segment[] {
  const out: Segment[] = [];
  for (const seg of segments) {
    if (seg.kind !== 'prose' || !seg.text.includes(literal)) {
      out.push(seg);
      continue;
    }
    const parts = seg.text.split(literal);
    parts.forEach((part, i) => {
      if (part) out.push({ kind: 'prose', text: part });
      if (i < parts.length - 1) out.push({ kind: 'verbatim', text: literal });
    });
  }
  return out;
}

/**
 * Split prose segments into alternating tag (verbatim) and text-node (prose)
 * pieces. Tags keep their names and attributes intact; only the visible text
 * between tags is left as prose for translation.
 */
function splitTagsFromText(segments: Segment[]): Segment[] {
  const tagRe = /<\/?[A-Za-z][^>]*>/g;
  const out: Segment[] = [];
  for (const seg of segments) {
    if (seg.kind !== 'prose') {
      out.push(seg);
      continue;
    }
    let last = 0;
    const text = seg.text;
    tagRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(text)) !== null) {
      if (m.index > last) out.push({ kind: 'prose', text: text.slice(last, m.index) });
      out.push({ kind: 'verbatim', text: m[0] });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ kind: 'prose', text: text.slice(last) });
  }
  return out;
}

/**
 * Translate the MDX body: localize internal links, then translate only the
 * prose text nodes (each via the cache), splicing them back between the
 * verbatim tags/code/values. Badge prefixes like "license:" are inside text
 * nodes and so get translated; the identifier after them lives in its own text
 * node too — but identifiers (MIT, active, 18.0.5) look like single tokens, and
 * we rely on the per-string cache + the model's preserve instructions to keep
 * them. To be safe with the identity translator (dry-run) we don't need special
 * handling; with the API translator the system prompt protects identifiers.
 */
async function translateBody(
  body: string,
  lang: Lang,
  translator: Translator,
  cache: TranslationCache,
): Promise<string> {
  const localized = localizeLinks(body, lang);
  const segments = tokenizeBody(localized);
  const parts: string[] = [];
  for (const seg of segments) {
    if (seg.kind === 'verbatim') {
      parts.push(seg.text);
    } else {
      parts.push(await translateProseNode(seg.text, lang, translator, cache));
    }
  }
  return parts.join('');
}

/**
 * Translate a visible text node while preserving its leading/trailing
 * whitespace (whitespace is structural in Markdown — collapsing it would break
 * paragraph and tag spacing). We translate only the trimmed core.
 */
async function translateProseNode(
  text: string,
  lang: Lang,
  translator: Translator,
  cache: TranslationCache,
): Promise<string> {
  const lead = text.match(/^\s*/)?.[0] ?? '';
  const trail = text.match(/\s*$/)?.[0] ?? '';
  const core = text.slice(lead.length, text.length - trail.length);
  if (!core) return text; // pure whitespace
  const translated = await translateCached(core, lang, translator, cache);
  return lead + translated + trail;
}

// ---------------------------------------------------------------------------
// Entry translation
// ---------------------------------------------------------------------------

interface EntryStats {
  written: boolean;
  skipped: boolean;
}

async function translateEntry(
  srcAbs: string,
  relPath: string,
  lang: Lang,
  translator: Translator,
  cache: TranslationCache,
  force: boolean,
): Promise<EntryStats> {
  const outAbs = join(DOCS_ROOT, lang, 'catalog', relPath);

  // Resumable: skip an entry whose output already exists, unless --force.
  if (!force && existsSync(outAbs)) {
    return { written: false, skipped: true };
  }

  const source = readFileSync(srcAbs, 'utf8');
  const { fm, body } = splitFrontmatter(source);

  // Parse frontmatter as YAML; translate only the free-text fields.
  const data = (yaml.load(fm) ?? {}) as Record<string, unknown>;
  for (const field of TRANSLATABLE_FIELDS) {
    const v = data[field];
    if (typeof v === 'string' && v.trim()) {
      data[field] = await translateCached(v, lang, translator, cache);
    }
  }
  // Add the provenance flag. `title` and all other fields are left unchanged.
  data.machine_translated = true;

  const newFm = serializeFrontmatter(data);
  const newBody = await translateBody(body, lang, translator, cache);

  const out = `${newFm}\n${newBody}`;
  mkdirSync(dirname(outAbs), { recursive: true });
  writeFileSync(outAbs, out, 'utf8');
  return { written: true, skipped: false };
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

/**
 * Recursively collect English source entries under src/content/docs/catalog,
 * INCLUDING datasets/, EXCLUDING index.mdx. Returns relative paths (so the same
 * relative path can be reused under es/ and ar/).
 */
function collectEntries(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(abs);
      } else if (ent.isFile() && ent.name.endsWith('.mdx') && ent.name !== 'index.mdx') {
        out.push(relative(SRC_CATALOG, abs));
      }
    }
  };
  walk(SRC_CATALOG);
  out.sort(); // deterministic order
  return out;
}

// ---------------------------------------------------------------------------
// Tiny p-limit-style concurrency helper (no new deps)
// ---------------------------------------------------------------------------

/**
 * Run `tasks` with at most `limit` in flight at once. Preserves no ordering
 * guarantees on completion, but each task's side effects (file write, cache
 * set) are independent, so order doesn't matter.
 */
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners: Promise<void>[] = [];
  const next = async (): Promise<void> => {
    while (cursor < items.length) {
      const idx = cursor++;
      await worker(items[idx]);
    }
  };
  for (let i = 0; i < Math.min(limit, items.length); i++) runners.push(next());
  await Promise.all(runners);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  if (!existsSync(SRC_CATALOG)) {
    fail(`source catalog not found at ${SRC_CATALOG}`);
  }

  // Pick the translator. Dry-run (identity) is the default and touches no network.
  const translator: Translator = opts.dryRun
    ? new IdentityTranslator(opts.tag)
    : new AnthropicTranslator(opts.model);

  // Discover and filter entries.
  let entries = collectEntries();
  if (opts.filter) entries = entries.filter((p) => p.includes(opts.filter!));
  if (opts.limit !== null) entries = entries.slice(0, opts.limit);

  console.log(
    `translate-catalog: ${entries.length} source entr${entries.length === 1 ? 'y' : 'ies'} → ` +
      `langs [${opts.langs.join(', ')}], ` +
      `mode ${opts.dryRun ? `dry-run${opts.tag ? ' (tagged)' : ''}` : `provider=anthropic model=${opts.model}`}, ` +
      `concurrency ${opts.concurrency}${opts.force ? ', force' : ''}`,
  );

  let totalWritten = 0;
  let totalSkipped = 0;

  for (const lang of opts.langs) {
    const cache = new TranslationCache(lang);
    let written = 0;
    let skipped = 0;

    // Batch entries so we can persist the cache after each batch (resumability
    // + bounded loss if interrupted). Batch size tracks the concurrency limit.
    const batchSize = Math.max(opts.concurrency, 1);
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      await runWithConcurrency(batch, opts.concurrency, async (relPath) => {
        const srcAbs = join(SRC_CATALOG, relPath);
        try {
          const stats = await translateEntry(srcAbs, relPath, lang, translator, cache, opts.force);
          if (stats.written) written++;
          if (stats.skipped) skipped++;
        } catch (err) {
          fail(`failed on ${relPath} (${lang}): ${String(err)}`);
        }
      });
      cache.flush(); // persist after each batch
    }
    cache.flush();

    console.log(
      `  ${lang}: wrote ${written}, skipped ${skipped} (existing) — ` +
        `cache hits ${cache.hits}, misses ${cache.misses}`,
    );
    totalWritten += written;
    totalSkipped += skipped;
  }

  console.log(
    `translate-catalog: done — ${totalWritten} file(s) written, ${totalSkipped} skipped across ${opts.langs.length} lang(s).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
