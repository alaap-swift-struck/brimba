// Brimba DATA-OPS worker — bulk data import today (the AI agent brain lands here
// next). This file is the SWITCHBOARD: it maps each route to a handler and centrally
// turns thrown GuardErrors into clean HTTP responses. The shared opening (whoAmI /
// teamContext / requireRight) lives in the shared gating seam.
//
//   GET  /api/data-ops/import/targets   -> the active, supported import targets
//   POST /api/data-ops/import           -> start a session for a target
//   POST /api/data-ops/import/file      -> upload CSV text; auto-map + preview
//   POST /api/data-ops/import/mapping   -> adjust the column mapping; re-preview
//   GET  /api/data-ops/import/preview   -> the session's current preview (?id=)
//   POST /api/data-ops/import/confirm   -> write every mapped row (insert-only)
//   POST /api/data-ops/admin/seed-targets -> owner-only: seed the import catalog
//   GET  /api/data-ops/agent/usage      -> the team's AI quota (free + credits)
//   GET  /api/data-ops/agent/usage-log  -> the team's AI usage trail (one row/turn)
//   POST /api/data-ops/admin/grant-credits -> owner-only: top up a team's credits
//   POST /api/data-ops/agent/chat       -> run one agent turn (answer or act)
//   POST /api/data-ops/agent/confirm    -> approve/decline a proposed action, resume
//   GET  /api/data-ops/agent/threads    -> the caller's saved conversations
//   GET  /api/data-ops/agent/thread     -> one conversation's messages (?id=)
//   GET  /api/data-ops/health

import { brand } from "../../../shared/brand"
import { fail, json } from "../../../shared/workers/http"
import { GuardError } from "../../../shared/workers/gating"
import { recordWorkerError } from "../../../shared/workers/error-log"
import type { Env } from "./env"
import {
  getImportPreview,
  getImportTargets,
  postImportConfirm,
  postImportFile,
  postImportMapping,
  postImportStart,
} from "./routes/import"
import { getErrors, postResolveError, postSeedTargets } from "./routes/admin"
import {
  getAgentThread,
  getAgentThreads,
  getAgentUsage,
  getAgentUsageLog,
  postAgentChat,
  postAgentConfirm,
  postGrantCredits,
} from "./routes/agent"

/**
 * THE LIVE-SYNC SEAM (locked, CACHING.md "Every mutation publishes"). Every route is
 * classified so a new one CAN'T be added without consciously deciding how it goes live
 * (publish-seam.test.ts enforces it):
 *   • "read"        — a GET; changes nothing, broadcasts nothing.
 *   • "mutation"    — a write other clients can see, so it MUST broadcast a ping.
 *   • "housekeeping" — the reviewed deny-list: a write that intentionally broadcasts
 *                      NOTHING. The import session steps (start/file/mapping) only
 *                      shape the CALLER's own draft, returned synchronously in the
 *                      same response — no other screen needs a ping. The owner seed
 *                      writes the global catalog (no team channel). Only confirm,
 *                      which actually creates rows in a shared table, broadcasts.
 */
type RouteKind = "read" | "mutation" | "housekeeping"
type Handler = (request: Request, env: Env) => Promise<Response>
export const ROUTES: Record<string, { handler: Handler; kind: RouteKind }> = {
  "GET /api/data-ops/import/targets": { handler: getImportTargets, kind: "read" },
  "GET /api/data-ops/import/preview": { handler: getImportPreview, kind: "read" },
  "POST /api/data-ops/import": { handler: postImportStart, kind: "housekeeping" },
  "POST /api/data-ops/import/file": { handler: postImportFile, kind: "housekeeping" },
  "POST /api/data-ops/import/mapping": { handler: postImportMapping, kind: "housekeeping" },
  "POST /api/data-ops/import/confirm": { handler: postImportConfirm, kind: "mutation" },
  "POST /api/data-ops/admin/seed-targets": { handler: postSeedTargets, kind: "housekeeping" },
  // The central error log (owner-only, x-admin-key). Resolve is housekeeping:
  // private maintainer bookkeeping in the core DB — broadcasts nothing (rule 4).
  "GET /api/data-ops/admin/errors": { handler: getErrors, kind: "read" },
  "POST /api/data-ops/admin/errors/resolve": { handler: postResolveError, kind: "housekeeping" },
  "GET /api/data-ops/agent/usage": { handler: getAgentUsage, kind: "read" },
  "GET /api/data-ops/agent/usage-log": { handler: getAgentUsageLog, kind: "read" },
  "POST /api/data-ops/admin/grant-credits": { handler: postGrantCredits, kind: "mutation" },
  "GET /api/data-ops/agent/threads": { handler: getAgentThreads, kind: "read" },
  "GET /api/data-ops/agent/thread": { handler: getAgentThread, kind: "read" },
  // Housekeeping: the agent's chat/confirm only write the caller's OWN private
  // conversation (agent_threads/messages); any team-visible change is published by
  // the gated endpoint the executor calls act-as-user, not by these handlers.
  "POST /api/data-ops/agent/chat": { handler: postAgentChat, kind: "housekeeping" },
  "POST /api/data-ops/agent/confirm": { handler: postAgentConfirm, kind: "housekeeping" },
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)
    const route = `${request.method} ${pathname}`

    try {
      if (route === "GET /api/data-ops/health") return json({ ok: true })
      const def = ROUTES[route]
      if (!def) return fail(404, "not_found", "No such data-ops action.")
      return await def.handler(request, env)
    } catch (e) {
      if (e instanceof GuardError) return fail(e.status, e.code, e.message)
      console.error("data-ops worker error:", e)
      // Record the crash in the central error log (core DB) — best-effort,
      // never blocks the response. Clean GuardError refusals never reach here.
      await recordWorkerError(env.DB, "data-ops", `${request.method} ${new URL(request.url).pathname}`, e)
      const message = e instanceof Error ? e.message : ""
      if (message.startsWith("cloud_key_missing:"))
        return fail(503, "cloud_key_missing", `${brand.name}'s cloud key isn't set up yet — imports are paused.`)
      return fail(500, "internal", "Something went wrong on our side. Try again.")
    }
  },
} satisfies ExportedHandler<Env>
