-- Per-team AI-usage meter for the agent quota (decision: meter the AI work
-- consumed, the real cost driver; warn then hard-stop at the cap). One row per
-- (team, metering window); the shared agent gate increments `used` before each
-- AI call and refuses once the team is over its cap. Lives in the global core DB
-- so the gate can check it without opening a team database. The cap itself is a
-- config default for now (a per-team override can be added later).
CREATE TABLE agent_usage (
  team_id TEXT NOT NULL REFERENCES teams (id),
  period TEXT NOT NULL,                 -- 'YYYY-MM-DD' daily metering window
  used INTEGER NOT NULL DEFAULT 0,      -- AI units consumed this period
  updated_at TEXT,
  PRIMARY KEY (team_id, period)
);
