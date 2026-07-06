// Import routes: list the targets, start a session, upload + preview a file, adjust
// the mapping, and confirm (write). Gating: import has NO permission key of its own
// — every action is gated by the caller's `create` right on the TARGET module
// (member_roles or learning). The confirm writes act-as-user through the gated
// create endpoints, then publishes ONE coarse list-ping for the affected table.
// The session-shaping rules live in lib/import; the catalog code side in lib/targets.

import { fail, json } from "../../../../shared/workers/http"
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
  if (!body.sessionId || typeof body.csv !== "string")
    return fail(400, "invalid_input", "sessionId and csv are required.")
  if (body.csv.length > MAX_CSV_BYTES)
    return fail(413, "file_too_large", "That file is too large to import. Export a smaller CSV (up to about 5 MB).")
  const { target } = await targetForSession(env, cfg, guard, body.sessionId)
  await requireRight(cfg, guard, target.module, "create")
  const out = await applyFile(env, cfg, guard, body.sessionId, body.fileName ?? "", body.csv)
  return json({ session: out.summary, preview: out.preview })
}

/** POST /api/data-ops/import/mapping — adjust the column mapping; re-preview. */
export async function postImportMapping(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  const body = (await request.json().catch(() => ({}))) as {
    sessionId?: string
    mapping?: Record<string, string>
  }
  if (!body.sessionId || typeof body.mapping !== "object" || body.mapping === null)
    return fail(400, "invalid_input", "sessionId and mapping are required.")
  const { target } = await targetForSession(env, cfg, guard, body.sessionId)
  await requireRight(cfg, guard, target.module, "create")
  const out = await applyMapping(env, cfg, guard, body.sessionId, body.mapping)
  return json({ session: out.summary, preview: out.preview })
}

/** GET /api/data-ops/import/preview?id= — the session's current preview. */
export async function getImportPreview(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  const id = new URL(request.url).searchParams.get("id")
  if (!id) return fail(400, "invalid_input", "An import session id is required.")
  const { target } = await targetForSession(env, cfg, guard, id)
  await requireRight(cfg, guard, target.module, "create")
  const view = await getSessionView(env, cfg, guard, id)
  return json({ session: view.summary, preview: view.preview, columns: view.columns })
}

/** POST /api/data-ops/import/confirm — write every mapped row (insert-only),
 * act-as-user through the gated create endpoint, then ONE list-ping for the table. */
export async function postImportConfirm(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  const body = (await request.json().catch(() => ({}))) as { sessionId?: string }
  if (!body.sessionId) return fail(400, "invalid_input", "A sessionId is required.")
  const { target } = await targetForSession(env, cfg, guard, body.sessionId)
  await requireRight(cfg, guard, target.module, "create")
  const out = await confirmImport(env, request, cfg, guard, actor, body.sessionId)
  await publishChange(env.REALTIME, guard.teamId, target.module)
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
  if (!body.batchId || typeof body.csv !== "string")
    return fail(400, "invalid_input", "batchId and csv are required.")
  return json({ batch: await addBatchFile(cfg, guard, body.batchId, body.name ?? "file", body.csv) })
}

/** POST /api/data-ops/import/batch/plan — the AGENT builds the plan. Metered on the
 * team AI credit pool (one turn), like a chat turn. */
export async function postBatchPlan(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await requireAnyImportRight(cfg, guard)
  const body = (await request.json().catch(() => ({}))) as { batchId?: string }
  if (!body.batchId) return fail(400, "invalid_input", "A batchId is required.")
  const c = await consumeAiUnit(env, guard.teamId)
  if (!c.ok)
    return fail(429, "over_quota", "You're out of AI requests for now — the plan step uses the assistant. They reset tomorrow, or an admin can add credits.")
  return json({ batch: await planBatch(env, cfg, guard, body.batchId), quota: c.quota })
}

/** POST /api/data-ops/import/batch/confirm — run the plan in dependency order. Gates
 * `create` on every target in the plan up front (fail fast), then publishes one
 * coarse ping per changed module. */
export async function postBatchConfirm(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  const body = (await request.json().catch(() => ({}))) as { batchId?: string }
  if (!body.batchId) return fail(400, "invalid_input", "A batchId is required.")
  const view = await getBatchView(cfg, guard, body.batchId)
  if (!view.plan) return fail(409, "no_plan", "Plan the import before running it.")
  for (const m of planModules(view.plan)) await requireRight(cfg, guard, m, "create")
  const { report, modules } = await confirmBatch(env, request, cfg, guard, actor, body.batchId)
  for (const m of modules) await publishChange(env.REALTIME, guard.teamId, m)
  return json({ report })
}

/** GET /api/data-ops/import/batch?id= — the batch (files + plan + report). */
export async function getBatch(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  const id = new URL(request.url).searchParams.get("id")
  if (!id) return fail(400, "invalid_input", "A batch id is required.")
  return json({ batch: await getBatchView(cfg, guard, id) })
}
