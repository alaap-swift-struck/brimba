-- Global core: the people. (Teams + memberships arrive in the next migration.)
-- Note: the users table has no audit-actor block — people manage themselves.
CREATE TABLE users (
  id TEXT PRIMARY KEY,                -- ULID (time-sortable, globally unique)
  email TEXT NOT NULL UNIQUE,         -- always stored trimmed + lowercased
  google_sub TEXT UNIQUE,             -- Google's permanent id; NULL = email-only user
  first_name TEXT,
  last_name TEXT,
  image_url TEXT,
  onboarding_completed_at TEXT,       -- NULL until the onboarding screen is done
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deactivated_at TEXT                 -- soft-deactivate, never hard-delete (locked rule)
);

-- One-time 6-digit login codes (the only proof needed for email sign-in).
CREATE TABLE login_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,            -- sha256(code:email) — never the raw code
  attempts INTEGER NOT NULL DEFAULT 0,-- wrong guesses; locked after 5
  expires_at TEXT NOT NULL,           -- 10 minutes after creation
  consumed_at TEXT,                   -- set when successfully used
  created_at TEXT NOT NULL
);
CREATE INDEX idx_login_codes_email ON login_codes (email, created_at);

-- Browser sessions. The cookie holds a random token; we store only its hash.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,           -- 30 days, slides forward while in use
  last_seen_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions (user_id);
