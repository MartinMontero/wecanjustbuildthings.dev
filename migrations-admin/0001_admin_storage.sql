-- 0001_admin_storage.sql — admin-panel Phase 3: the ADMIN_DB schema.
--
-- PROVISIONED AND BOUND for this deployment (operator-authorized 2026-07-11):
-- database `wcjbt-admin`, bound as ADMIN_DB in wrangler.jsonc, this migration
-- applied remotely and the resulting tables/indexes verified. The schema was
-- reviewed as code (PR #53) BEFORE the resource was created. No code path
-- reads these tables yet — the Phase-3+ server slices land against them next.
--
-- Downstream deployers (this is AGPL software — run your own instance):
--   1. npx wrangler d1 create wcjbt-admin
--   2. paste the returned database_id into the ADMIN_DB entry in wrangler.jsonc
--   3. npx wrangler d1 migrations apply wcjbt-admin --remote
--
-- WHY A SEPARATE DATABASE (not more tables in wcjbt-auth): the runtime roster +
-- roster audit (migrations/0002) are auth-adjacent — WHO may sign in — and
-- correctly live with auth. Everything here is a different domain with a
-- different retention and legal posture: moderation casework and content
-- staging. Separation keeps the auth store small and auditable, and lets this
-- data carry its own lifecycle without ever touching sign-in state.
--
-- VALUES ENCODED IN THE SHAPE (empower + protect the builder/operator):
--   - Data minimization: rows hold public identifiers ('provider:subject' —
--     pubkeys/DIDs) and reference tokens ONLY. Never a session token, never
--     key material, never more of a report than the case needs.
--   - admin_action_audit is INSERT-ONLY by contract, mirroring admin_audit in
--     migrations/0002: no code path may UPDATE or DELETE it (pin statically in
--     tests, as worker/tests/admin-roster.test.ts does for 0002). An editable
--     audit trail is theater.
--   - Staged edits EXPIRE (expires_at is NOT NULL): staging is a workbench,
--     not an archive. Abandoned drafts age out instead of accumulating.
--   - CSAM/NCMEC evidence NEVER lives here. Phase 6 puts evidence in the
--     locked-down ADMIN_EVIDENCE R2 bucket with its own access logging; this
--     database holds only case coordination.
--   - Portability without lock-in (Phase 4): mod_labels maps 1:1 onto NIP-32
--     kind-1985 label events (MOD/X-MOD vocab per NIP-69), so Cloudflare stays
--     primary and the protocol layer is a switchable, default-off mirror.

-- ---- Catalog / content staging (admin-panel Phase 5 reads/writes this) ----
-- A draft catalog entry, skill, or guide edit being prepared in the console.
-- Publishing NEVER writes content directly to the site: the publish action runs
-- the enforcement engine, then opens a repository PR (the existing contribution
-- path) — state marks where in that flow the draft sits.
CREATE TABLE staged_edits (
  id                 TEXT    PRIMARY KEY,          -- opaque random id
  created_at         INTEGER NOT NULL,             -- epoch ms
  updated_at         INTEGER NOT NULL,
  author             TEXT    NOT NULL,             -- acting admin, 'provider:subject'
  kind               TEXT    NOT NULL,             -- 'catalog-entry' | 'skill' | 'guide'
  slug               TEXT    NOT NULL,             -- target slug/path being created or edited
  content            TEXT    NOT NULL,             -- the full draft body (MDX/YAML)
  enforcement_status TEXT    NOT NULL,             -- 'pending' | 'pass' | 'fail'
  enforcement_report TEXT,                         -- engine findings (JSON), shown to the author
  state              TEXT    NOT NULL,             -- 'draft' | 'ready' | 'pr-opened' | 'abandoned'
  pr_url             TEXT,                         -- once opened, the PR is the source of truth
  expires_at         INTEGER NOT NULL              -- drafts age out; staging is not archival
);
CREATE INDEX idx_staged_edits_author  ON staged_edits(author);
CREATE INDEX idx_staged_edits_expires ON staged_edits(expires_at);

-- ---- Trust & Safety casework (admin-panel Phase 6 reads/writes this) ----
-- One row per report/incident under review. subject_ref is a minimal reference
-- (URL, event id, or slug) — the case holds coordinates, not copies of content.
CREATE TABLE mod_cases (
  id          TEXT    PRIMARY KEY,                 -- opaque random id
  opened_at   INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  source      TEXT    NOT NULL,                    -- 'report' | 'sweep' | 'manual'
  subject_ref TEXT    NOT NULL,                    -- what is under review (reference only)
  reason      TEXT    NOT NULL,                    -- vocab token (NIP-56/NIP-69 style), not free prose
  state       TEXT    NOT NULL,                    -- 'open' | 'reviewing' | 'actioned' | 'dismissed'
  assignee    TEXT,                                -- reviewing admin, 'provider:subject'
  escalated   INTEGER NOT NULL DEFAULT 0           -- 1 = routed to the restricted Phase-6 path
);
CREATE INDEX idx_mod_cases_state ON mod_cases(state, updated_at);

-- The deterministic moderation outcome: label rows shaped as NIP-32 kind-1985
-- events (namespace MOD/X-MOD per NIP-69) so the Phase-4 exporter can publish
-- them verbatim when portability is switched on. Per NIP-69, later moderation
-- supersedes earlier — superseded_by links forward instead of rewriting history.
CREATE TABLE mod_labels (
  id            TEXT    PRIMARY KEY,               -- opaque random id
  case_id       TEXT    NOT NULL REFERENCES mod_cases(id),
  created_at    INTEGER NOT NULL,
  actor         TEXT    NOT NULL,                  -- labeling admin, 'provider:subject'
  namespace     TEXT    NOT NULL,                  -- 'MOD' | 'X-MOD'
  label         TEXT    NOT NULL,                  -- vocabulary value
  target        TEXT    NOT NULL,                  -- the labeled reference
  published     INTEGER NOT NULL DEFAULT 0,        -- Phase-4 exporter state (default off)
  superseded_by TEXT                               -- id of the label that replaces this one
);
CREATE INDEX idx_mod_labels_case ON mod_labels(case_id);

-- ---- Admin action audit (every phase writes this) ----
-- INSERT-ONLY. What an admin DID: staging publishes, case state changes, label
-- applications. detail carries static reason tokens only — never content bodies,
-- never session material. (Roster changes are audited in wcjbt-auth's
-- admin_audit, next to the roster itself.)
CREATE TABLE admin_action_audit (
  id     TEXT    PRIMARY KEY,                      -- opaque random id
  at     INTEGER NOT NULL,                         -- epoch ms
  actor  TEXT    NOT NULL,                         -- acting admin, 'provider:subject'
  action TEXT    NOT NULL,                         -- 'staging.create' | 'staging.publish' | 'case.open' | 'case.assign' | 'case.close' | 'label.apply' | 'label.supersede'
  target TEXT    NOT NULL,                         -- the acted-on id/ref
  detail TEXT                                      -- static reason token, optional
);
CREATE INDEX idx_admin_action_audit_at ON admin_action_audit(at);
