// THE master definition of what lives inside every team's own database, plus
// the seed rows a newborn team starts with (mirrors the user's Glide Base v3).
// Adding a future team-table = appending a migration here; the migration
// runner (POST /api/tenancy/admin/migrate-teams) rolls it to every team.

import { sqlString } from "../../../shared/workers/d1-rest"
import { ulid } from "../../../shared/workers/id"

/** The modules every role's permission sheet covers today (tall sheet: one
 * row per role × module). Future modules just add rows, never columns. */
export const TEAM_MODULES = [
  "teams",
  "team_members",
  "member_roles",
  "learning",
  "help",
  "selectable_data",
] as const

export const TEAM_MIGRATIONS: { version: string; sql: string }[] = [
  {
    version: "0001_team_base",
    sql: `
CREATE TABLE _migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE member_roles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT,
  deactivated_at TEXT, deactivator_id TEXT, deactivator_email TEXT, deactivator_name TEXT
);

-- Tall permission sheet (locked): role | module | the four switches.
CREATE TABLE role_permissions (
  id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL REFERENCES member_roles (id),
  module TEXT NOT NULL,
  can_read INTEGER NOT NULL DEFAULT 0,
  can_create INTEGER NOT NULL DEFAULT 0,
  can_edit INTEGER NOT NULL DEFAULT 0,
  can_delete INTEGER NOT NULL DEFAULT 0,
  UNIQUE (role_id, module)
);

CREATE TABLE selectable_data (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  value TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT,
  deactivated_at TEXT, deactivator_id TEXT, deactivator_email TEXT, deactivator_name TEXT
);

-- Activity log (locked rule: edits, deactivations, activations ONLY —
-- creations live on each row's own audit columns, deletes don't happen).
CREATE TABLE activity (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  related_table TEXT,
  related_row_id TEXT,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT
);
CREATE INDEX idx_activity_related ON activity (related_table, related_row_id);
`,
  },
]

export type Actor = { id: string; email: string; name: string }

/** Default dropdown values every new team starts with (from Base v3). */
export const DEFAULT_SELECTABLE: { type: string; value: string }[] = [
  { type: "File type", value: "Image file" },
  { type: "File type", value: "Image link" },
  { type: "File type", value: "Video file" },
  { type: "File type", value: "Video link" },
  { type: "File type", value: "Other file" },
  { type: "File type", value: "Other link" },
  { type: "Help type", value: "Report user" },
  { type: "Help type", value: "Bug report" },
  { type: "Help type", value: "How to use ?" },
  { type: "Help type", value: "Feature request" },
  { type: "Help type", value: "Payment issue" },
  { type: "Help status", value: "not started" },
  { type: "Help status", value: "in progress" },
  { type: "Help status", value: "resolved" },
]

/**
 * Build the one seed script a newborn team database runs: the locked Admin
 * role, the read-only Viewer role, their permission sheets, and the default
 * dropdown values. Returns the script plus the Admin role id (the creator's
 * membership points at it).
 */
export function buildTeamSeed(
  actor: Actor,
  now: string
): { script: string; adminRoleId: string; viewerRoleId: string } {
  const adminRoleId = ulid()
  const viewerRoleId = ulid()
  const a = (extra: string[]) =>
    [sqlString(now), sqlString(actor.id), sqlString(actor.email), sqlString(actor.name), ...extra].join(", ")

  const statements: string[] = [
    `INSERT INTO member_roles (id, title, description, is_default, created_at, creator_id, creator_email, creator_name) VALUES (${sqlString(adminRoleId)}, 'Admin', 'This role is a default and cannot be changed. Any member with admin access has full control over that team', 1, ${a([])});`,
    `INSERT INTO member_roles (id, title, description, is_default, created_at, creator_id, creator_email, creator_name) VALUES (${sqlString(viewerRoleId)}, 'Viewer', 'This role is read-only. Anyone assigned with this role can see all data but not create or modify it in any way', 0, ${a([])});`,
  ]

  for (const module of TEAM_MODULES) {
    statements.push(
      `INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete) VALUES (${sqlString(ulid())}, ${sqlString(adminRoleId)}, ${sqlString(module)}, 1, 1, 1, 1);`,
      `INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete) VALUES (${sqlString(ulid())}, ${sqlString(viewerRoleId)}, ${sqlString(module)}, 1, 0, 0, 0);`
    )
  }

  for (const item of DEFAULT_SELECTABLE) {
    statements.push(
      `INSERT INTO selectable_data (id, type, value, is_default, created_at, creator_id, creator_email, creator_name) VALUES (${sqlString(ulid())}, ${sqlString(item.type)}, ${sqlString(item.value)}, 1, ${a([])});`
    )
  }

  return { script: statements.join("\n"), adminRoleId, viewerRoleId }
}
