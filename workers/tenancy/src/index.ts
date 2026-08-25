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
//   GET  /api/tenancy/invites/audit        -> one invite's invite_logs audit (?id)
//   POST /api/tenancy/invites              -> invite someone by email + role
//   POST /api/tenancy/invites/revoke       -> revoke ("redact") a pending invite
//   GET  /api/tenancy/invitations          -> invites I've RECEIVED (any signed-in user)
//   POST /api/tenancy/invitations/accept   -> accept a received invite (join + switch)
//   POST /api/tenancy/admin/migrate-teams  -> roll team-schema migrations (x-admin-key)
//   GET  /api/tenancy/admin/db-sizes       -> size every team DB + open alarms
//   POST /api/tenancy/admin/move-module    -> relocate a heavy module (the mover)
//   GET  /api/tenancy/health
//   cron (nightly)                         -> size alarms, retention, shard
//                                             splits, the orphan sweep, the
//                                             account-wide AI spend alarm, and
//                                             the error digest email

import { brand } from "../../../shared/brand"
import { opsDatabase } from "../../../shared/workers/ops-db"
import { withIdempotency } from "../../../shared/workers/concurrency"
import { fail, json } from "../../../shared/workers/http"
import { recordWorkerError } from "../../../shared/workers/error-log"
import { GuardError } from "./lib/permissions"
import { buildErrorDigest } from "./lib/error-digest"
import { sendMail } from "./lib/notify"
import { runRetention, sweepOrphanedUploads } from "./lib/housekeeping"
import {
  checkAccountAiSpend,
  checkDatabaseSizes,
  ensureNightlyTables,
  noteCronHeartbeat,
  noteSweepCursor,
  recomputeShardCounts,
  sweepCursor,
} from "./lib/sharding"
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
  getRolesExport,
  postCreateRole,
  postRolePerms,
  postSetRoleActive,
  postUpdateRole,
} from "./routes/roles"
import {
  getInviteAudit,
  getInvites,
  getReceivedInvitations,
  postAcceptInvitation,
  postCreateInvite,
  postRevokeInvite,
} from "./routes/invites"
import {
  getSelectable,
  getSelectableExport,
  postCreateSelectable,
  postBulkSetSelectableActive,
  postSetSelectableActive,
  postUpdateSelectable,
} from "./routes/selectable"
import { dbSizes, migrateTeams, moveModule } from "./routes/admin"

/**
 * THE LIVE-SYNC SEAM (locked, CACHING.md "Every mutation publishes"). Every
 * route is classified so a new one CAN'T be added without consciously deciding
 * how it goes live — that's the structural can't-forget guarantee (a guard test,
 * publish-seam.test.ts, enforces it):
 *   • "read"        — a GET; changes nothing, broadcasts nothing.
 *   • "mutation"    — changes state, so it MUST broadcast a change ping
 *                     (publishChange / publishUserChange — directly or via a lib).
 *   • "housekeeping" — the deny-list: a write that intentionally broadcasts
 *                      NOTHING (a private session pointer, or an ops-only action
 *                      with no client-visible row). Adding one is a reviewed choice.
 */
type RouteKind = "read" | "mutation" | "housekeeping"
type Handler = (request: Request, env: Env) => Promise<Response>
export const ROUTES: Record<string, { handler: Handler; kind: RouteKind }> = {
  "POST /api/tenancy/bootstrap": { handler: bootstrap, kind: "mutation" },
  "GET /api/tenancy/active": { handler: active, kind: "read" },
  // switch-team flips only the caller's own current_team pointer — no shared row
  // changes, and we deliberately don't force the caller's OTHER devices to follow.
  "POST /api/tenancy/switch-team": { handler: switchActiveTeam, kind: "housekeeping" },
  "POST /api/tenancy/teams": { handler: createNamedTeam, kind: "mutation" },
  "POST /api/tenancy/teams/update": { handler: postUpdateTeam, kind: "mutation" },
  "GET /api/tenancy/teams": { handler: myTeams, kind: "read" },
  "GET /api/tenancy/members": { handler: getMembers, kind: "read" },
  "POST /api/tenancy/members/role": { handler: postMemberRole, kind: "mutation" },
  "POST /api/tenancy/members/remove": { handler: postMemberRemove, kind: "mutation" },
  "GET /api/tenancy/my-permissions": { handler: getMyPerms, kind: "read" },
  "GET /api/tenancy/roles": { handler: getRoles, kind: "read" },
  "GET /api/tenancy/roles/export": { handler: getRolesExport, kind: "read" },
  "POST /api/tenancy/roles": { handler: postCreateRole, kind: "mutation" },
  "POST /api/tenancy/roles/update": { handler: postUpdateRole, kind: "mutation" },
  "POST /api/tenancy/roles/active": { handler: postSetRoleActive, kind: "mutation" },
  "GET /api/tenancy/roles/permissions": { handler: getRolePerms, kind: "read" },
  "POST /api/tenancy/roles/permissions": { handler: postRolePerms, kind: "mutation" },
  "GET /api/tenancy/activity": { handler: getActivityFeed, kind: "read" },
  "GET /api/tenancy/team-meta": { handler: getTeamMetaFeed, kind: "read" },
  "GET /api/tenancy/invites": { handler: getInvites, kind: "read" },
  "GET /api/tenancy/invites/audit": { handler: getInviteAudit, kind: "read" },
  "POST /api/tenancy/invites": { handler: postCreateInvite, kind: "mutation" },
  "POST /api/tenancy/invites/revoke": { handler: postRevokeInvite, kind: "mutation" },
  "GET /api/tenancy/invitations": { handler: getReceivedInvitations, kind: "read" },
  "POST /api/tenancy/invitations/accept": { handler: postAcceptInvitation, kind: "mutation" },
  "GET /api/tenancy/selectable": { handler: getSelectable, kind: "read" },
  "GET /api/tenancy/selectable/export": { handler: getSelectableExport, kind: "read" },
  "POST /api/tenancy/selectable": { handler: postCreateSelectable, kind: "mutation" },
  "POST /api/tenancy/selectable/update": { handler: postUpdateSelectable, kind: "mutation" },
  "POST /api/tenancy/selectable/active": { handler: postSetSelectableActive, kind: "mutation" },
  "POST /api/tenancy/selectable/bulk-active": { handler: postBulkSetSelectableActive, kind: "mutation" },
  // admin/* are ops-only (roll migrations, relocate a module's DB) — they touch
  // no client-visible app row, so they broadcast nothing.
  "POST /api/tenancy/admin/migrate-teams": { handler: migrateTeams, kind: "housekeeping" },
  "GET /api/tenancy/admin/db-sizes": { handler: dbSizes, kind: "read" },
  "POST /api/tenancy/admin/move-module": { handler: moveModule, kind: "housekeeping" },
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)
    const route = `${request.method} ${pathname}`

    try {
      if (route === "GET /api/tenancy/health") return json({ ok: true })
      const def = ROUTES[route]
      if (!def) return fail(404, "not_found", "No such tenancy action.")
      // A client may send `Idempotency-Key` on a mutation to make it safe to
      // retry: the first request does the work and its outcome is stored, and a
      // retry replays that outcome instead of writing again. Without the header
      // this is a pass-through and costs nothing (shared/workers/concurrency.ts).
      if (def.kind !== "mutation") return await def.handler(request, env)
      return await withIdempotency(request, env.DB, route, () => def.handler(request, env))
    } catch (e) {
      // A 5xx GuardError IS an outage, and it was returning without a row.
      //
      // `GuardError` carries both refusals and failures. A 403 is the system
      // working — the person may not do that, and recording it would fill the
      // table with correct behaviour. But `whoAmI` throws a 503 when AUTH does
      // not answer, and `whoAmI` is the busiest call in the base: an auth outage
      // 503s every screen for everyone, and left its only evidence in an absence.
      // The one incident you would most want a record of produced none.
      //
      // So the branch splits on the status, not on the type. (Error-log review,
      // 2026-08-25.)
      if (e instanceof GuardError) {
        if (e.status >= 500)
          await recordWorkerError(opsDatabase(env), "tenancy", `${request.method} ${new URL(request.url).pathname}`, e, request)
        return fail(e.status, e.code, e.message)
      }
      console.error("tenancy worker error:", e)
      // Record the crash in the central error log (core DB) — best-effort,
      // never blocks the response. Clean GuardError refusals never reach here.
      await recordWorkerError(opsDatabase(env), "tenancy", `${request.method} ${new URL(request.url).pathname}`, e, request)
      const message = e instanceof Error ? e.message : ""
      if (message.startsWith("cloud_key_missing:"))
        return fail(503, "cloud_key_missing", `${brand.name}'s cloud key isn't set up yet — team creation is paused.`)
      return fail(500, "internal", "Something went wrong on our side. Try again.")
    }
  },

  /** Nightly cron: the 80% database-size alarms (locked sharding machinery),
   * retention, the live-channel split, the orphan sweep, the account-wide AI
   * spend alarm — and, last, the DIGEST that is the only thing here a person
   * ever sees. */
  async scheduled(_controller, env): Promise<void> {
    try {
      // The job's own bookkeeping tables, on first run. No-op every night after.
      await ensureNightlyTables(env)
      const result = await checkDatabaseSizes(env, d1Config(env))
      console.log(
        `size check: ${result.checked} database(s) watched, ${result.alerted.length} alarm(s)`
      )
      // Then forget what may be forgotten — logs only, never a record. Runs
      // AFTER the sizing so tonight's alarm reflects tonight's real size.
      const swept = await runRetention(env, d1Config(env))
      console.log(`retention: ${swept.core} core table(s), ${swept.teams} team database(s)`)
      // And split the live channel of any team that has outgrown one object —
      // the request-side valve, alongside the two storage-side ones above.
      const shards = await recomputeShardCounts(env)
      console.log(`live channels: ${shards.raised.length} team(s) split further`)
      // Object storage was the last thing here growing with nothing watching it:
      // a file picked, then replaced, stays in the bucket for ever with nothing
      // linking to it and no screen that would ever show it to you.
      // ONE PAGE OF TEAMS, resuming where last night stopped — the walk used to
      // be O(every tenant) inside a single invocation with a hard subrequest
      // ceiling. The cursor is saved IMMEDIATELY, before anything below can
      // throw, or a step that fails every night would pin the rota to page one
      // and starve every team behind it.
      const orphans = await sweepOrphanedUploads(env, d1Config(env), await sweepCursor(env))
      await noteSweepCursor(env, orphans.nextCursor)
      console.log(
        `uploads: ${orphans.deleted} orphan(s) removed of ${orphans.scanned} scanned across ${orphans.teams} team(s)`
      )
      // The only limit in the base that sees the WHOLE account rather than one
      // team — a hundred tenants each inside their own quota is still a hundred
      // times the cost, and nothing else would notice.
      const spend = await checkAccountAiSpend(env)
      console.log(`ai spend: ${spend.used}/${spend.cap} unit(s) account-wide today`)

      // THE DIGEST — last, so it reports on everything above, including anything
      // they just recorded. Built BEFORE tonight's heartbeat is written, because
      // it checks that heartbeat to find out whether last night's run happened.
      //
      // NULL MEANS A CLEAN NIGHT AND NOTHING IS SENT. The absence of the email
      // IS the all-clear — which only works if a failure to SEND is loud, so an
      // undeliverable digest records an error rather than returning quietly.
      const digest = await buildErrorDigest(env)
      if (digest) {
        const to = env.OPS_ALERT_EMAIL?.trim()
        if (!to) {
          await recordWorkerError(
            opsDatabase(env),
            "tenancy",
            "cron/nightly-digest",
            new Error("there is an error digest to send but OPS_ALERT_EMAIL is not set — nobody is being told")
          )
        } else if (!(await sendMail(env, to, digest.subject, digest))) {
          // The bug this exists to prevent: auth answers 200 with { sent: false }
          // when RESEND_API_KEY is unset. Combined with "silence means a clean
          // night", a digest that never sends is INDISTINGUISHABLE from a healthy
          // system — so the one thing that must never be silent is this.
          await recordWorkerError(
            opsDatabase(env),
            "tenancy",
            "cron/nightly-digest",
            new Error(`the nightly error digest could not be delivered to ${to} — the mailer is not configured or refused it, so no alert is reaching anyone`)
          )
        }
      }

      // THE HEARTBEAT, written last so it means "the whole pass completed".
      // Without it a cron that stops firing is invisible: it raises no error and
      // its silence looks exactly like a quiet night.
      await noteCronHeartbeat(env)
    } catch (e) {
      // LAW R12: unattended work has no user watching, so a swallowed failure would be
      // invisible — record it to the error store, not just the console.
      //
      // `cron/nightly`, not `cron/size-check`: this one try now covers sizing,
      // retention, shard counts, the orphan sweep, the spend alarm and the
      // digest, and filing a digest failure under the size check would send
      // whoever reads it to the wrong place. The place IS the signature the
      // digest groups by, so a wrong one is a wrong diagnosis every night.
      console.error("nightly job failed:", e)
      await recordWorkerError(opsDatabase(env), "tenancy", "cron/nightly", e)
    }
  },
} satisfies ExportedHandler<Env>
