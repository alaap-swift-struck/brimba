-- THE OPERATIONS DATABASE — schema 0001.
--
-- These two tables used to live in the shared core database, alongside identity,
-- memberships and sessions. They are the two fastest-growing tables in the whole
-- system and neither of them is a record: nothing joins to them, nothing has a
-- foreign key to them, and every read is by one tagged column.
--
-- Keeping them next to the customer records meant the one database that carries
-- EVERY tenant — against D1's 10 GB cap — filled up with logs. This is the same
-- schema, in a room of its own.
--
-- The AI credit BALANCE (`agent_credits`) deliberately does NOT move: the quota
-- gate reads it on the request path and it belongs with the team record. Only
-- the spend history moves.
--
-- Scaling review, 2026-08-12 — see SCALING.md §5.2.

CREATE TABLE IF NOT EXISTS error_logs (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  source TEXT NOT NULL,           -- which piece: auth | tenancy | content | data-ops | gateway | web
  place TEXT NOT NULL,            -- where inside it: "POST /api/…" or the client `where`
  message TEXT NOT NULL,
  stack TEXT,
  team_id TEXT,
  user_id TEXT,
  url TEXT,                       -- the page the client was on (web errors only)
  status TEXT NOT NULL DEFAULT 'open',   -- open | resolved
  resolved_at TEXT,
  resolution_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_error_logs_status_at ON error_logs (status, at DESC);
-- The retention sweep deletes by age, so age is what it must seek on.
CREATE INDEX IF NOT EXISTS idx_error_logs_at ON error_logs (at);

CREATE TABLE IF NOT EXISTS agent_usage_log (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  actor_id TEXT,
  actor_name TEXT,
  created_at TEXT NOT NULL,
  credits INTEGER NOT NULL,             -- AI units this command consumed
  source TEXT NOT NULL,                 -- 'free' | 'credit' | 'mixed'
  summary TEXT NOT NULL,                -- the ACTION(s) taken (falls back to the prompt)
  kind TEXT                             -- 'action' | 'prompt' | NULL (legacy, private)
);
-- Newest-first, team-scoped reads (the usage view).
CREATE INDEX IF NOT EXISTS idx_agent_usage_log_team ON agent_usage_log (team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_usage_log_created ON agent_usage_log (created_at);
