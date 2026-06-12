-- Google login was parked (2026-06-12): Brimba is strict email-OTP only.
-- google_sub was a UNIQUE column, which SQLite can't drop in place — so the
-- users table is rebuilt without it (standard SQLite column-removal pattern).

PRAGMA defer_foreign_keys = true;

CREATE TABLE users_new (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  first_name TEXT,
  last_name TEXT,
  image_url TEXT,
  onboarding_completed_at TEXT,
  current_team_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deactivated_at TEXT
);

INSERT INTO users_new
  SELECT id, email, first_name, last_name, image_url,
         onboarding_completed_at, current_team_id,
         created_at, updated_at, deactivated_at
  FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;
