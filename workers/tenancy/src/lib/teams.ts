// Team lifecycle: the factory that gives every new team its OWN database
// (locked architecture), seeded with default roles + dropdown values.

import type { ActiveContext, ReceivedInvite, TeamMeta, TeamSummary } from "../../../../shared/types"
import { logActivity } from "../../../../shared/workers/activity"
import {
  d1CreateDatabase,
  d1DeleteDatabase,
  d1ExecScript,
  d1Query,
  type D1Rest,
} from "../../../../shared/workers/d1-rest"
import { ulid } from "../../../../shared/workers/id"
import { MAX_IMAGE_BYTES, parseDataUrl } from "../../../../shared/workers/image"
import { publishChange } from "../../../../shared/workers/realtime"
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

    await logActivity(cfg, databaseId, actor, {
      type: "Team created",
      description: `${actor.name} created the team`,
      relatedTable: "teams",
      relatedRowId: teamId,
    })

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
    // UPSERT (not INSERT OR IGNORE): a previously-removed member's row is only
    // soft-deactivated (ARCHITECTURE §4), so reactivate + apply the invited role
    // — otherwise re-joining via a fresh signup would silently no-op.
    await env.DB.prepare(
      `INSERT INTO team_members (id, team_id, user_id, role_id, created_at, creator_id, creator_email, creator_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(team_id, user_id) DO UPDATE SET
         deactivated_at = NULL, role_id = excluded.role_id, updated_at = excluded.created_at`
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

    // Ping each affected team's live channel so members/invites screens that are
    // open update instantly (best-effort; publishChange swallows errors).
    const affected = [...new Set(invites.map((i) => i.team_id))]
    for (const teamId of affected) {
      await publishChange(env.REALTIME, teamId, "invites")
      await publishChange(env.REALTIME, teamId, "members")
    }
  }
  return invites.length
}

/**
 * Invitations this email has RECEIVED and not yet acted on — powers the
 * Invitations inbox so a missed/failed email is still recoverable in-app. Only
 * pending, unexpired invites to a still-live team; newest first. One global
 * query (no team database opened) so it's cheap for any signed-in user.
 */
export async function listReceivedInvites(
  env: Env,
  email: string
): Promise<ReceivedInvite[]> {
  const now = new Date().toISOString()
  const rows = await env.DB.prepare(
    `SELECT i.id, i.team_id, i.role_id, i.created_at, i.expires_at,
            t.name AS team_name, t.logo_url AS team_logo
     FROM invite_index i
     JOIN teams t ON t.id = i.team_id AND t.deactivated_at IS NULL AND t.db_status = 'ready'
     WHERE i.email = ? AND i.status = 'pending' AND i.expires_at > ?
     ORDER BY i.created_at DESC`
  )
    .bind(email, now)
    .all<{
      id: string
      team_id: string
      role_id: string
      created_at: string
      expires_at: string
      team_name: string
      team_logo: string | null
    }>()

  return (rows.results ?? []).map((r) => ({
    id: r.id,
    teamId: r.team_id,
    teamName: r.team_name,
    teamLogoUrl: r.team_logo,
    roleId: r.role_id,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
  }))
}

/**
 * Accept ONE invite the caller received — the path for an ALREADY-onboarded user
 * (the onboarding sweep above only runs for teamless users). Validates the
 * invite is theirs (email match), still pending, unexpired, and the team is
 * live; joins them (idempotent INSERT OR IGNORE, backed by the team_members
 * UNIQUE) and — per the locked "join + switch" choice — makes it their active
 * team. Returns the joined team's id, or null if the invite isn't valid for this
 * caller. Race-safe: the status flip is conditional on 'pending' (CONCURRENCY.md
 * rule 1) and the membership insert is idempotent, so a double-tap can't
 * double-join.
 */
export async function acceptInvite(
  env: Env,
  actor: Actor,
  inviteId: string
): Promise<string | null> {
  const now = new Date().toISOString()
  // Validate the invite is theirs (email), still pending, unexpired, to a live
  // team — and grab its team + role for the join.
  const invite = await env.DB.prepare(
    `SELECT i.id, i.team_id, i.role_id FROM invite_index i
     JOIN teams t ON t.id = i.team_id AND t.deactivated_at IS NULL AND t.db_status = 'ready'
     WHERE i.id = ? AND i.email = ? AND i.status = 'pending' AND i.expires_at > ?`
  )
    .bind(inviteId, actor.email, now)
    .first<{ id: string; team_id: string; role_id: string }>()
  if (!invite) return null

  // CLAIM IT FIRST, atomically: only the request that flips pending→accepted may
  // proceed. This is the race gate (CONCURRENCY.md rule 1) — a double-tap, or a
  // revoke landing in the window, makes this UPDATE change 0 rows, so we bail
  // BEFORE joining. (A revoked invite can therefore never grant membership.)
  const claim = await env.DB.prepare(
    "UPDATE invite_index SET status = 'accepted' WHERE id = ? AND status = 'pending'"
  )
    .bind(inviteId)
    .run()
  if (!claim.meta?.changes) return null

  // Join — UPSERT, not INSERT OR IGNORE: removal soft-deactivates the row
  // (ARCHITECTURE §4, deactivate-not-delete), so a previously-removed member
  // still occupies the UNIQUE(team_id,user_id) slot. Reactivate + apply the
  // invited role so a re-invite truly rejoins them (idempotent on a fresh join).
  await env.DB.prepare(
    `INSERT INTO team_members (id, team_id, user_id, role_id, created_at, creator_id, creator_email, creator_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(team_id, user_id) DO UPDATE SET
       deactivated_at = NULL, role_id = excluded.role_id, updated_at = excluded.created_at`
  )
    .bind(ulid(), invite.team_id, actor.id, invite.role_id, now, actor.id, actor.email, actor.name)
    .run()

  // Join + switch (locked): make the newly-joined team the active one.
  await env.DB.prepare("UPDATE users SET current_team_id = ?, updated_at = ? WHERE id = ?")
    .bind(invite.team_id, now, actor.id)
    .run()

  await publishChange(env.REALTIME, invite.team_id, "invites")
  await publishChange(env.REALTIME, invite.team_id, "members")
  return invite.team_id
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

/** A team's metadata for its Overview tab: who created it + when, last updated.
 * (Reads the global teams row — the source of truth for team identity.) */
export async function getTeamMeta(env: Env, teamId: string): Promise<TeamMeta> {
  const row = await env.DB.prepare(
    "SELECT name, created_at, creator_name, creator_email, updated_at FROM teams WHERE id = ?"
  )
    .bind(teamId)
    .first<{
      name: string
      created_at: string
      creator_name: string | null
      creator_email: string | null
      updated_at: string | null
    }>()
  return {
    name: row?.name ?? "",
    createdAt: row?.created_at ?? "",
    creatorName: row?.creator_name ?? null,
    creatorEmail: row?.creator_email ?? null,
    updatedAt: row?.updated_at ?? null,
  }
}
