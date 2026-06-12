-- Sharding machinery (locked: built up front, not when it hurts).

-- Routing overrides: by default a team's data lives in its one database
-- (teams.database_id). When a module gets heavy, the mover relocates that
-- module's tables to a dedicated database and records it here. The data door
-- consults this table to know where a (team, module) lives.
CREATE TABLE team_module_databases (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams (id),
  module TEXT NOT NULL,
  database_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (team_id, module)
);

-- The 80% alarms: the nightly size check writes a row when any team database
-- crosses the threshold (8GB of D1's 10GB cap). resolved_at is stamped after
-- the mover (or splitter) relieves the pressure.
CREATE TABLE db_alerts (
  id TEXT PRIMARY KEY,
  database_id TEXT NOT NULL,
  database_name TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  threshold_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX idx_db_alerts_open ON db_alerts (database_id, resolved_at);
