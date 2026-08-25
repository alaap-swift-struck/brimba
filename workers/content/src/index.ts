// Brimba CONTENT worker — team-DB content modules (Learning today; Help next).
// This file is just the SWITCHBOARD: it maps each route to a handler (grouped by
// domain under ./routes/*) and centrally maps thrown GuardErrors to clean HTTP
// responses. The shared opening (whoAmI / teamContext / requireRight) lives in
// the shared gating seam. No cron — content modules have no nightly housekeeping.
//
//   GET  /api/content/learning            -> the team's learning items (?id → one)
//   POST /api/content/learning            -> create a learning item
//   POST /api/content/learning/update     -> edit a learning item
//   POST /api/content/learning/active     -> deactivate / reactivate an item (never deleted)
//   POST /api/content/learning/bulk-active -> (de)activate MANY items at once → {updated,skipped}
//   POST /api/content/learning/done       -> mark an item done / not-done (your own progress)
//   POST /api/content/learning/upload      -> upload a local file (image/clip) to team R2 → URL
//   GET  /api/content/learning/progress   -> curator dashboard (every member's done state)
//   GET  /api/content/help                -> the team's tickets (?scope=mine|all, ?id → one)
//   GET  /api/content/help/thread         -> one ticket's replies (?id=<ticketId>)
//   POST /api/content/help                -> raise a ticket
//   POST /api/content/help/update         -> edit a ticket
//   POST /api/content/help/status         -> move a ticket along its fixed lifecycle
//   POST /api/content/help/bulk-status    -> move MANY tickets to one status → {updated,skipped}
//   POST /api/content/help/bulk-status-by-filter -> the SET-shaped bulk (facets → status)
//   POST /api/content/help/reply          -> add a reply to a ticket's thread
//   GET  /api/content/help/stakeholders   -> a ticket's stakeholders (?id=<ticketId>)
//   POST /api/content/help/stakeholders   -> manually add a stakeholder (add-only)
//   GET  /api/content/health

import { brand } from "../../../shared/brand"
import { opsDatabase } from "../../../shared/workers/ops-db"
import { withIdempotency } from "../../../shared/workers/concurrency"
import { fail, json } from "../../../shared/workers/http"
import { GuardError } from "../../../shared/workers/gating"
import { recordWorkerError } from "../../../shared/workers/error-log"
import type { Env } from "./env"
import {
  getLearning,
  getLearningProgress,
  postBulkSetLearningActive,
  postCreateLearning,
  postLearningDone,
  postSetLearningActive,
  postUpdateLearning,
  postUploadLearningFile,
  getLearningExport,
} from "./routes/learning"
import {
  getHelp,
  getHelpStakeholders,
  getHelpThread,
  postAddStakeholder,
  postBulkHelpStatus,
  postCreateHelp,
  postHelpReply,
  postHelpStatus,
  postUpdateHelp,
  postBulkHelpStatusByFilter,
} from "./routes/help"

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
  "GET /api/content/learning": { handler: getLearning, kind: "read" },
  "GET /api/content/learning/export": { handler: getLearningExport, kind: "read" },
  "POST /api/content/learning": { handler: postCreateLearning, kind: "mutation" },
  "POST /api/content/learning/update": { handler: postUpdateLearning, kind: "mutation" },
  "POST /api/content/learning/active": { handler: postSetLearningActive, kind: "mutation" },
  "POST /api/content/learning/bulk-active": { handler: postBulkSetLearningActive, kind: "mutation" },
  "POST /api/content/learning/done": { handler: postLearningDone, kind: "mutation" },
  // Stores a file in R2 but changes NO record (no row to patch) → housekeeping.
  "POST /api/content/learning/upload": { handler: postUploadLearningFile, kind: "housekeeping" },
  "GET /api/content/learning/progress": { handler: getLearningProgress, kind: "read" },
  "GET /api/content/help": { handler: getHelp, kind: "read" },
  "GET /api/content/help/thread": { handler: getHelpThread, kind: "read" },
  "POST /api/content/help": { handler: postCreateHelp, kind: "mutation" },
  "POST /api/content/help/update": { handler: postUpdateHelp, kind: "mutation" },
  "POST /api/content/help/status": { handler: postHelpStatus, kind: "mutation" },
  "POST /api/content/help/bulk-status": { handler: postBulkHelpStatus, kind: "mutation" },
  // The SET-shaped bulk: facet filter → one status (counts first; publishes only when moved).
  "POST /api/content/help/bulk-status-by-filter": { handler: postBulkHelpStatusByFilter, kind: "mutation" },
  "POST /api/content/help/reply": { handler: postHelpReply, kind: "mutation" },
  "GET /api/content/help/stakeholders": { handler: getHelpStakeholders, kind: "read" },
  "POST /api/content/help/stakeholders": { handler: postAddStakeholder, kind: "mutation" },
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)
    const route = `${request.method} ${pathname}`

    try {
      // A health check that can only ever say "yes" is not a health check. This
      // returned `{ ok: true }` unconditionally, so a worker deployed without
      // CF_D1_TOKEN — which means every team-database read and write 503s —
      // reported itself perfectly healthy, and the smoke run agreed. That is the
      // exact failure BOOTSTRAP.md warns about: a fresh environment that skipped
      // a secret looks fine until a person clicks something.
      //
      // BOOLEANS ONLY, and deliberately. This door is UNAUTHENTICATED, so it may
      // say whether a thing is configured and nothing else — never a value,
      // never a length, never which secret is the missing one. "Configured /
      // not configured" is all an operator needs and all an attacker gets.
      if (route === "GET /api/content/health")
        return json({
          ok: true,
          bindings: { d1Token: !!env.CF_D1_TOKEN, internalKey: !!env.INTERNAL_KEY, ops: !!env.OPS },
        })
      const def = ROUTES[route]
      if (!def) return fail(404, "not_found", "No such content action.")
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
          await recordWorkerError(opsDatabase(env), "content", `${request.method} ${new URL(request.url).pathname}`, e, request)
        return fail(e.status, e.code, e.message)
      }
      console.error("content worker error:", e)
      // Record the crash in the central error log (core DB) — best-effort,
      // never blocks the response. Clean GuardError refusals never reach here.
      await recordWorkerError(opsDatabase(env), "content", `${request.method} ${new URL(request.url).pathname}`, e, request)
      const message = e instanceof Error ? e.message : ""
      if (message.startsWith("cloud_key_missing:"))
        return fail(503, "cloud_key_missing", `${brand.name}'s cloud key isn't set up yet — content is paused.`)
      return fail(500, "internal", "Something went wrong on our side. Try again.")
    }
  },
} satisfies ExportedHandler<Env>
