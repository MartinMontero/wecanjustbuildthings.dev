/**
 * D1 data layer for staged catalog/content edits + the admin ACTION audit
 * (migrations-admin/0001_admin_storage.sql — the separate ADMIN_DB, never the
 * auth store). Used ONLY by the /api/admin/staging* routes in router.ts.
 *
 * Like roster.ts, every DB failure here THROWS — the routes surface it as an
 * explicit 5xx. A management surface must never render a partial view as if it
 * were complete.
 *
 * INSERT-ONLY AUDIT CONTRACT: admin_action_audit is written with INSERT and
 * nothing else — no code path in this repository issues UPDATE or DELETE
 * against it (pinned statically by worker/tests/admin-staging.test.ts, the
 * same contract worker/tests/admin-roster.test.ts pins for admin_audit).
 * Every mutation writes its row and its audit row in one db.batch() so
 * neither can land without the other.
 *
 * Lifecycle this slice: draft → ready → abandoned. 'pr-opened' belongs to the
 * future publish slice (which will also run the enforcement engine); nothing
 * here can set it. There is no hard DELETE — staging is a workbench, not an
 * archive: rows age out via expires_at (a 30-day TTL that slides on update),
 * and list/get treat an expired row as absent.
 */
import type { D1Database } from '../auth/cf.ts';

export const STAGED_KINDS = ['catalog-entry', 'skill', 'guide'] as const;
export type StagedKind = (typeof STAGED_KINDS)[number];
/** Everything the state COLUMN may hold. This slice writes only
 *  draft/ready/abandoned; 'pr-opened' is written by the future publish slice
 *  but must be readable (and treated as closed) the moment it exists. */
export type StagedState = 'draft' | 'ready' | 'abandoned' | 'pr-opened';

/** 30 days, sliding on every update — abandoned work ages out. */
export const STAGED_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Generous for hand-written MDX, far under D1's row ceiling. */
export const MAX_CONTENT_BYTES = 256 * 1024;
const SLUG = /^[a-z0-9][a-z0-9-]{0,127}$/;

export function isValidStagedKind(v: unknown): v is StagedKind {
  return typeof v === 'string' && (STAGED_KINDS as readonly string[]).includes(v);
}
export function isValidStagedSlug(v: unknown): v is string {
  return typeof v === 'string' && SLUG.test(v);
}
export function contentWithinLimit(v: string): boolean {
  return new TextEncoder().encode(v).length <= MAX_CONTENT_BYTES;
}

/** The list projection deliberately EXCLUDES content — a listing never needs
 *  draft bodies, and omitting them keeps the response small by construction. */
export interface StagedEditMeta {
  id: string;
  created_at: number;
  updated_at: number;
  author: string; // 'provider:subject' — a public identifier, never a token
  kind: StagedKind;
  slug: string;
  enforcement_status: 'pending' | 'pass' | 'fail';
  state: StagedState;
  expires_at: number;
}
export interface StagedEdit extends StagedEditMeta {
  content: string;
  enforcement_report: string | null;
  pr_url: string | null;
}

const META_COLS = 'id, created_at, updated_at, author, kind, slug, enforcement_status, state, expires_at';

/** Non-expired drafts, newest activity first. `author` narrows to one admin's
 *  own drafts (the role-'admin' view); omit it for the superadmin view. */
export async function listStagedEdits(db: D1Database, now: number, author?: string): Promise<StagedEditMeta[]> {
  const stmt = author
    ? db.prepare(`SELECT ${META_COLS} FROM staged_edits WHERE expires_at > ? AND author = ? ORDER BY updated_at DESC`).bind(now, author)
    : db.prepare(`SELECT ${META_COLS} FROM staged_edits WHERE expires_at > ? ORDER BY updated_at DESC`).bind(now);
  const { results } = await stmt.all<StagedEditMeta>();
  return results;
}

/** One full draft, or null if unknown OR expired (indistinguishable — an aged-out
 *  row is gone as far as the API is concerned). */
export async function getStagedEdit(db: D1Database, now: number, id: string): Promise<StagedEdit | null> {
  return await db
    .prepare(`SELECT ${META_COLS}, content, enforcement_report, pr_url FROM staged_edits WHERE id = ? AND expires_at > ?`)
    .bind(id, now)
    .first<StagedEdit>();
}

/** The audit INSERT every mutation batches with its own write. detail carries a
 *  static token derived from validated enums only — never free text, never content. */
function auditInsert(
  db: D1Database,
  a: { at: number; actor: string; action: string; target: string; detail: string | null },
) {
  return db
    .prepare('INSERT INTO admin_action_audit (id, at, actor, action, target, detail) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), a.at, a.actor, a.action, a.target, a.detail);
}

/** Insert a new draft + its 'staging.create' audit row atomically. The caller
 *  has already validated kind/slug/content through the exported validators. */
export async function createStagedEdit(
  db: D1Database,
  e: { id: string; author: string; kind: StagedKind; slug: string; content: string; now: number },
): Promise<void> {
  await db.batch([
    db.prepare(
      'INSERT INTO staged_edits (id, created_at, updated_at, author, kind, slug, content, enforcement_status, enforcement_report, state, pr_url, expires_at) '
      + "VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NULL, 'draft', NULL, ?)",
    ).bind(e.id, e.now, e.now, e.author, e.kind, e.slug, e.content, e.now + STAGED_TTL_MS),
    auditInsert(db, { at: e.now, actor: e.author, action: 'staging.create', target: e.id, detail: `kind:${e.kind}` }),
  ]);
}

/** Overwrite a draft's mutable fields + its 'staging.update' audit row
 *  atomically, sliding the TTL. The caller has fetched the row, enforced
 *  scoping, rejected abandoned drafts, and validated the merged values. */
export async function updateStagedEdit(
  db: D1Database,
  e: { id: string; slug: string; content: string; state: 'draft' | 'ready'; actor: string; now: number },
): Promise<void> {
  await db.batch([
    db.prepare('UPDATE staged_edits SET slug = ?, content = ?, state = ?, updated_at = ?, expires_at = ? WHERE id = ?')
      .bind(e.slug, e.content, e.state, e.now, e.now + STAGED_TTL_MS, e.id),
    auditInsert(db, { at: e.now, actor: e.actor, action: 'staging.update', target: e.id, detail: `state:${e.state}` }),
  ]);
}

/** Mark a draft abandoned + its 'staging.abandon' audit row atomically. The
 *  row stays until expires_at passes — soft-close, never a hard delete — and
 *  the TTL deliberately does NOT slide: abandonment starts the clock running out. */
export async function abandonStagedEdit(
  db: D1Database,
  e: { id: string; actor: string; now: number },
): Promise<void> {
  await db.batch([
    db.prepare("UPDATE staged_edits SET state = 'abandoned', updated_at = ? WHERE id = ?").bind(e.now, e.id),
    auditInsert(db, { at: e.now, actor: e.actor, action: 'staging.abandon', target: e.id, detail: null }),
  ]);
}
