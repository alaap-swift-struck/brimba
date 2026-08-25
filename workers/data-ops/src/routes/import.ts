// Import routes: list the targets, start a session, upload + preview a file, adjust
// the mapping, and confirm (write). Gating: import has NO permission key of its own
// — every action is gated by the caller's `create` right on the TARGET module
// (member_roles or learning). The confirm writes act-as-user through the gated
// create endpoints, then publishes ONE coarse list-ping for the affected table.
// The session-shaping rules live in lib/import; the catalog code side in lib/targets.

import { fail, json } from "../../../../shared/workers/http"
import { optionalText, requireText, TEXT_LIMITS } from "../../../../shared/workers/validate"
import { publishChange } from "../../../../shared/workers/realtime"
import { GuardError, hasRight, requireRight, teamContext } from "../../../../shared/workers/gating"
import {
  applyFile,
  applyMapping,
  confirmImport,
  getActiveCatalog,
  getSessionView,
  startSession,
  targetForSession,
} from "../lib/import"
import {
  addBatchFile,
  confirmBatch,
  createBatch,
  getBatchView,
  listBatchSummaries,
  planBatch,
  planModules,
} from "../lib/import-batch"
import { consumeAiUnit } from "../lib/credits"
import { sampleRows, TARGETS } from "../lib/targets"
import { csvResponse, toCsv } from "../../../../shared/workers/csv"
import type { D1Rest } from "../../../../shared/workers/d1-rest"
import type { MemberGuard } from "../../../../shared/workers/gating"
import type { Env } from "../env"

/** Reject oversized CSV uploads BEFORE parsing/persisting — a huge file would
 * otherwise exhaust the worker and bloat the team DB before the row cap is reached. */
const MAX_CSV_BYTES = 5_000_000

/** GET /api/data-ops/import/targets — the active, supported import targets. */
export async function getImportTargets(request: Request, env: Env): Promise<Response> {
  await teamContext(request, env) // any signed-in member may see the catalog
  return json({ targets: await getActiveCatalog(env) })
}

/** GET /api/data-ops/import/sample?tableKey= — a downloadable sample CSV showing a
 * good file for that target (headers = column labels + one example row). Just a
 * template (no team data), so any signed-in member may fetch it. Every import place
 * offers this — AGENTIC-IMPORT §10 (show a good file before people prepare theirs). */
export async function getImportSample(request: Request, env: Env): Promise<Response> {
  await teamContext(request, env)
  const key = new URL(request.url).searchParams.get("tableKey") ?? ""
  const target = TARGETS[key]
  if (!target) return fail(400, "invalid_target", "That isn't an importable target.")
  const { header, row } = sampleRows(target)
  return csvResponse(`${target.tableKey}-sample.csv`, toCsv(header, [row]))
}

/** POST /api/data-ops/import — start a session for a target (gated on target create). */
export async function postImportStart(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  const body = (await request.json().catch(() => ({}))) as { tableKey?: string }
  const def = body.tableKey ? TARGETS[body.tableKey] : undefined
  if (!def || !body.tableKey) return fail(400, "invalid_target", "Pick a valid import target.")
  await requireRight(cfg, guard, def.module, "create")
  const { summary, catalog } = await startSession(env, cfg, guard, actor, body.tableKey)
  return json({
    session: summary,
    target: { tableKey: catalog.tableKey, displayName: catalog.displayName, columns: def.columns },
  })
}

/** POST /api/data-ops/import/file — upload CSV text; auto-map + preview. */
export async function postImportFile(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  const body = (await request.json().catch(() => ({}))) as {
    sessionId?: string
    fileName?: string
    csv?: string
  }
  // Ids through the boundary seam like every other stored string: truthiness only
  // proved presence, and the `sessionId?: string` above is erased before the request
  // arrives. (Security round 5.)
  const sessionId = requireText(body.sessionId, "sessionId", TEXT_LIMITS.short)
  if (typeof body.csv !== "string")
    return fail(400, "invalid_input", "sessionId and csv are required.")
  if (body.csv.length > MAX_CSV_BYTES)
    return fail(413, "file_too_large", "That file is too large to import. Export a smaller CSV (up to about 5 MB).")
  const { target } = await targetForSession(env, cfg, guard, sessionId)
  await requireRight(cfg, guard, target.module, "create")
  // The filename is stored, so it goes through the boundary seam like every
  // other stored string: sqlString escapes quotes but does NOT strip NUL bytes
  // (SQLite rejects them → a 500) and does NOT cap length.
  const fileName = optionalText(body.fileName, "File name", TEXT_LIMITS.short) ?? ""
  const out = await applyFile(env, cfg, guard, sessionId, fileName, body.csv)
  return json({ session: out.summary, preview: out.preview })
}

/** POST /api/data-ops/import/mapping — adjust the column mapping; re-preview. */
export async function postImportMapping(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  const body = (await request.json().catch(() => ({}))) as {
    sessionId?: string
    mapping?: Record<string, string>
  }
  const sessionId = requireText(body.sessionId, "sessionId", TEXT_LIMITS.short)
  if (typeof body.mapping !== "object" || body.mapping === null)
    return fail(400, "invalid_input", "sessionId and mapping are required.")
  const { target } = await targetForSession(env, cfg, guard, sessionId)
  await requireRight(cfg, guard, target.module, "create")
  const out = await applyMapping(env, cfg, guard, sessionId, body.mapping)
  return json({ session: out.summary, preview: out.preview })
}

/** GET /api/data-ops/import/preview?id= — the session's current preview. */
export async function getImportPreview(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  const id = requireText(new URL(request.url).searchParams.get("id"), "An import session id", TEXT_LIMITS.short)
  const { target } = await targetForSession(env, cfg, guard, id)
  await requireRight(cfg, guard, target.module, "create")
  const view = await getSessionView(env, cfg, guard, id)
  return json({ session: view.summary, preview: view.preview, columns: view.columns })
}

/** POST /api/data-ops/import/confirm — write every mapped row (insert-only),
 * act-as-user through the gated create endpoint, then ONE list-ping for the table. */
export async function postImportConfirm(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  const body = (await request.json().catch(() => ({}))) as { sessionId?: string }
  const sessionId = requireText(body.sessionId, "sessionId", TEXT_LIMITS.short)
  const { target } = await targetForSession(env, cfg, guard, sessionId)
  await requireRight(cfg, guard, target.module, "create")
  const out = await confirmImport(env, request, cfg, guard, actor, sessionId)
  ctx.waitUntil(publishChange(env.REALTIME, guard.teamId, target.module))
  return json({ session: out.summary, result: out.result })
}

/* -------------------- agentic multi-file batch (AGENTIC-IMPORT.md) -------------------- */

/** The caller may use the import batch only if they can `create` into at least one
 * catalog target — otherwise a Viewer could burn credits planning an import they
 * could never run. Each write is still re-gated per target at confirm + per row. */
async function requireAnyImportRight(cfg: D1Rest, guard: MemberGuard): Promise<void> {
  for (const t of Object.values(TARGETS)) if (await hasRight(cfg, guard, t.module, "create")) return
  throw new GuardError(403, "forbidden", "You don't have permission to import into any table on this team.")
}

/** POST /api/data-ops/import/batch — start a batch (draft). */
export async function postBatchStart(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  await requireAnyImportRight(cfg, guard)
  return json({ batch: await createBatch(cfg, guard, actor) })
}

/** POST /api/data-ops/import/batch/file — parse + attach one CSV to the batch. */
export async function postBatchFile(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await requireAnyImportRight(cfg, guard)
  const body = (await request.json().catch(() => ({}))) as { batchId?: string; name?: string; csv?: string }
  const batchId = requireText(body.batchId, "batchId", TEXT_LIMITS.short)
  if (typeof body.csv !== "string")
    return fail(400, "invalid_input", "batchId and csv are required.")
  const name = optionalText(body.name, "File name", TEXT_LIMITS.short) ?? "file"
  return json({ batch: await addBatchFile(cfg, guard, batchId, name, body.csv) })
}

/** POST /api/data-ops/import/batch/plan — the AGENT builds the plan. Metered on the
 * team AI credit pool (one turn), like a chat turn. */
export async function postBatchPlan(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await requireAnyImportRight(cfg, guard)
  const body = (await request.json().catch(() => ({}))) as { batchId?: string }
  const batchId = requireText(body.batchId, "batchId", TEXT_LIMITS.short)
  const c = await consumeAiUnit(env, guard.teamId)
  if (!c.ok)
    return fail(429, "over_quota", "You're out of AI requests for now — the plan step uses the assistant. They reset tomorrow, or an admin can add credits.")
  return json({ batch: await planBatch(env, cfg, guard, batchId), quota: c.quota })
}

/** POST /api/data-ops/import/batch/confirm — run the plan in dependency order. Gates
 * `create` on every target in the plan up front (fail fast), then publishes one
 * coarse ping per changed module. */
export async function postBatchConfirm(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  const body = (await request.json().catch(() => ({}))) as { batchId?: string }
  const batchId = requireText(body.batchId, "batchId", TEXT_LIMITS.short)
  const view = await getBatchView(cfg, guard, batchId)
  if (!view.plan) return fail(409, "no_plan", "Plan the import before running it.")
  for (const m of planModules(view.plan)) await requireRight(cfg, guard, m, "create")
  const { report, modules } = await confirmBatch(env, request, cfg, guard, actor, batchId)
  for (const m of modules) ctx.waitUntil(publishChange(env.REALTIME, guard.teamId, m))
  // …AND THE BATCH ROW ITSELF. The imported tables were published and the import
  // HISTORY never was: `import-batches:<teamId>` is a real subscribed screen (the
  // Past imports list under the drop zone) and nothing in the base had ever
  // pinged it, so a run stayed invisible to every teammate — and to the runner's
  // other devices — until somebody reloaded. Two admins importing in parallel
  // each saw only their own. The listener has been sitting ready and idle.
  //
  // `add` because that is what a listener OBSERVES: the row was inserted as a
  // draft by /batch, which publishes nothing, so this ping is the first time the
  // batch exists as far as anyone else's screen is concerned. (The coarse
  // listener ignores `op` — it drops the one key and re-reads — so this is
  // description, not instruction.) Awaited, like the module pings above: a bare
  // publish is cancelled when the isolate finishes and never arrives (R1).
  ctx.waitUntil(publishChange(env.REALTIME, guard.teamId, "data_import_batches", batchId, "add"))
  return json({ report })
}

/** GET /api/data-ops/import/batches — the team's import history (newest first).
 * Any signed-in member may see it: summaries only (who, when, files → tables,
 * totals) — the same altitude as the activity feed's "imported N rows" line;
 * row contents and rejection reasons stay on the creator-scoped batch. */
export async function getBatches(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  return json({ batches: await listBatchSummaries(cfg, guard) })
}

/** GET /api/data-ops/import/batch?id= — the batch (files + plan + report). */
export async function getBatch(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  const id = requireText(new URL(request.url).searchParams.get("id"), "A batch id", TEXT_LIMITS.short)
  return json({ batch: await getBatchView(cfg, guard, id) })
}
