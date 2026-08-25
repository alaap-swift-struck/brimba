-- 0019 · The nightly job's own state, and the growth meter.
--
-- Until now the nightly cron could not answer two questions about itself:
--
--   1. DID IT RUN? A cron that stops firing is the quietest failure a scheduled
--      system has — everything it was supposed to do simply does not happen, and
--      nothing anywhere says so. `cron_runs` is a heartbeat: one row, upserted,
--      written LAST so that its timestamp means "the whole pass completed", not
--      "the pass started". The nightly digest reads it before rewriting it and
--      raises an error row when it is more than 26 hours stale.
--
--      A MISSING heartbeat deliberately does not alarm. "I have never run" is
--      not evidence of a missed run, and a fresh environment should not open
--      with a false alarm on its first night.
--
--   2. HOW FAR DID IT GET? The per-team walk is now cursored — 200 teams a night
--      rather than every team in one invocation — so it has to remember where it
--      stopped. That cursor lives in the same row, because it is the same fact:
--      the state of one job. One row per job, upserted; it is state, not history,
--      so this table cannot grow.
--
-- `db_sizes` is the other half: the per-tenant storage METER. One row per
-- database per night turns "is this tenant getting bigger, and how fast" from a
-- guess into a slope somebody can read. It is the one table here that genuinely
-- grows, which is why its 90-day rule ships in the same change that creates it
-- (`CORE_RETENTION`, `shared/workers/retention.ts`) — a size history with no
-- window becomes precisely the unbounded growth it was built to warn about.
--
-- These four statements already run at the top of every nightly pass as
-- CREATE ... IF NOT EXISTS, so applying this migration changes nothing on an
-- environment that has run the cron once. It is here so that a database built
-- from the migrations alone matches one built by running — a fresh environment
-- should never depend on a background job to become correctly shaped.

CREATE TABLE IF NOT EXISTS cron_runs (
  job TEXT PRIMARY KEY,
  last_run_at TEXT,
  cursor TEXT
);

CREATE TABLE IF NOT EXISTS db_sizes (
  database_id TEXT NOT NULL,
  name TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  at TEXT NOT NULL
);

-- The retention sweep prunes by age.
CREATE INDEX IF NOT EXISTS idx_db_sizes_at ON db_sizes (at);
-- One database's history, newest first — the read the growth slope needs.
CREATE INDEX IF NOT EXISTS idx_db_sizes_name_at ON db_sizes (name, at);

-- `agent_usage`'s primary key is (team_id, period), which cannot serve the
-- account-wide spend roll-up: that predicate names only `period`, so without
-- this the nightly SUM scans every team's every day.
CREATE INDEX IF NOT EXISTS idx_agent_usage_period ON agent_usage (period);
