-- Teams + memberships: the global card catalog. WHO belongs WHERE in WHAT
-- capacity lives here; everything a team OWNS lives in that team's own
-- database (created at team birth by the tenancy worker).

CREATE TABLE teams (
  id TEXT PRIMARY KEY,                 -- ULID
  name TEXT NOT NULL,
  logo_url TEXT,
  database_id TEXT,                    -- the team's own D1 database id
  db_status TEXT NOT NULL DEFAULT 'creating',  -- creating | ready | failed
  schema_version TEXT,                 -- last team-schema migration applied
  created_at TEXT NOT NULL,
  creator_id TEXT,
  creator_email TEXT,
  creator_name TEXT,
  updated_at TEXT,
  deactivated_at TEXT
);

CREATE TABLE team_members (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams (id),
  user_id TEXT NOT NULL REFERENCES users (id),
  role_id TEXT NOT NULL,               -- member_roles row INSIDE the team's DB
  created_at TEXT NOT NULL,
  creator_id TEXT,
  creator_email TEXT,
  creator_name TEXT,
  updated_at TEXT,
  deactivated_at TEXT,
  UNIQUE (team_id, user_id)
);
CREATE INDEX idx_team_members_user ON team_members (user_id);
CREATE INDEX idx_team_members_team ON team_members (team_id);

-- Global ROUTING INDEX for invites only (locked rule: the full invite log,
-- with inviter details + audit trail, lives in each team's own database).
-- This index exists so onboarding can answer "any active invites for this
-- email?" without opening every team's database.
CREATE TABLE invite_index (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,                 -- invitee (may not be a user yet)
  team_id TEXT NOT NULL REFERENCES teams (id),
  invite_row_id TEXT NOT NULL,         -- invite_logs row inside the team DB
  role_id TEXT NOT NULL,               -- proposed member_roles row in team DB
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | declined | expired
  created_at TEXT NOT NULL
);
CREATE INDEX idx_invite_index_email ON invite_index (email, status);

-- One team session at a time (locked): the user's currently-active team.
ALTER TABLE users ADD COLUMN current_team_id TEXT;
