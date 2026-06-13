import { loadExcludedOrgs, loadProviderSignals } from './config.ts';
import { runCatalogLayer1 } from './catalog-check.ts';
import { runLayer1OnTree } from './layer1-direct/index.ts';
import { runLayer2OnTree } from './layer2-transitive/index.ts';
import { runLayer3OnTree } from './layer3-provider-strings/scanner.ts';
import { validateRecipe } from './layer3-provider-strings/recipe-validator.ts';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseFrontmatter, readDocEntries, type DocEntry } from './frontmatter.ts';
import { block, dim, heading, pass, warn, writeJsonReport } from './report.ts';
import type { ExcludedOrg, ProviderSignals } from './types.ts';

interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
    } else {
      positionals.push(token);
    }
  }
  return { positionals, flags };
}

const USAGE = `wecanjustbuildthings enforcement engine

Usage:
  tsx enforcement/cli.ts <command> [options]

Commands:
  layer1     Direct-dependency / catalog-entry org check
  layer2     Transitive lockfile walk (requires --tree)
  layer3     Provider-string scan and/or recipe validation
  all        Catalog + recipes (+ tree scans if --tree given)
  recipe     Validate a single recipe file (positional path)

Options:
  --catalog <dir>     Catalog directory (frontmatter checks)
  --recipes <dir>     Recipes directory (recipe validation)
  --tree <dir>        Source tree to scan (manifests, lockfiles, provider strings)
  --report-dir <dir>  Where to write JSON reports (default: reports/enforcement)
  --max-depth <n>     (reserved) transitive walk depth
  --workers <n>       (reserved) parallel walk workers
`;

const { positionals, flags } = parseArgs(process.argv.slice(2));
const command = positionals[0] ?? 'all';

const orgs: ExcludedOrg[] = loadExcludedOrgs();
const signals: ProviderSignals[] = loadProviderSignals();
const catalogDir = typeof flags.catalog === 'string' ? flags.catalog : undefined;
const recipesDir = typeof flags.recipes === 'string' ? flags.recipes : undefined;
const treeDir = typeof flags.tree === 'string' ? flags.tree : undefined;
const reportDir = typeof flags['report-dir'] === 'string' ? flags['report-dir'] : 'reports/enforcement';

let hadBlock = false;
let didWork = false;

function doLayer1(): void {
  if (catalogDir) {
    didWork = true;
    heading(`Layer 1 — catalog entries (${catalogDir})`);
    const report = runCatalogLayer1(catalogDir, orgs);
    writeJsonReport(`${reportDir}/layer1-catalog.json`, report);
    for (const f of report.findings) {
      block(`${f.manifest_file}: "${f.dependency}" → ${f.org_key} (${f.signal}: ${f.matched_value})`);
    }
    for (const w of report.warnings) warn(w);
    if (report.status === 'pass') pass(`${report.scanned} catalog entries clean`);
    else hadBlock = true;
  }
  if (treeDir) {
    heading(`Layer 1 — manifests in tree (${treeDir})`);
    const report = runLayer1OnTree(treeDir, orgs);
    writeJsonReport(`${reportDir}/layer1-tree.json`, report);
    for (const f of report.findings) {
      block(`${f.manifest_file}: "${f.dependency}" (${f.dep_type}) → ${f.org_key} (${f.signal}: ${f.matched_value})`);
    }
    for (const w of report.warnings) warn(w);
    if (report.status === 'pass') pass(`${report.scanned} manifests clean`);
    else hadBlock = true;
  }
  if (!catalogDir && !treeDir) warn('layer1: nothing to do (pass --catalog and/or --tree)');
}

function doLayer2(): void {
  if (!treeDir) {
    warn('layer2: transitive walk needs a source tree with lockfiles (pass --tree)');
    return;
  }
  didWork = true;
  heading(`Layer 2 — transitive lockfile walk (${treeDir})`);
  const report = runLayer2OnTree(treeDir, orgs);
  writeJsonReport(`${reportDir}/layer2-tree.json`, report);
  for (const f of report.findings) {
    const chain = f.chain.map((n) => (n.version ? `${n.name}@${n.version}` : n.name)).join(' → ');
    const suffix = f.chain_known ? '' : '  [closure-only: chain not reconstructable]';
    block(`${f.lockfile}: ${chain} → ${f.org_key}${suffix}`);
  }
  for (const w of report.warnings) warn(w);
  if (report.status === 'pass') pass(`${report.scanned} lockfiles clean`);
  else hadBlock = true;
}

function loadCatalogEntries(): DocEntry[] {
  return catalogDir ? readDocEntries(catalogDir) : [];
}

function doRecipes(): void {
  if (!recipesDir) return;
  didWork = true;
  heading(`Recipes — provider-lockdown contract (${recipesDir})`);
  const catalog = loadCatalogEntries();
  const recipes = readDocEntries(recipesDir).filter((e) => e.frontmatter.entry_type === 'recipe');
  for (const recipe of recipes) {
    const finding = validateRecipe(recipe, { catalog, orgs, signals });
    writeJsonReport(`${reportDir}/recipe-${recipe.slug}.json`, finding);
    if (finding.status === 'pass') pass(`${recipe.file}`);
    else {
      hadBlock = true;
      block(`${recipe.file}`);
      for (const e of finding.errors) dim(`    error: ${e}`);
    }
    for (const w of finding.warnings) warn(`    ${w}`);
  }
  if (recipes.length === 0) dim('  (no recipes found)');
}

function doLayer3(): void {
  if (treeDir) {
    didWork = true;
    heading(`Layer 3 — provider-string scan (${treeDir})`);
    const report = runLayer3OnTree(treeDir, signals);
    writeJsonReport(`${reportDir}/layer3-tree.json`, report);
    for (const f of report.findings) {
      block(`${f.file}:${f.line}:${f.column} ${f.org_key} (${f.signal_kind}): ${f.matched_text}`);
    }
    for (const w of report.warnings) warn(w);
    if (report.status === 'pass') pass(`${report.scanned} files clean`);
    else hadBlock = true;
  }
  doRecipes();
  if (!treeDir && !recipesDir) warn('layer3: nothing to do (pass --tree and/or --recipes)');
}

function doRecipeFile(path: string | undefined): void {
  if (!path) {
    console.error('recipe: provide a path to a recipe file');
    process.exitCode = 2;
    return;
  }
  heading(`Recipe — ${path}`);
  didWork = true;
  let entry: DocEntry;
  try {
    const content = readFileSync(path, 'utf8');
    entry = { slug: basename(path).replace(/\.mdx?$/, ''), file: path, frontmatter: parseFrontmatter(content) };
  } catch {
    block(`${path}: could not read recipe`);
    hadBlock = true;
    return;
  }
  const finding = validateRecipe(entry, { catalog: loadCatalogEntries(), orgs, signals });
  if (finding.status === 'pass') pass(path);
  else {
    hadBlock = true;
    for (const e of finding.errors) dim(`    error: ${e}`);
  }
  for (const w of finding.warnings) warn(`    ${w}`);
}

switch (command) {
  case 'layer1':
    doLayer1();
    break;
  case 'layer2':
    doLayer2();
    break;
  case 'layer3':
    doLayer3();
    break;
  case 'recipe':
    doRecipeFile(positionals[1]);
    break;
  case 'all':
    doLayer1();
    doLayer2();
    doLayer3();
    break;
  default:
    console.log(USAGE);
    process.exitCode = 2;
}

const KNOWN_COMMANDS = new Set(['layer1', 'layer2', 'layer3', 'recipe', 'all']);

if (hadBlock) {
  console.log('');
  block('Enforcement failed: one or more entries violate the exclusion policy.');
  process.exitCode = 1;
} else if (KNOWN_COMMANDS.has(command) && !didWork) {
  // A real command ran but had nothing to scan (no --catalog/--tree/--recipes).
  // Do not report a misleading "passed" — that masks a misconfigured CI step.
  console.log('');
  warn('Nothing was scanned. Pass --catalog, --tree, and/or --recipes.');
  process.exitCode = 2;
} else if (KNOWN_COMMANDS.has(command)) {
  console.log('');
  pass('Enforcement passed.');
}
