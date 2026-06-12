// Team lifecycle: the factory that gives every new team its OWN database
// (locked architecture), seeded with default roles + dropdown values.

import type { TeamSummary } from "../../../../shared/types"
import {
  d1CreateDatabase,
  d1ExecScript,
  type D1Rest,
} from "../../../../shared/workers/d1-rest"
import { ulid } from "../../../../shared/workers/id"
import type { Env } from "../env"
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

  try {
    const databaseId = await d1CreateDatabase(
      cfg,
      `team-${teamId.toLowerCase()}`
    )
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
    await env.DB.prepare(
      "UPDATE teams SET db_status = 'failed', updated_at = ? WHERE id = ?"
    )
      .bind(new Date().toISOString(), teamId)
      .run()
    throw e
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
