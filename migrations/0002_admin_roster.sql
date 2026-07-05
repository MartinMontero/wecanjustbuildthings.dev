-- 0002_admin_roster.sql — runtime-managed ADMIN tier + insert-only audit.
--
-- Two-tier model: the committed allowlist (worker/admin/allowlist.ts) is the
-- file-rooted tier — PR-governed, immutable at runtime, and a COMPLETE
-- governance surface on its own (a fork may run its entire admin set through
-- PRs with this roster empty forever). This table holds the runtime-managed
-- ADMIN tier: mutable ONLY by file entries recorded role 'superadmin', via
-- /api/admin/admins, every mutation audit-logged. A subject present in the
-- file must never appear here (the API refuses); at role-resolution time the
-- file always wins. Roster membership grants role 'admin' — NEVER superadmin:
-- there is no runtime write-path to the superadmin set.
--
-- admin_audit is INSERT-ONLY by contract: no code path issues UPDATE or
-- DELETE against it (worker/tests/admin-roster.test.ts pins this statically).

CREATE TABLE admin_roster (
  provider TEXT    NOT NULL,           -- 'nostr' | 'bluesky'
  subject  TEXT    NOT NULL,           -- nostr: 64-hex pubkey (lowercase); bluesky: did
  added_by TEXT    NOT NULL,           -- acting superadmin, 'provider:subject'
  added_at INTEGER NOT NULL,           -- epoch ms
  note     TEXT,                       -- optional operator note ("who is this")
  PRIMARY KEY (provider, subject)
);

CREATE TABLE admin_audit (
  id       TEXT    PRIMARY KEY,        -- opaque random id
  at       INTEGER NOT NULL,           -- epoch ms
  actor    TEXT    NOT NULL,           -- acting superadmin, 'provider:subject'
  action   TEXT    NOT NULL,           -- 'admin.add' | 'admin.remove'
  provider TEXT    NOT NULL,           -- target principal
  subject  TEXT    NOT NULL,
  method   TEXT    NOT NULL,           -- 'cookie' | 'nip98'
  note     TEXT
);

CREATE INDEX idx_admin_audit_at ON admin_audit(at);
