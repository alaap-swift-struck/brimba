// THE shared gating seam every domain worker (tenancy, content, data-ops, …)
// opens each request with: who is calling (one auth master), their ACTIVE team +
// role + database, and a permission check on the role's tall sheet. Locked rule:
// EVERY server request validates membership + rights — security is never just
// hiding UI. Lifted here so every worker gates IDENTICALLY with zero duplication.

// Fetcher / D1Database come from @cloudflare/workers-types, loaded GLOBALLY by
// every worker tsconfig ("types": ["@cloudflare/workers-types"]). They are NOT
// imported here: this file lives in shared/, outside any worker directory, so a
// module import would have to resolve from the repo root — which only worked
// while an older wrangler happened to hoist the package there.

import type { RateLimiter } from "./rate-limit"
import type { SessionUser } from "../types"
import { d1Query, type D1Rest } from "./d1-rest"
import { fail } from "./http"
import { callService, REQUEST_ID_HEADER, requestIdFrom, traceHop } from "./trace"
import { originFrom, type Actor } from "./activity"
import { dbRecorder } from "./error-log"
import { opsDatabase } from "./ops-db"

/** The slice of a worker Env the gating needs. Every domain worker's Env
 * structurally satisfies this (the AUTH binding + the core DB + the Cloudflare
 * D1 credentials for reaching team databases). */
export type GatingEnv = {
  AUTH: Fetcher
  DB: D1Database
  /** The operations database, when this worker has one (ARCHITECTURE §1a). Named
   * here so `d1ConfigFrom` can hand the data door a place to record a failed call
   * to Cloudflare; absent → `opsDatabase` falls back to `DB` exactly as before. */
  OPS?: D1Database
  CF_ACCOUNT_ID: string
  CF_D1_TOKEN?: string
  ADMIN_KEY?: string
}

export type Right = "read" | "create" | "edit" | "delete"
// ONE Actor type, defined where the activity log defines it. gating.ts used to
// declare its own structurally-identical copy; the moment the activity log added
// `origin` to the actor, the two silently disagreed and the origin never reached
// a log row. Re-exported so every existing `import { Actor } from "./gating"`
// still works.
export type { Actor } from "./activity"
export type MemberGuard = {
  userId: string
  teamId: string
  roleId: string
  /** the team's main database id (modules also consult routing overrides) */
  databaseId: string
  /** how many of this team's modules the mover has relocated (0 = none, the
   * normal case; a non-zero value is what makes moduleDatabase() do any work). */
  movedModules: number
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
 * REST door). Throws cloud_key_missing if the token isn't set yet.
 *
 * THE ONE PLACE A `D1Rest` IS BUILT, which is why the two optional halves of the
 * door are wired here rather than at fifty call sites:
 *
 *   • `recordFailure` — where a failed call to Cloudflare gets RECORDED. A
 *     NATIVE write to the operations database, deliberately: recording a
 *     REST-door outage back through the REST door is the loop the throttle in
 *     `recordOutbound` exists to bound.
 *   • `trace` — the per-request tally of what the door cost. Per-request because
 *     this function runs once per request; the id makes the spans line up with
 *     the `timed()` line for the same click.
 */
export function d1ConfigFrom(env: GatingEnv, request?: Request): D1Rest {
  if (!env.CF_D1_TOKEN)
    throw new Error(
      "cloud_key_missing: the Cloudflare D1 token isn't set yet, so team databases can't be reached."
    )
  return {
    accountId: env.CF_ACCOUNT_ID,
    apiToken: env.CF_D1_TOKEN,
    recordFailure: dbRecorder(opsDatabase(env), "d1-rest"),
    trace: { req: request ? requestIdFrom(request) : undefined, spans: [] },
  }
}

/**
 * Ask the auth worker (one session system, one master) who this request is.
 *
 * THE BUSIEST CROSS-SERVICE CALL IN THE BASE — every gated request in every
 * worker starts here, which makes auth the component everything else depends on
 * (ARCHITECTURE §1c). Two consequences are handled explicitly:
 *
 *   • **Bounded.** A service binding has no default timeout, so a slow auth used
 *     to hold every request in every worker open until the platform killed them.
 *
 *   • **"No" and "no answer" are different.** A non-200 means auth looked and
 *     says this person is not signed in → `null` → the caller's 401, correct. But
 *     an auth that does not ANSWER used to take the same branch, so an auth
 *     outage silently logged everyone out instead of admitting a fault. It now
 *     throws a 503 that says so. Signing a working user out is the worse failure:
 *     it destroys their draft and sends them to a login screen that cannot help.
 */
export async function whoAmI(request: Request, env: GatingEnv): Promise<SessionUser | null> {
  const res = await callService(
    env.AUTH,
    "https://auth/api/auth/me",
    { headers: { Cookie: request.headers.get("Cookie") ?? "" } },
    { req: request.headers.get(REQUEST_ID_HEADER) ?? undefined, worker: "gating", place: "whoAmI" }
  )
  if (!res)
    throw new GuardError(
      503,
      "auth_unreachable",
      "We couldn't check your sign-in just now. Nothing was changed — try again in a moment."
    )
  if (!res.ok) return null
  return ((await res.json()) as { user: SessionUser }).user
}

export function toActor(user: SessionUser, request?: Request): Actor {
  return {
    id: user.id,
    email: user.email,
    name: [user.firstName, user.lastName].filter(Boolean).join(" "),
    // The one place the door is read. Every activity row written during this
    // request inherits it, with no per-module wiring — see Actor.origin.
    origin: request ? originFrom(request) : undefined,
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
    `SELECT tm.role_id, t.database_id, t.moved_modules
     FROM team_members tm
     JOIN teams t ON t.id = tm.team_id AND t.deactivated_at IS NULL AND t.db_status = 'ready'
     WHERE tm.team_id = ? AND tm.user_id = ? AND tm.deactivated_at IS NULL`
  )
    .bind(teamId, userId)
    .first<{ role_id: string; database_id: string; moved_modules: number | null }>()
  if (!row) throw new GuardError(403, "not_member", "You're not a member of this team.")
  return {
    userId,
    teamId,
    roleId: row.role_id,
    databaseId: row.database_id,
    movedModules: row.moved_modules ?? 0,
  }
}

/** WHERE DOES THIS MODULE'S DATA ACTUALLY LIVE?
 *
 * Normally: the team's own database, and this returns immediately having read
 * nothing. Once the module MOVER has relocated a module out of a full team
 * database, that module's tables live somewhere else — and every module lib
 * still asks `guard.databaseId`. That gap made the mover destructive: it copied
 * the rows, recorded the new home, deleted the originals, and nothing ever read
 * the new home, so the module went blank. (Scaling review, 2026-08-11.)
 *
 * The lookup is skipped entirely unless the team has actually had something
 * moved — `teams.moved_modules` is a counter the mover maintains — so the
 * ordinary request pays nothing at all for machinery it isn't using. */
export async function moduleDatabase(
  env: GatingEnv,
  guard: MemberGuard,
  module: string
): Promise<string> {
  if (!guard.movedModules) return guard.databaseId
  const row = await env.DB.prepare(
    "SELECT database_id FROM team_module_databases WHERE team_id = ? AND module = ?"
  )
    .bind(guard.teamId, module)
    .first<{ database_id: string }>()
  return row?.database_id ?? guard.databaseId
}

/** The standard opening every team-scoped handler shares: who are you, the
 * Cloudflare config, and a validated guard for your ACTIVE team. Throws
 * GuardError (mapped to a response centrally) on any failure. */
export async function teamContext(request: Request, env: GatingEnv): Promise<TeamCtx> {
  // THE THREE HOPS BEFORE ANY WORK, each timed — because they are three very
  // different costs that look identical from outside: a service binding (same-colo
  // RPC), a native D1 binding read (in-colo), and, once `requireRight` runs, an
  // HTTPS round trip to api.cloudflare.com. Attributing a slow gated request to
  // the right one of those is the whole difference between "auth is the tax" and
  // "the data door is the tax". (Speed diagnosis, 2026-08-25.)
  const req = requestIdFrom(request)
  const startedWho = Date.now()
  const user = await whoAmI(request, env)
  traceHop({ req, worker: "gating", op: "whoAmI:auth-binding", ms: Date.now() - startedWho })
  if (!user) throw new GuardError(401, "signed_out", "Not signed in.")

  // whoAmI already carries the active team (auth /me reads it fresh from the
  // users row) — no need for a second native-DB read for the same value.
  if (!user.currentTeamId) throw new GuardError(409, "no_team", "No active team.")

  const cfg = d1ConfigFrom(env, request)
  const startedMember = Date.now()
  const guard = await requireMember(env, user.id, user.currentTeamId)
  traceHop({ req, worker: "gating", op: "requireMember:core-DB", ms: Date.now() - startedMember })

  // THE PER-TENANT SURGE CEILING, here rather than at the gateway — because
  // here is the first point the team is KNOWN. A team-scoped call carries no
  // team in its URL (it is resolved from the session), so the public door
  // cannot key on one without a session lookup of its own on every request.
  // This costs nothing: the team id is already in hand.
  //
  // The gateway's ceiling stops one PERSON flooding; this stops one TENANT
  // spending the capacity of the dozens of others sharing the account.
  await limitTeam(env, guard.teamId)

  return { user, actor: toActor(user, request), cfg, guard }
}

/** Charge one request against the team's ceiling; 429 if it is spent. Fails
 * OPEN — an absent binding (a fork, `wrangler dev`, a test) or a limiter hiccup
 * lets the request through, because a safety feature that takes the app down
 * when its own dependency wobbles has inverted its purpose. */
async function limitTeam(env: GatingEnv, teamId: string): Promise<void> {
  const limiter = (env as { TEAM_LIMITER?: RateLimiter }).TEAM_LIMITER
  if (!limiter) return
  try {
    const { success } = await limiter.limit({ key: `t:${teamId}` })
    if (!success)
      throw new GuardError(
        429,
        "too_many_requests",
        "Your team is making a lot of requests at once. Give it a few seconds and try again."
      )
  } catch (e) {
    if (e instanceof GuardError) throw e
    console.error("team rate limiter unavailable; allowing the request:", e)
  }
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
