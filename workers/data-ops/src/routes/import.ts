// Import routes: list the targets, start a session, upload + preview a file, adjust
// the mapping, and confirm (write). Gating: import has NO permission key of its own
// — every action is gated by the caller's `create` right on the TARGET module
// (member_roles or learning). The confirm writes act-as-user through the gated
// create endpoints, then publishes ONE coarse list-ping for the affected table.
// The session-shaping rules live in lib/import; the catalog code side in lib/targets.

import { fail, json } from "../../../../shared/workers/http"
import { publishChange } from "../../../../shared/workers/realtime"
import { requireRight, teamContext } from "../../../../shared/workers/gating"
import {
  applyFile,
  applyMapping,
  confirmImport,
  getActiveCatalog,
  getSessionView,
  startSession,
  targetForSession,
} from "../lib/import"
import { TARGETS } from "../lib/targets"
import type { Env } from "../env"

/** Reject oversized CSV uploads BEFORE parsing/persisting — a huge file would
 * otherwise exhaust the worker and bloat the team DB before the row cap is reached. */
const MAX_CSV_BYTES = 5_000_000

/** GET /api/data-ops/import/targets — the active, supported import targets. */
export async function getImportTargets(request: Request, env: Env): Promise<Response> {
  await teamContext(request, env) // any signed-in member may see the catalog
  return json({ targets: await getActiveCatalog(env) })
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
