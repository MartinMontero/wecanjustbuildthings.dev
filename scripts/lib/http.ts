import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CACHE_DIR = '.fetch-cache';
const USER_AGENT = 'wecanjustbuildthings/1.0 (+https://wecanjustbuildthings.dev)';

export interface FetchResult {
  ok: boolean;
  status: number;
  json: unknown;
  text: string;
}

function cachePath(url: string): string {
  return join(CACHE_DIR, `${createHash('sha256').update(url).digest('hex').slice(0, 32)}.json`);
}

/** Cached GET with polite headers, retries, and optional GitHub auth. */
export async function getCached(url: string, opts: { auth?: boolean; retries?: number } = {}): Promise<FetchResult> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const file = cachePath(url);
  if (existsSync(file)) {
    return JSON.parse(readFileSync(file, 'utf8')) as FetchResult;
  }

  const headers: Record<string, string> = { 'User-Agent': USER_AGENT, Accept: 'application/json' };
  const token = process.env.GITHUB_TOKEN;
  if (opts.auth && token) headers.Authorization = `Bearer ${token}`;

  const retries = opts.retries ?? 3;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, { headers });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* not json */
      }
      const result: FetchResult = { ok: res.ok, status: res.status, json, text };
      // Cache only genuinely-useful responses: a parsed-JSON success, or a
      // definitive 404. A 200 that isn't JSON (WAF/captive-portal/proxy HTML)
      // must NOT be cached, or it poisons every later run for that URL.
      if ((res.ok && json !== null) || res.status === 404) {
        writeFileSync(file, JSON.stringify(result), 'utf8');
      }
      if (res.status === 403 || res.status === 429) {
        // Rate limited. Only back off and retry when we have a token that can
        // actually raise the limit; otherwise fail fast so the caller degrades
        // gracefully (e.g. mark the entry under_review) instead of stalling.
        if (opts.auth && token && attempt < retries) {
          await sleep(2000 * 2 ** attempt);
          continue;
        }
        return result;
      }
      return result;
    } catch (err) {
      lastErr = err;
      await sleep(1000 * 2 ** attempt);
    }
  }
  return { ok: false, status: 0, json: null, text: String(lastErr) };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
