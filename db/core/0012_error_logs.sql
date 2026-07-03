-- The central error log — one row per UNEXPECTED failure anywhere in the system:
-- a worker's central catch (a real crash, never a clean GuardError refusal) or a
-- client-side error beaconed through the gateway. Lives in the GLOBAL core DB on
-- purpose: system health is cross-team (each environment has its own core DB, so
-- staging errors and production errors never mix). `status` powers the resolve
-- workflow: open → resolved, with a free-text note explaining what went wrong and
-- how it was fixed. See ERROR-HANDLING.md.
CREATE TABLE error_logs (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  source TEXT NOT NULL,           -- which piece: auth | tenancy | content | data-ops | gateway | web
  place TEXT NOT NULL,            -- where inside it: "POST /api/…" (workers) or the client `where`
  message TEXT NOT NULL,
  stack TEXT,
  team_id TEXT,
  user_id TEXT,
  url TEXT,                       -- the page the client was on (web errors only)
  status TEXT NOT NULL DEFAULT 'open',   -- open | resolved
  resolved_at TEXT,
  resolution_note TEXT
);
CREATE INDEX idx_error_logs_status_at ON error_logs (status, at DESC);
