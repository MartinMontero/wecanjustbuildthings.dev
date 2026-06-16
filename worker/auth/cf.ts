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
