/** Shared types for the three-layer enforcement engine. */

export type Ecosystem =
  | 'js'
  | 'rust'
  | 'py'
  | 'go'
  | 'elixir'
  | 'dart'
  | 'ruby'
  | 'kotlin'
  | 'swift'
  | 'php'
  | 'other';

/** A loaded excluded-organization record. Empty arrays default for omitted fields. */
export interface ExcludedOrg {
  key: string;
  display_name: string;
  /** True for excluded orgs that are selectable LLM providers (drives recipe checks). */
  llm_provider: boolean;
  github_orgs: string[];
  npm_scopes: string[];
  npm_packages: string[];
  pypi_maintainers: string[];
  pypi_packages: string[];
  crates_publishers: string[];
  crates_packages: string[];
  hex_publishers: string[];
  hex_packages: string[];
  rubygems_authors: string[];
  rubygems_packages: string[];
  maven_groups: string[];
  pub_publishers: string[];
  pub_packages: string[];
  go_module_prefixes: string[];
}

export interface ProviderSignals {
  key: string;
  endpoints: string[];
  imports: Partial<Record<string, string[]>>;
  config_keys: string[];
}

/** A dependency as declared in a manifest or resolved in a lockfile. */
export interface DependencyRef {
  name: string;
  version?: string;
  ecosystem: Ecosystem;
  /** npm scope, Maven group, etc. — used by the matcher when set. */
  scope?: string;
  source_file: string;
  dep_type?: string;
}

export interface ChainNode {
  name: string;
  version?: string;
}

export interface PolicyMatch {
  org_key: string;
  signal: string;
  matched_value: string;
}

export interface Layer1Finding extends PolicyMatch {
  manifest_file: string;
  dependency: string;
  dep_type?: string;
}

export interface Layer2Finding extends PolicyMatch {
  lockfile: string;
  excluded_package: string;
  /** entry → … → excluded. A single node when the lockfile carries no edges. */
  chain: ChainNode[];
  /** false ⇒ closure-only lockfile (presence proven, chain not reconstructable). */
  chain_known: boolean;
}

export interface Layer3Finding {
  file: string;
  line: number;
  column: number;
  signal_kind: 'endpoint' | 'import' | 'config_key';
  org_key: string;
  matched_text: string;
}

export interface RecipeFinding {
  recipe_file: string;
  status: 'pass' | 'block';
  errors: string[];
  warnings: string[];
}

export interface LayerReport<T> {
  layer: 1 | 2 | 3;
  status: 'pass' | 'block';
  findings: T[];
  warnings: string[];
  scanned: number;
  generated_at: string;
}

/** A lockfile parse result: the closure of packages, plus edges when available. */
export interface LockGraph {
  ecosystem: Ecosystem;
  lockfile: string;
  /** All packages in the closure, keyed `name@version`. */
  nodes: Map<string, ChainNode>;
  /** Adjacency: `name@version` → dependency keys. Empty for closure-only formats. */
  edges: Map<string, string[]>;
  /** Roots (direct deps / importers) when known. */
  roots: string[];
  /** false for closure-only formats (pubspec.lock, gradle.lockfile, …). */
  edges_known: boolean;
  warnings: string[];
}
