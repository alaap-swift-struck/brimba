// THE shared gating seam every domain worker (tenancy, content, data-ops, …)
// opens each request with: who is calling (one auth master), their ACTIVE team +
// role + database, and a permission check on the role's tall sheet. Locked rule:
// EVERY server request validates membership + rights — security is never just
// hiding UI. Lifted here so every worker gates IDENTICALLY with zero duplication.

import type { Fetcher, D1Database } from "@cloudflare/workers-types"

import type { SessionUser } from "../types"
import { d1Query, type D1Rest } from "./d1-rest"
import { fail } from "./http"

/** The slice of a worker Env the gating needs. Every domain worker's Env
 * structurally satisfies this (the AUTH binding + the core DB + the Cloudflare
 * D1 credentials for reaching team databases). */
export type GatingEnv = {
  AUTH: Fetcher
  DB: D1Database
  CF_ACCOUNT_ID: string
  CF_D1_TOKEN?: string
  ADMIN_KEY?: string
}

export type Right = "read" | "create" | "edit" | "delete"
export type Actor = { id: string; email: string; name: string }
export type MemberGuard = {
  userId: string
  teamId: string
  roleId: string
  /** the team's main database id (modules also consult routing overrides) */
  databaseId: string
}
export type TeamCtx = { user: SessionUser; actor: Actor; cfg: D1Rest; guard: MemberGuard }

/** A handler-level rule failure that maps straight to an HTTP response. The
 * worker's central catch turns it into json({error, message}, status). */
export class GuardError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message)
  }
}

/** The Cloudflare D1 REST config from a worker env (team DBs are reached over the
 * REST door). Throws cloud_key_missing if the token isn't set yet. */
export function d1ConfigFrom(env: GatingEnv): D1Rest {
  if (!env.CF_D1_TOKEN)
    throw new Error(
      "cloud_key_missing: the Cloudflare D1 token isn't set yet, so team databases can't be reached."
    )
  return { accountId: env.CF_ACCOUNT_ID, apiToken: env.CF_D1_TOKEN }
}

/** Ask the auth worker (one session system, one master) who this request is. */
export async function whoAmI(request: Request, env: GatingEnv): Promise<SessionUser | null> {
  const res = await env.AUTH.fetch("https://auth/api/auth/me", {
    headers: { Cookie: request.headers.get("Cookie") ?? "" },
  })
  if (!res.ok) return null
  return ((await res.json()) as { user: SessionUser }).user
}

export function toActor(user: SessionUser): Actor {
  return {
    id: user.id,
    email: user.email,
    name: [user.firstName, user.lastName].filter(Boolean).join(" "),
  }
}

/** Active member of this team? Throws not_member if not. Returns the guard the
 * permission checks + module queries use. */
export async function requireMember(
  env: GatingEnv,
  userId: string,
  teamId: string
): Promise<MemberGuard> {
  const row = await env.DB.prepare(
    `SELECT tm.role_id, t.database_id
     FROM team_members tm
     JOIN teams t ON t.id = tm.team_id AND t.deactivated_at IS NULL AND t.db_status = 'ready'
     WHERE tm.team_id = ? AND tm.user_id = ? AND tm.deactivated_at IS NULL`
  )
    .bind(teamId, userId)
    .first<{ role_id: string; database_id: string }>()
  if (!row) throw new GuardError(403, "not_member", "You're not a member of this team.")
  return { userId, teamId, roleId: row.role_id, databaseId: row.database_id }
}

/** The standard opening every team-scoped handler shares: who are you, the
 * Cloudflare config, and a validated guard for your ACTIVE team. Throws
 * GuardError (mapped to a response centrally) on any failure. */
export async function teamContext(request: Request, env: GatingEnv): Promise<TeamCtx> {
  const user = await whoAmI(request, env)
  if (!user) throw new GuardError(401, "signed_out", "Not signed in.")

  // whoAmI already carries the active team (auth /me reads it fresh from the
  // users row) — no need for a second native-DB read for the same value.
  if (!user.currentTeamId) throw new GuardError(409, "no_team", "No active team.")

  const cfg = d1ConfigFrom(env)
  const guard = await requireMember(env, user.id, user.currentTeamId)
  return { user, actor: toActor(user), cfg, guard }
}

/** Does the member's role hold this right on this module? (tall-sheet read) */
export async function hasRight(
  cfg: D1Rest,
  guard: MemberGuard,
  module: string,
  right: Right
): Promise<boolean> {
  const rows = await d1Query<{
    can_read: number
    can_create: number
    can_edit: number
    can_delete: number
  }>(
    cfg,
    guard.databaseId,
    "SELECT can_read, can_create, can_edit, can_delete FROM role_permissions WHERE role_id = ? AND module = ?",
    [guard.roleId, module]
  )
  if (!rows[0]) return false
  return rows[0][`can_${right}`] === 1
}

/** hasRight, but throws a 403 GuardError — the one-liner for handlers. */
export async function requireRight(
  cfg: D1Rest,
  guard: MemberGuard,
  module: string,
  right: Right
): Promise<void> {
  // Name the missing right in plain words — a person (or the agent explaining a
  // refused step) can then see WHICH permission their role lacks, not just "no".
  if (!(await hasRight(cfg, guard, module, right)))
    throw new GuardError(
      403,
      "forbidden",
      `You don't have permission to do that — your role is missing the "${right}" right on ${module.replace(/_/g, " ")}.`
    )
}

/** Shared guard for the maintenance endpoints (x-admin-key header). */
export function adminGuard(request: Request, env: GatingEnv): Response | null {
  if (!env.ADMIN_KEY) return fail(503, "admin_key_missing", "Maintenance key not set.")
  if (request.headers.get("x-admin-key") !== env.ADMIN_KEY)
    return fail(403, "forbidden", "Bad maintenance key.")
  return null
}
