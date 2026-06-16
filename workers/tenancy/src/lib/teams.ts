// Team lifecycle: the factory that gives every new team its OWN database
// (locked architecture), seeded with default roles + dropdown values.

import type { ActiveContext, TeamSummary } from "../../../../shared/types"
import {
  d1CreateDatabase,
  d1DeleteDatabase,
  d1ExecScript,
  d1Query,
  type D1Rest,
} from "../../../../shared/workers/d1-rest"
import { ulid } from "../../../../shared/workers/id"
import { MAX_IMAGE_BYTES, parseDataUrl } from "../../../../shared/workers/image"
import type { Env } from "../env"
import { GuardError } from "./permissions"
import { buildTeamSeed, TEAM_MIGRATIONS, type Actor } from "../team-schema"

export function d1Config(env: Env): D1Rest {
  if (!env.CF_D1_TOKEN) {
    throw new Error(
      "cloud_key_missing: the Cloudflare D1 token isn't set yet, so team databases can't be created."
    )
  }
  return { accountId: env.CF_ACCOUNT_ID, apiToken: env.CF_D1_TOKEN }
}

/** Apply ONE migration to a team database and stamp it in _migrations. */
export async function applyMigration(
  cfg: D1Rest,
  databaseId: string,
  m: { version: string; sql: string }
): Promise<void> {
  await d1ExecScript(
    cfg,
    databaseId,
    `${m.sql}\nINSERT INTO _migrations (version, applied_at) VALUES ('${m.version}', '${new Date().toISOString()}');`
  )
}

/** Apply every team-schema migration a fresh database needs. */
export async function applyTeamSchema(
  cfg: D1Rest,
  databaseId: string
): Promise<string> {
  for (const m of TEAM_MIGRATIONS) await applyMigration(cfg, databaseId, m)
  return TEAM_MIGRATIONS[TEAM_MIGRATIONS.length - 1].version
}

/**
 * Create a personal team for a fresh user: global team row → its own D1
 * database → schema → seeds (Admin/Viewer + dropdown defaults) → membership
 * (Admin) → mark ready + make it the user's current team.
 */
export async function createTeam(
  env: Env,
  actor: Actor,
  name: string,
  logoUrl: string | null
): Promise<{ teamId: string }> {
  const cfg = d1Config(env)
  const teamId = ulid()
  const now = new Date().toISOString()

  await env.DB.prepare(
    `INSERT INTO teams (id, name, logo_url, db_status, created_at, creator_id, creator_email, creator_name)
     VALUES (?, ?, ?, 'creating', ?, ?, ?, ?)`
  )
    .bind(teamId, name, logoUrl, now, actor.id, actor.email, actor.name)
    .run()

  let databaseId: string | null = null
  try {
    databaseId = await d1CreateDatabase(cfg, `team-${teamId.toLowerCase()}`)
    const schemaVersion = await applyTeamSchema(cfg, databaseId)

    const seed = buildTeamSeed(actor, now)
    await d1ExecScript(cfg, databaseId, seed.script)

    await env.DB.prepare(
      `INSERT INTO team_members (id, team_id, user_id, role_id, created_at, creator_id, creator_email, creator_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(ulid(), teamId, actor.id, seed.adminRoleId, now, actor.id, actor.email, actor.name)
      .run()

    await env.DB.prepare(
      "UPDATE teams SET database_id = ?, db_status = 'ready', schema_version = ?, updated_at = ? WHERE id = ?"
    )
      .bind(databaseId, schemaVersion, now, teamId)
      .run()

    await env.DB.prepare("UPDATE users SET current_team_id = ?, updated_at = ? WHERE id = ?")
      .bind(teamId, now, actor.id)
      .run()

    return { teamId }
  } catch (e) {
    // Leave a clear 'failed' trail AND clean up the half-created database so
    // nothing orphaned lingers in the account; a retry starts fresh.
    await env.DB.prepare(
      "UPDATE teams SET db_status = 'failed', updated_at = ? WHERE id = ?"
    )
      .bind(new Date().toISOString(), teamId)
      .run()
    if (databaseId) {
      await d1DeleteDatabase(cfg, databaseId).catch((cleanupErr) =>
        console.error("orphan DB cleanup failed:", cleanupErr)
      )
    }
    throw e
  }
}

/** Edit a team's name + optional logo (the global teams row). A new logo (data
 * URL) lands in R2 and is served by the gateway at /media/teams/<id>. Caller
 * checks teams:edit. */
export async function updateTeamDetails(
  env: Env,
  teamId: string,
  name: string,
  logoDataUrl?: string
): Promise<void> {
  const clean = name.trim()
  if (!clean) throw new GuardError(400, "invalid_input", "A team needs a name.")

  let logoUrl: string | undefined // undefined = leave the existing logo as-is
  if (logoDataUrl) {
    const parsed = parseDataUrl(logoDataUrl)
    if (!parsed) throw new GuardError(400, "bad_image", "That image format isn't supported.")
    if (parsed.bytes.byteLength > MAX_IMAGE_BYTES)
      throw new GuardError(400, "image_too_large", "That image is too large.")
    const key = `teams/${teamId}`
    await env.MEDIA.put(key, parsed.bytes, { httpMetadata: { contentType: parsed.contentType } })
    logoUrl = `/media/${key}?v=${Date.now()}`
  }

  const now = new Date().toISOString()
  if (logoUrl !== undefined) {
    await env.DB.prepare("UPDATE teams SET name = ?, logo_url = ?, updated_at = ? WHERE id = ?")
      .bind(clean, logoUrl, now, teamId)
      .run()
  } else {
    await env.DB.prepare("UPDATE teams SET name = ?, updated_at = ? WHERE id = ?")
      .bind(clean, now, teamId)
      .run()
  }
}

/**
 * Accept every active invite waiting for this email (locked flow: invited
 * users join automatically at onboarding — and get NO personal team).
 * NOTE: the per-team invite_logs rows get their acceptance stamps when the
 * invites module lands; the global index is the source of routing truth here.
 */
export async function acceptPendingInvites(
  env: Env,
  actor: Actor
): Promise<number> {
  const now = new Date().toISOString()
  const pending = await env.DB.prepare(
    `SELECT i.id, i.team_id, i.role_id FROM invite_index i
     JOIN teams t ON t.id = i.team_id AND t.deactivated_at IS NULL
     WHERE i.email = ? AND i.status = 'pending' AND i.expires_at > ?`
  )
    .bind(actor.email, now)
    .all<{ id: string; team_id: string; role_id: string }>()

  const invites = pending.results ?? []
  for (const invite of invites) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO team_members (id, team_id, user_id, role_id, created_at, creator_id, creator_email, creator_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(ulid(), invite.team_id, actor.id, invite.role_id, now, actor.id, actor.email, actor.name)
      .run()
    await env.DB.prepare("UPDATE invite_index SET status = 'accepted' WHERE id = ?")
      .bind(invite.id)
      .run()
  }

  if (invites.length > 0) {
    await env.DB.prepare(
      "UPDATE users SET current_team_id = ?, updated_at = ? WHERE id = ?"
    )
      .bind(invites[0].team_id, now, actor.id)
      .run()
  }
  return invites.length
}

/**
 * The signed-in person's current working context: which team they're in, the
 * role they hold there (title read from that team's OWN database), the member
 * count, and the full list for the switcher. Self-heals a stale/empty current
 * team by falling back to the first team they belong to.
 */
export async function getActiveContext(
  env: Env,
  cfg: D1Rest,
  userId: string
): Promise<ActiveContext> {
  const teams = await listMyTeams(env, userId)
  if (teams.length === 0)
    return { team: null, role: null, memberCount: 0, teams: [] }

  const stored = await env.DB.prepare(
    "SELECT current_team_id FROM users WHERE id = ?"
  )
    .bind(userId)
    .first<{ current_team_id: string | null }>()

  let current = teams.find((t) => t.id === stored?.current_team_id) ?? teams[0]
  if (current.id !== stored?.current_team_id) {
    await env.DB.prepare(
      "UPDATE users SET current_team_id = ?, updated_at = ? WHERE id = ?"
    )
      .bind(current.id, new Date().toISOString(), userId)
      .run()
  }

  const dbRow = await env.DB.prepare(
    "SELECT database_id FROM teams WHERE id = ?"
  )
    .bind(current.id)
    .first<{ database_id: string }>()
  const countRow = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM team_members WHERE team_id = ? AND deactivated_at IS NULL"
  )
    .bind(current.id)
    .first<{ n: number }>()

  let role: ActiveContext["role"] = null
  if (dbRow?.database_id) {
    const roleRows = await d1Query<{ id: string; title: string }>(
      cfg,
      dbRow.database_id,
      "SELECT id, title FROM member_roles WHERE id = ?",
      [current.roleId]
    )
    if (roleRows[0]) role = { id: roleRows[0].id, title: roleRows[0].title }
  }

  return { team: current, role, memberCount: countRow?.n ?? 0, teams }
}

/** Switch the active team (locked: one team session at a time). Validates the
 * person is an active member of the target before flipping their pointer. */
export async function switchTeam(
  env: Env,
  userId: string,
  teamId: string
): Promise<boolean> {
  const member = await env.DB.prepare(
    `SELECT 1 FROM team_members tm
     JOIN teams t ON t.id = tm.team_id AND t.deactivated_at IS NULL AND t.db_status = 'ready'
     WHERE tm.team_id = ? AND tm.user_id = ? AND tm.deactivated_at IS NULL`
  )
    .bind(teamId, userId)
    .first()
  if (!member) return false

  await env.DB.prepare(
    "UPDATE users SET current_team_id = ?, updated_at = ? WHERE id = ?"
  )
    .bind(teamId, new Date().toISOString(), userId)
    .run()
  return true
}

/** Every active team this user belongs to (for the team switcher + home). */
export async function listMyTeams(
  env: Env,
  userId: string
): Promise<TeamSummary[]> {
  const rows = await env.DB.prepare(
    `SELECT t.id, t.name, t.logo_url, t.db_status, tm.role_id
     FROM team_members tm
     JOIN teams t ON t.id = tm.team_id AND t.deactivated_at IS NULL
     WHERE tm.user_id = ? AND tm.deactivated_at IS NULL
     ORDER BY t.created_at`
  )
    .bind(userId)
    .all<{
      id: string
      name: string
      logo_url: string | null
      db_status: string
      role_id: string
    }>()

  return (rows.results ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    logoUrl: r.logo_url,
    roleId: r.role_id,
    dbStatus: r.db_status,
  }))
}
