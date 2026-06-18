// The shared opening every tenancy handler uses: who's calling, the Cloudflare
// data config, and a validated membership guard for the caller's ACTIVE team.
// Extracted so the route modules (routes/*.ts) stay small and index.ts is just
// the switchboard.

import type { SessionUser } from "../../../shared/types"
import type { D1Rest } from "../../../shared/workers/d1-rest"
import { fail } from "../../../shared/workers/http"
import type { Env } from "./env"
import { GuardError, requireMember, type MemberGuard } from "./lib/permissions"
import { d1Config } from "./lib/teams"
import type { Actor } from "./team-schema"

/** Everything a team-scoped handler needs after the standard opening. */
export type TeamCtx = {
  user: SessionUser
  actor: Actor
  cfg: D1Rest
  guard: MemberGuard
}

/** Ask the auth worker (one session system, one master) who this request is. */
export async function whoAmI(request: Request, env: Env): Promise<SessionUser | null> {
  const res = await env.AUTH.fetch("https://auth/api/auth/me", {
    headers: { Cookie: request.headers.get("Cookie") ?? "" },
  })
  if (!res.ok) return null
  const data = (await res.json()) as { user: SessionUser }
  return data.user
}

export function toActor(user: SessionUser): Actor {
  return {
    id: user.id,
    email: user.email,
    name: [user.firstName, user.lastName].filter(Boolean).join(" "),
  }
}

/**
 * The standard opening every team-scoped handler shares: who are you, the
 * Cloudflare config, and a validated membership guard for your ACTIVE team.
 * Throws GuardError (mapped to a response centrally in index.ts) on any failure.
 */
export async function teamContext(request: Request, env: Env): Promise<TeamCtx> {
  const user = await whoAmI(request, env)
  if (!user) throw new GuardError(401, "signed_out", "Not signed in.")

  const row = await env.DB.prepare("SELECT current_team_id FROM users WHERE id = ?")
    .bind(user.id)
    .first<{ current_team_id: string | null }>()
  if (!row?.current_team_id) throw new GuardError(409, "no_team", "No active team.")

  const cfg = d1Config(env)
  const guard = await requireMember(env, user.id, row.current_team_id)
  return { user, actor: toActor(user), cfg, guard }
}

/** Shared guard for the maintenance endpoints (x-admin-key header). */
export function adminGuard(request: Request, env: Env): Response | null {
  if (!env.ADMIN_KEY) return fail(503, "admin_key_missing", "Maintenance key not set.")
  if (request.headers.get("x-admin-key") !== env.ADMIN_KEY)
    return fail(403, "forbidden", "Bad maintenance key.")
  return null
}
