// Brimba TENANCY worker — teams, memberships, and the team-database factory.
// This file is just the SWITCHBOARD: it maps each route to a handler (grouped
// by domain under ./routes/*) and centrally maps thrown GuardErrors to clean
// HTTP responses. The shared opening (whoAmI / teamContext / adminGuard) lives
// in ./context. Nightly cron drives the 80% DB-size alarms.
//
//   POST /api/tenancy/bootstrap            -> accept invites OR make the personal team
//   GET  /api/tenancy/active               -> current team + your role + teams
//   POST /api/tenancy/switch-team          -> change the active team
//   POST /api/tenancy/teams                -> create a new team (named)
//   POST /api/tenancy/teams/update         -> edit the active team's name + logo
//   GET  /api/tenancy/teams                -> my teams (for switcher + home)
//   GET  /api/tenancy/members              -> the team's members (+ identity)
//   POST /api/tenancy/members/role         -> change a member's role
//   POST /api/tenancy/members/remove       -> remove (deactivate) a member
//   GET  /api/tenancy/my-permissions       -> the caller's own rights (page guard)
//   GET  /api/tenancy/roles                -> the team's roles (+ member counts)
//   POST /api/tenancy/roles                -> create a new role
//   POST /api/tenancy/roles/update         -> rename / re-describe a role
//   POST /api/tenancy/roles/active         -> deactivate / reactivate a role (never deleted)
//   GET  /api/tenancy/roles/permissions    -> a role's permission matrix (?roleId)
//   POST /api/tenancy/roles/permissions    -> save a role's permission matrix
//   GET  /api/tenancy/activity             -> activity feed (?scope=team|user|role&id=)
//   GET  /api/tenancy/team-meta            -> the active team's Overview metadata
//   GET  /api/tenancy/invites              -> the team's invites (all statuses)
//   POST /api/tenancy/invites              -> invite someone by email + role
//   POST /api/tenancy/invites/revoke       -> revoke ("redact") a pending invite
//   GET  /api/tenancy/invitations          -> invites I've RECEIVED (any signed-in user)
//   POST /api/tenancy/invitations/accept   -> accept a received invite (join + switch)
//   POST /api/tenancy/admin/migrate-teams  -> roll team-schema migrations (x-admin-key)
//   GET  /api/tenancy/admin/db-sizes       -> size every team DB + open alarms
//   POST /api/tenancy/admin/move-module    -> relocate a heavy module (the mover)
//   GET  /api/tenancy/health
//   cron (nightly)                         -> the 80% size alarms

import { brand } from "../../../shared/brand"
import { fail, json } from "../../../shared/workers/http"
import { GuardError } from "./lib/permissions"
import { checkDatabaseSizes } from "./lib/sharding"
import { d1Config } from "./lib/teams"
import type { Env } from "./env"
import {
  active,
  bootstrap,
  createNamedTeam,
  getActivityFeed,
  getTeamMetaFeed,
  myTeams,
  postUpdateTeam,
  switchActiveTeam,
} from "./routes/team"
import { getMembers, postMemberRemove, postMemberRole } from "./routes/members"
import {
  getMyPerms,
  getRolePerms,
  getRoles,
  postCreateRole,
  postRolePerms,
  postSetRoleActive,
  postUpdateRole,
} from "./routes/roles"
import {
  getInvites,
  getReceivedInvitations,
  postAcceptInvitation,
  postCreateInvite,
  postRevokeInvite,
} from "./routes/invites"
import { dbSizes, migrateTeams, moveModule } from "./routes/admin"

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)
    const route = `${request.method} ${pathname}`

    try {
      switch (route) {
        case "POST /api/tenancy/bootstrap":
          return await bootstrap(request, env)
        case "GET /api/tenancy/active":
          return await active(request, env)
        case "POST /api/tenancy/switch-team":
          return await switchActiveTeam(request, env)
        case "POST /api/tenancy/teams":
          return await createNamedTeam(request, env)
        case "POST /api/tenancy/teams/update":
          return await postUpdateTeam(request, env)
        case "GET /api/tenancy/teams":
          return await myTeams(request, env)
        case "GET /api/tenancy/members":
          return await getMembers(request, env)
        case "POST /api/tenancy/members/role":
          return await postMemberRole(request, env)
        case "POST /api/tenancy/members/remove":
          return await postMemberRemove(request, env)
        case "GET /api/tenancy/my-permissions":
          return await getMyPerms(request, env)
        case "GET /api/tenancy/roles":
          return await getRoles(request, env)
        case "POST /api/tenancy/roles":
          return await postCreateRole(request, env)
        case "POST /api/tenancy/roles/update":
          return await postUpdateRole(request, env)
        case "POST /api/tenancy/roles/active":
          return await postSetRoleActive(request, env)
        case "GET /api/tenancy/roles/permissions":
          return await getRolePerms(request, env)
        case "POST /api/tenancy/roles/permissions":
          return await postRolePerms(request, env)
        case "GET /api/tenancy/activity":
          return await getActivityFeed(request, env)
        case "GET /api/tenancy/team-meta":
          return await getTeamMetaFeed(request, env)
        case "GET /api/tenancy/invites":
          return await getInvites(request, env)
        case "POST /api/tenancy/invites":
          return await postCreateInvite(request, env)
        case "POST /api/tenancy/invites/revoke":
          return await postRevokeInvite(request, env)
        case "GET /api/tenancy/invitations":
          return await getReceivedInvitations(request, env)
        case "POST /api/tenancy/invitations/accept":
          return await postAcceptInvitation(request, env)
        case "POST /api/tenancy/admin/migrate-teams":
          return await migrateTeams(request, env)
        case "GET /api/tenancy/admin/db-sizes":
          return await dbSizes(request, env)
        case "POST /api/tenancy/admin/move-module":
          return await moveModule(request, env)
        case "GET /api/tenancy/health":
          return json({ ok: true })
        default:
          return fail(404, "not_found", "No such tenancy action.")
      }
    } catch (e) {
      if (e instanceof GuardError) return fail(e.status, e.code, e.message)
      console.error("tenancy worker error:", e)
      const message = e instanceof Error ? e.message : ""
      if (message.startsWith("cloud_key_missing:"))
        return fail(503, "cloud_key_missing", `${brand.name}'s cloud key isn't set up yet — team creation is paused.`)
      return fail(500, "internal", "Something went wrong on our side. Try again.")
    }
  },

  /** Nightly cron: the 80% database-size alarms (locked sharding machinery). */
  async scheduled(_controller, env): Promise<void> {
    try {
      const result = await checkDatabaseSizes(env, d1Config(env))
      console.log(
        `size check: ${result.checked} team DBs, ${result.alerted.length} alarm(s)`
      )
    } catch (e) {
      console.error("nightly size check failed:", e)
    }
  },
} satisfies ExportedHandler<Env>
