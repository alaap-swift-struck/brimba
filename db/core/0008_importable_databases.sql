-- The GLOBAL, owner-maintained catalog of import TARGETS (decision: import targets
-- a standard catalog the owner maintains, separate from the screen system). Each
-- row describes one importable table: the key the import writes to, a friendly
-- name, and the column schema the AI import agent maps an uploaded file onto.
-- Maintained via an owner-only endpoint (like the other maintenance actions);
-- shared across all teams, so it lives in the global core DB.
CREATE TABLE importable_databases (
  id TEXT PRIMARY KEY,                       -- ULID
  table_key TEXT NOT NULL UNIQUE,            -- the target the import writes into
  display_name TEXT NOT NULL,
  description TEXT,
  required_columns_json TEXT,                -- the schema the agent maps to
  auto_populate_columns_json TEXT,           -- columns the agent may fill itself
  reference_dataset_url TEXT,                -- optional sample/reference
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT
);
