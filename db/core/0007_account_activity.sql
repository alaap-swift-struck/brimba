-- Account-level (personal) activity — identity events that are NOT tied to any
-- team: name, photo, and email changes. Lives in the GLOBAL core DB next to the
-- users + email_change_logs rows it describes (identity lives in core, never in
-- a team database). The actor is always the user themselves, so there is no
-- actor-snapshot block (unlike the per-team activity table).
CREATE TABLE account_activity (
  id TEXT PRIMARY KEY,                 -- ULID
  user_id TEXT NOT NULL REFERENCES users (id),
  type TEXT NOT NULL,                  -- 'name_changed' | 'photo_changed' | 'email_changed'
  description TEXT NOT NULL,           -- human sentence shown in the feed
  created_at TEXT NOT NULL
);
CREATE INDEX idx_account_activity_user ON account_activity (user_id, created_at);
