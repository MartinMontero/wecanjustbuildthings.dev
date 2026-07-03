/**
 * Minimal hand-typed surface of the Cloudflare bindings auth uses — mirroring how
 * `Env.ASSETS` is typed in worker/index.ts, so we don't pull in the full
 * @cloudflare/workers-types package for three methods. Only what we call is typed;
 * if a future phase needs more of the API, widen it here deliberately.
 */

export interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<D1Result>;
  all<T = unknown>(): Promise<D1Result<T>>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

/**
 * Cloudflare's native rate-limiting binding (declared in `wrangler.jsonc`
 * `ratelimits`). The `simple` limiter counts in-memory per-colo — it never
 * writes to KV — so it can guard the unauthenticated KV-writing sign-in
 * endpoints without adding to the very write budget it protects.
 */
export interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/**
 * Minimal Durable Object surface used by the admin coordinator (`ADMIN_COORD`,
 * a SQLite-backed DO declared in `wrangler.jsonc`). We use the KV-style storage
 * API (get/put/delete) for the small, strongly-consistent coordinator state, so
 * the test double stays a faithful in-memory map. Classic constructor shape
 * (`(state, env)` + `fetch`) — no `cloudflare:workers` import — keeps this in the
 * same hand-typed lane as the bindings above (no @cloudflare/workers-types).
 */
export interface DurableObjectId {
  toString(): string;
}
export interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}
export interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}
export interface DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T = unknown>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
}
export interface DurableObjectState {
  storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}
