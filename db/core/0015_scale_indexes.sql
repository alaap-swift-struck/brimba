-- 0015 · SCALE: the indexes the core database's own sorts and sweeps need.
--
-- The core database is the ONE thing every tenant shares, so its tables carry
-- the sum of all of them — not the average. Two things were missing:
--
--   1. SORTS. The members list and the invites list filter by team and then sort
--      by created_at; only the filter was indexed, so the sort scanned.
--   2. SWEEPS. The retention job (scripts + the nightly cron) deletes old rows by
--      timestamp — `WHERE created_at < ?`. An index whose LEADING column is
--      something else cannot serve that, so the very job meant to keep the table
--      small would have had to scan the whole table to find what to remove.
--
-- Found by the scaling review, 2026-08-11 — see SCALING.md.

-- Members list: WHERE team_id = ? ORDER BY created_at
CREATE INDEX IF NOT EXISTS idx_team_members_team_created ON team_members (team_id, created_at);

-- Invites list: WHERE team_id = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_invite_index_team_created ON invite_index (team_id, created_at DESC);

-- The retention sweeps. Each of these tables only ever grows, and each is swept
-- by timestamp alone.
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_login_codes_created ON login_codes (created_at);
CREATE INDEX IF NOT EXISTS idx_email_change_codes_created ON email_change_codes (created_at);
CREATE INDEX IF NOT EXISTS idx_account_activity_created ON account_activity (created_at);
CREATE INDEX IF NOT EXISTS idx_error_logs_at ON error_logs (at);
CREATE INDEX IF NOT EXISTS idx_agent_usage_log_created ON agent_usage_log (created_at);

-- Where a module's data actually lives (the mover's routing) is read on the
-- request path now, so the ordinary request must not pay for machinery it isn't
-- using. This counter is 0 for every team that has never had a module moved,
-- and `moduleDatabase()` returns immediately without a lookup when it is 0.
ALTER TABLE teams ADD COLUMN moved_modules INTEGER NOT NULL DEFAULT 0;
