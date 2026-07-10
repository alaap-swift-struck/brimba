-- The agent USAGE LOG — a plain, human-readable trail of what the AI actually did,
-- separate from the metering counters (agent_usage = the daily-free counter that resets;
-- agent_credits = the balance). This log is daily-INDEPENDENT: one row PER USER COMMAND,
-- recording how many AI units that command consumed, where they came from (free / credit
-- / mixed), and a short human summary (the user's message). A command that pauses for a
-- yes/no confirm spans two turns (propose + confirm); the confirm-continuation FOLDS its
-- units into the propose row (credits.ts `foldUsageIntoLatest`) instead of writing a
-- second "(continued)" row — so the history stays one entry per command and reconciles
-- exactly with the balance drop (the bug that motivated it: balance -3 but history 1+1).
-- Lives in the global core DB so the shared agent code can write it without opening a team
-- database. Writing is best-effort — a missing table or write error must never break a
-- turn (the code wraps it in try/catch). The panel's quota badge opens a small view
-- backed by this table.
CREATE TABLE IF NOT EXISTS agent_usage_log (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  actor_id TEXT,
  actor_name TEXT,
  created_at TEXT NOT NULL,
  credits INTEGER NOT NULL,             -- AI units this turn consumed
  source TEXT NOT NULL,                 -- 'free' | 'credit' | 'mixed'
  summary TEXT NOT NULL                 -- the user's message, trimmed (~140 chars)
);

-- Newest-first, team-scoped reads (the panel's usage view).
CREATE INDEX IF NOT EXISTS idx_agent_usage_log_team
  ON agent_usage_log (team_id, created_at DESC);
