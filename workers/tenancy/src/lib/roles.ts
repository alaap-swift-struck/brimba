// Roles & permissions module — read and edit a role's permission "tall sheet"
// (role × module × read/create/edit/delete) inside the team's OWN database, and
// create new roles. Locked rules enforced HERE on the server (never just the UI):
//   • the default Admin role can't be edited;
//   • auto-flip-read — turning on any write right (create/edit/delete) forces
//     Read on (you can't have write without read).

import { logActivity, type Actor } from "../../../../shared/workers/activity"
import {
  d1ExecScript,
  d1Query,
  sqlString,
  type D1Rest,
} from "../../../../shared/workers/d1-rest"
import { ulid } from "../../../../shared/workers/id"
import { TEAM_MODULE_CATALOG } from "../team-schema"
import { GuardError, hasRight, type MemberGuard } from "./permissions"

/** The four switches for one module (matches the library PermissionMatrix). */
export type RightSet = {
  read: boolean
  create: boolean
  edit: boolean
  delete: boolean
}
/** A whole role's sheet: one RightSet per module key. */
export type PermissionValue = Record<string, RightSet>

type PermRow = {
  module: string
  can_read: number
  can_create: number
  can_edit: number
  can_delete: number
}
type RoleRow = { id: string; title: string; is_default: number }

/** Build a full PermissionValue (every module present; missing DB rows → all-
 * off) from raw permission rows — ONE source for getRolePermissions and
 * getMyPermissions, so the two can't shape the value differently. */
function buildPermissionValue(rows: PermRow[]): PermissionValue {
  const byModule = new Map(rows.map((r) => [r.module, r]))
  const value: PermissionValue = {}
  for (const m of TEAM_MODULE_CATALOG) {
    const r = byModule.get(m.key)
    value[m.key] = {
      read: r?.can_read === 1,
      create: r?.can_create === 1,
      edit: r?.can_edit === 1,
      delete: r?.can_delete === 1,
    }
  }
  return value
}

/** Fetch an active role in this team, or throw a clean 404. */
async function roleOrThrow(
  cfg: D1Rest,
  guard: MemberGuard,
  roleId: string
): Promise<RoleRow> {
  const rows = await d1Query<RoleRow>(
    cfg,
    guard.databaseId,
    "SELECT id, title, is_default FROM member_roles WHERE id = ? AND deactivated_at IS NULL",
    [roleId]
  )
  if (!rows[0]) throw new GuardError(404, "role_not_found", "That role doesn't exist.")
  return rows[0]
}

/** A role's permission matrix: the module rows, the saved value, and whether
 * it's the locked Admin role (so the screen shows it view-only). */
export async function getRolePermissions(
  cfg: D1Rest,
  guard: MemberGuard,
  roleId: string
): Promise<{
  modules: { key: string; label: string }[]
  value: PermissionValue
  isDefault: boolean
  title: string
  /** does the CALLER hold member_roles:edit? drives the screen's edit/view mode */
  canEdit: boolean
}> {
  const role = await roleOrThrow(cfg, guard, roleId)
  const rows = await d1Query<PermRow>(
    cfg,
    guard.databaseId,
    "SELECT module, can_read, can_create, can_edit, can_delete FROM role_permissions WHERE role_id = ?",
    [roleId]
  )

  return {
    modules: TEAM_MODULE_CATALOG,
    value: buildPermissionValue(rows),
    isDefault: role.is_default === 1,
    title: role.title,
    canEdit: await hasRight(cfg, guard, "member_roles", "edit"),
  }
}

/** The CALLER's own effective rights for every module in this team — powers the
 * client's page-visibility guard and which nav/tabs to show. Any member may read
 * their own rights (no requireRight needed). */
export async function getMyPermissions(
  cfg: D1Rest,
  guard: MemberGuard
): Promise<PermissionValue> {
  const rows = await d1Query<PermRow>(
    cfg,
    guard.databaseId,
    "SELECT module, can_read, can_create, can_edit, can_delete FROM role_permissions WHERE role_id = ?",
    [guard.roleId]
  )
  return buildPermissionValue(rows)
}

/** Normalize one module's rights with the locked "any write needs read" rule:
 * if any of create/edit/delete is on, read is forced on. */
export function normalizeRights(r: Partial<RightSet> | undefined): RightSet {
  const create = !!r?.create
  const edit = !!r?.edit
  const del = !!r?.delete
  return { read: !!r?.read || create || edit || del, create, edit, delete: del }
}

/** Save a role's permission sheet (upsert one row per module). Refuses the
 * locked Admin role; enforces auto-flip-read on every module. */
export async function setRolePermissions(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  roleId: string,
  value: PermissionValue
): Promise<void> {
  const role = await roleOrThrow(cfg, guard, roleId)
  if (role.is_default === 1)
    throw new GuardError(
      409,
      "locked_role",
      "The Admin role is locked — its permissions can't be changed."
    )

  const statements = TEAM_MODULE_CATALOG.map((m) => {
    const n = normalizeRights(value?.[m.key])
    const bit = (b: boolean) => (b ? 1 : 0)
    return `INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
VALUES (${sqlString(ulid())}, ${sqlString(roleId)}, ${sqlString(m.key)}, ${bit(n.read)}, ${bit(n.create)}, ${bit(n.edit)}, ${bit(n.delete)})
ON CONFLICT(role_id, module) DO UPDATE SET
  can_read = excluded.can_read, can_create = excluded.can_create,
  can_edit = excluded.can_edit, can_delete = excluded.can_delete;`
  })

  await d1ExecScript(cfg, guard.databaseId, statements.join("\n"))

  await logActivity(cfg, guard.databaseId, actor, {
    type: "Role permissions changed",
    description: `${actor.name} updated permissions for the ${role.title} role`,
    relatedTable: "member_roles",
    relatedRowId: roleId,
  })
}

/** Rename / re-describe a role. Refuses the locked Admin (default) role; needs
 * a non-empty title. (Permissions are edited separately via setRolePermissions.) */
export async function updateRole(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  roleId: string,
  title: string,
  description: string
): Promise<void> {
  const role = await roleOrThrow(cfg, guard, roleId)
  if (role.is_default === 1)
    throw new GuardError(409, "locked_role", "The Admin role is locked — it can't be renamed.")
  const cleanTitle = title.trim()
  if (!cleanTitle) throw new GuardError(400, "invalid_input", "A role needs a name.")

  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `UPDATE member_roles SET title = ${sqlString(cleanTitle)}, description = ${sqlString(description.trim() || null)}, updated_at = ${sqlString(now)}, editor_id = ${sqlString(actor.id)}, editor_email = ${sqlString(actor.email)}, editor_name = ${sqlString(actor.name)} WHERE id = ${sqlString(roleId)};`
  )

  await logActivity(cfg, guard.databaseId, actor, {
    type: "Role edited",
    description: `${actor.name} edited the ${cleanTitle} role`,
    relatedTable: "member_roles",
    relatedRowId: roleId,
  })
}

/** Create a new (non-default) role. It starts with NO rights — the admin grants
 * them via the matrix. Returns the new role id. */
export async function createRole(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  title: string,
  description: string
): Promise<string> {
  const cleanTitle = title.trim()
  if (!cleanTitle) throw new GuardError(400, "invalid_input", "A role needs a name.")

  const roleId = ulid()
  const now = new Date().toISOString()
  const desc = description.trim() || null

  const statements = [
    `INSERT INTO member_roles (id, title, description, is_default, created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(roleId)}, ${sqlString(cleanTitle)}, ${sqlString(desc)}, 0, ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`,
    ...TEAM_MODULE_CATALOG.map(
      (m) =>
        `INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete) VALUES (${sqlString(ulid())}, ${sqlString(roleId)}, ${sqlString(m.key)}, 0, 0, 0, 0);`
    ),
  ]

  await d1ExecScript(cfg, guard.databaseId, statements.join("\n"))

  await logActivity(cfg, guard.databaseId, actor, {
    type: "Role created",
    description: `${actor.name} created the ${cleanTitle} role`,
    relatedTable: "member_roles",
    relatedRowId: roleId,
  })

  return roleId
}
