/**
 * build-session.ts — the connective tissue.
 *
 * One client-side object that every part of the build flow reads and writes:
 * the Mentor Engine (Movement 1), the Catalog evidence layer + blueprint
 * (Movement 2), the inline Skills Creator (Movement 3), and the Build Studio
 * handoff (Movement 4). It is what turns four destinations into one path.
 *
 * Privacy-preserving by construction: it lives only in the browser
 * (localStorage), never leaves the device, and carries nothing but the
 * builder's own inputs and the deterministic results derived from them.
 *
 * Framework-agnostic on purpose — Astro mounts each interactive widget as a
 * separate island with its own runtime, so shared state cannot live inside any
 * one Svelte component. It lives here, with change notifications over a window
 * event (same document) and the storage event (other tabs).
 */

import type { UsageProfile, CostEstimate } from '../modules/cost-estimator/core/types.ts';

export interface SessionReceipt {
  license?: string;
  commitSha?: string | null;
  sourceUrl?: string | null;
  verification?: string;
  advisory?: string | null;
}

export interface SessionStackItem {
  capId: string;
  name: string;
  reason?: string;
  receipt?: SessionReceipt;
  catalogUrl?: string;
}

export interface SessionSkill {
  name: string;
  description: string;
  source?: string;
  license?: string;
  /** The method, one step per entry — kept so the skill reconstructs on reload. */
  steps?: string[];
  body: string;
}

/** The converged real problem the Mentor Engine reflects back (Movement 1). */
export interface SessionConverged {
  statement: string;
  constraints: string[];
  signals: string[];
}

/** A vetted Goose extension chosen for the build. Sourced (allowlisted) from the
 *  Catalog in Slice B; kept here so the recipe serializer can reference it. */
export interface SessionExtension {
  /** Slug of the verified Catalog entry this came from (the trust anchor). */
  catalogId: string;
  name: string;
  /** Resolved from the Catalog, never user-typed. */
  kind: 'builtin' | 'mcp_stdio' | 'mcp_sse';
}

/** Deterministic structured-reflection output (Movement 1 ↔ Goose). Written by the
 *  Mentor Engine in Slice D from a `response.json_schema`-conformant result the builder
 *  brings back from their own Goose run — never an LLM call from the platform. */
export interface SessionMentorReflection {
  schemaVersion: 1;
  constraints: string[];
  proposals: Array<{ action: 'add' | 'swap' | 'remove'; name: string; why: string }>;
}

export interface BuildSession {
  v: 1;
  updatedAt: string;
  /** Where the builder is in the arc — drives persistent wayfinding. */
  movement: 1 | 2 | 3 | 4;
  /** Movement 1 — raw intent + adaptive Socratic answers. */
  intent: {
    projectName: string;
    problem: string;
    goal: string;
    success: string;
    protocols: string[];
    answers: Record<string, string | string[]>;
  };
  /** Movement 1 — the reflected-back, converged problem (deterministic). */
  converged: SessionConverged | null;
  /** Movement 2 — the builder's edits to the recommended blueprint. */
  adjustments: {
    swaps: Record<string, string>;
    removed: string[];
    extra: string[];
  };
  /** Movement 2 — the resolved stack, each tool with rationale + receipt. */
  stack: SessionStackItem[];
  /** Movement 3 — domain knowledge captured as agent skills. */
  skills: SessionSkill[];
  /** A tool seeded from the Catalog's "Build with this". */
  seededTool: string | null;
  /** Movement 4 — chosen handoff method. */
  handoff: string;
  /** Hosting Cost Estimator — its inputs (read by the estimator, filled from
   *  derivation + manual override) and its results (written back, timestamped),
   *  so downstream components can consume the estimate. Optional and
   *  v1-compatible: absent until the builder opens the estimator. */
  usage?: UsageProfile | null;
  costEstimate?: CostEstimate | null;
  /** Vetted Goose extensions chosen for the build (Catalog-allowlisted, Slice B). */
  extensions: SessionExtension[];
  /** Deterministic structured-reflection result (Slice D); null until a run returns. */
  mentorReflection: SessionMentorReflection | null;
}

const KEY = 'wcb.build-session.v1';
const EVENT = 'wcb:session-change';

export function defaultSession(): BuildSession {
  return {
    v: 1,
    updatedAt: new Date(0).toISOString(),
    movement: 1,
    intent: { projectName: '', problem: '', goal: '', success: '', protocols: [], answers: {} },
    converged: null,
    adjustments: { swaps: {}, removed: [], extra: [] },
    stack: [],
    skills: [],
    seededTool: null,
    handoff: 'zip',
    usage: null,
    costEstimate: null,
    extensions: [],
    mentorReflection: null,
  };
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

const asStringRecord = (v: unknown): Record<string, string> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'string') out[k] = val;
  }
  return out;
};

/** Mentor answers: each value is free-text (string) or a multi-select (string[]). */
const asAnswers = (v: unknown): Record<string, string | string[]> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, string | string[]> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'string') out[k] = val;
    else if (Array.isArray(val)) out[k] = val.filter((x): x is string => typeof x === 'string');
  }
  return out;
};

const asConverged = (v: unknown): SessionConverged | null => {
  if (!v || typeof v !== 'object') return null;
  const c = v as Partial<SessionConverged>;
  if (typeof c.statement !== 'string') return null;
  return { statement: c.statement, constraints: asStringArray(c.constraints), signals: asStringArray(c.signals) };
};

const asMovement = (v: unknown): 1 | 2 | 3 | 4 => (v === 2 || v === 3 || v === 4 ? v : 1);

const EXTENSION_KINDS = ['builtin', 'mcp_stdio', 'mcp_sse'] as const;
const asExtensions = (v: unknown): SessionExtension[] => {
  if (!Array.isArray(v)) return [];
  const out: SessionExtension[] = [];
  for (const e of v) {
    if (!e || typeof e !== 'object') continue;
    const x = e as Record<string, unknown>;
    if (typeof x.catalogId !== 'string' || typeof x.name !== 'string') continue;
    if (!(EXTENSION_KINDS as readonly string[]).includes(x.kind as string)) continue;
    out.push({ catalogId: x.catalogId, name: x.name, kind: x.kind as SessionExtension['kind'] });
  }
  return out;
};

const PROPOSAL_ACTIONS = ['add', 'swap', 'remove'] as const;
const asMentorReflection = (v: unknown): SessionMentorReflection | null => {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  if (r.schemaVersion !== 1) return null;
  const proposals: SessionMentorReflection['proposals'] = [];
  if (Array.isArray(r.proposals)) {
    for (const item of r.proposals) {
      if (!item || typeof item !== 'object') continue;
      const pr = item as Record<string, unknown>;
      if (!(PROPOSAL_ACTIONS as readonly string[]).includes(pr.action as string)) continue;
      if (typeof pr.name !== 'string' || typeof pr.why !== 'string') continue;
      proposals.push({ action: pr.action as 'add' | 'swap' | 'remove', name: pr.name, why: pr.why });
    }
  }
  return { schemaVersion: 1, constraints: asStringArray(r.constraints), proposals };
};

/**
 * Coerce arbitrary stored JSON into a valid BuildSession, filling any missing
 * keys from the default. Forward-only: anything that isn't v1 starts fresh.
 *
 * localStorage is writable by the user, browser extensions, and any same-origin
 * script, so every field is normalised to its declared type rather than trusted —
 * notably the ones consumers feed straight into `new Set(...)` (intent.protocols,
 * converged.constraints/signals), where a non-iterable would otherwise throw.
 */
export function migrate(parsed: unknown): BuildSession {
  const d = defaultSession();
  if (!parsed || typeof parsed !== 'object') return d;
  const p = parsed as Partial<BuildSession>;
  if (p.v !== 1) return d;
  return {
    ...d,
    ...p,
    v: 1,
    updatedAt: asString(p.updatedAt) || d.updatedAt,
    movement: asMovement(p.movement),
    intent: {
      projectName: asString(p.intent?.projectName),
      problem: asString(p.intent?.problem),
      goal: asString(p.intent?.goal),
      success: asString(p.intent?.success),
      protocols: asStringArray(p.intent?.protocols),
      answers: asAnswers(p.intent?.answers),
    },
    converged: asConverged(p.converged),
    adjustments: {
      swaps: asStringRecord(p.adjustments?.swaps),
      removed: asStringArray(p.adjustments?.removed),
      extra: asStringArray(p.adjustments?.extra),
    },
    stack: Array.isArray(p.stack) ? p.stack : [],
    skills: Array.isArray(p.skills) ? p.skills : [],
    seededTool: typeof p.seededTool === 'string' ? p.seededTool : null,
    handoff: asString(p.handoff) || d.handoff,
    usage: p.usage ?? null,
    costEstimate: p.costEstimate ?? null,
    extensions: asExtensions(p.extensions),
    mentorReflection: asMentorReflection(p.mentorReflection),
  };
}

export function loadSession(): BuildSession {
  if (!isBrowser()) return defaultSession();
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? migrate(JSON.parse(raw)) : defaultSession();
  } catch {
    return defaultSession();
  }
}

export function saveSession(session: BuildSession): BuildSession {
  const next = { ...session, v: 1 as const, updatedAt: new Date().toISOString() };
  if (!isBrowser()) return next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage full or unavailable — degrade silently, flow still works in-memory */
  }
  window.dispatchEvent(new CustomEvent<BuildSession>(EVENT, { detail: next }));
  return next;
}

export function updateSession(
  patch: Partial<BuildSession> | ((s: BuildSession) => BuildSession),
): BuildSession {
  const current = loadSession();
  const next = typeof patch === 'function' ? patch(current) : { ...current, ...patch };
  return saveSession(next);
}

export function clearSession(): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent<BuildSession>(EVENT, { detail: defaultSession() }));
}

/** Has the builder started a session worth resuming? */
export function hasSession(): boolean {
  if (!isBrowser()) return false;
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

/** Subscribe to changes from this tab (window event) and others (storage event). */
export function subscribeSession(cb: (s: BuildSession) => void): () => void {
  if (!isBrowser()) return () => {};
  const onEvent = (e: Event) => cb((e as CustomEvent<BuildSession>).detail ?? loadSession());
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb(loadSession());
  };
  window.addEventListener(EVENT, onEvent);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, onEvent);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * Add or remove a Catalog tool from the build via the `adjustments.extra` channel the
 * Build Studio restores on mount (see BuildStudio.svelte). Adding also seeds the tool
 * so the Studio opens at it; removing the current seed clears it. Pure — the Catalog
 * island calls `updateSession((s) => toggleExtraTool(s, name))`.
 */
export function toggleExtraTool(session: BuildSession, name: string): BuildSession {
  const has = session.adjustments.extra.includes(name);
  const extra = has
    ? session.adjustments.extra.filter((n) => n !== name)
    : [...session.adjustments.extra, name];
  const seededTool = has ? (session.seededTool === name ? null : session.seededTool) : name;
  return { ...session, adjustments: { ...session.adjustments, extra }, seededTool };
}
