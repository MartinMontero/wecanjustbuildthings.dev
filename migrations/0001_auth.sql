-- 0001_auth.sql — identity model for Sign in with Nostr / Bluesky.
--
-- A `user` is the account; an `identity` is one way to prove you're that user
-- (a Nostr pubkey, or a Bluesky DID). One user MAY have several identities — but
-- linking a second identity to an existing account is a documented v2 seam, NOT
-- built in v1 (each sign-in resolves to exactly one identity → one user).
--
-- Privacy by design: we store the minimum to recognise a returning user — the
-- provider + subject (pubkey/DID) and an optional display name. No emails, no
-- handles-as-identifiers, no tokens, no profile data.

CREATE TABLE users (
  id           TEXT PRIMARY KEY,        -- opaque random id, not derived from any identity
  created_at   INTEGER NOT NULL,        -- epoch ms
  display_name TEXT                     -- optional, user-facing only; never an identifier
);

CREATE TABLE identities (
  provider   TEXT    NOT NULL,          -- 'nostr' | 'bluesky'
  subject    TEXT    NOT NULL,          -- nostr: hex pubkey; bluesky: did
  user_id    TEXT    NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (provider, subject)       -- one identity proves exactly one user
);

CREATE INDEX idx_identities_user ON identities(user_id);
