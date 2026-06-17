-- Email-change flow (locked: a 6-digit code goes to the NEW email; on verify we
-- switch users.email and write an audit row). Both tables are GLOBAL core —
-- identity lives here, not in any team's database.

-- Pending email-change requests. The code is hashed (never stored raw), tied to
-- the user AND the target email, and consumed on success. Kept SEPARATE from
-- login_codes on purpose: an email-change code can never be replayed to sign in.
CREATE TABLE email_change_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  new_email TEXT NOT NULL,            -- always stored trimmed + lowercased
  code_hash TEXT NOT NULL,            -- sha256(code:new_email) — never the raw code
  attempts INTEGER NOT NULL DEFAULT 0,-- wrong guesses; locked after 5
  expires_at TEXT NOT NULL,           -- 10 minutes after creation
  consumed_at TEXT,                   -- set when successfully used
  created_at TEXT NOT NULL
);
CREATE INDEX idx_email_change_codes_user ON email_change_codes (user_id, created_at);

-- Completed email changes — the audit trail (like Base v3's "email change logs").
CREATE TABLE email_change_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  old_email TEXT NOT NULL,
  new_email TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_email_change_logs_user ON email_change_logs (user_id, created_at);
