// The BATCH engine (AGENTIC-IMPORT.md): a batch groups several uploaded files, the
// agent-built plan, and the per-row report. Create → add files → plan (agent) →
// confirm (ordered execution). Reuses the single-target primitives: parseCsv for
// files, writeRow for the gated act-as-user write (audit parity), the same
// creator-scoping as data_import_sessions. The batch table is JSON columns; the
// smarts are in import-plan (pure) + import-agent (model).

import { logActivity } from "../../../../shared/workers/activity"
import { d1ExecScript, d1Query, sqlString, type D1Rest } from "../../../../shared/workers/d1-rest"
import { ulid } from "../../../../shared/workers/id"
import { GuardError, type Actor, type MemberGuard } from "../../../../shared/workers/gating"
import type { Env } from "../env"
import type { ImportBatchReport, ImportBatchSummary, ImportBatchView, ImportPlan, ImportRejection } from "../../../../shared/types"
import { parseCsv } from "./csv"
import { norm, TARGETS, type TargetDef } from "./targets"
import { resolveRow, scanRows } from "./import-plan"
import { analyzeBatch, type AnalyzeFile } from "./import-agent"
import { writeRow } from "./import"

const MAX_FILES = 8
const MAX_ROWS_PER_FILE = 1000
const MAX_CSV_BYTES = 5_000_000

/** One uploaded file inside a batch (parsed once, kept for the run). */
type BatchFile = { fileId: string; name: string; headers: string[]; rows: string[][]; rowCount: number }
type BatchRow = {
  id: string
  overall_status: string
  files_json: string | null
  plan_json: string | null
  report_json: string | null
  created_at: string
}

const COLS = "id, overall_status, files_json, plan_json, report_json, created_at"

async function loadBatch(cfg: D1Rest, guard: MemberGuard, id: string): Promise<BatchRow> {
  // Creator-scoped, like import sessions + agent threads.
  const rows = await d1Query<BatchRow>(
    cfg,
    guard.databaseId,
    `SELECT ${COLS} FROM data_import_batches WHERE id = ? AND creator_id = ?`,
    [id, guard.userId]
  )
  if (!rows[0]) throw new GuardError(404, "batch_not_found", "That import doesn't exist.")
  return rows[0]
}

function filesOf(b: BatchRow): BatchFile[] {
  return b.files_json ? (JSON.parse(b.files_json) as BatchFile[]) : []
}
function planOf(b: BatchRow): ImportPlan | null {
  return b.plan_json ? (JSON.parse(b.plan_json) as ImportPlan) : null
}

function toView(b: BatchRow): ImportBatchView {
  const files = filesOf(b).map((f) => ({ fileId: f.fileId, name: f.name, headers: f.headers, rowCount: f.rowCount }))
  return {
    id: b.id,
    status: b.overall_status,
    files,
    plan: planOf(b),
    report: b.report_json ? (JSON.parse(b.report_json) as ImportBatchReport) : null,
    createdAt: b.created_at,
  }
}

/* --------------------------------- create / add --------------------------------- */

export async function createBatch(cfg: D1Rest, guard: MemberGuard, actor: Actor): Promise<ImportBatchView> {
  const id = ulid()
  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO data_import_batches (id, overall_status, files_json, created_at, creator_id, creator_email, creator_name) VALUES (${sqlString(id)}, 'draft', '[]', ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`
  )
  return toView(await loadBatch(cfg, guard, id))
}

/** Parse + attach one file to the batch (headers + all rows kept for the run). */
export async function addBatchFile(
  cfg: D1Rest,
  guard: MemberGuard,
  batchId: string,
  name: string,
  csvText: string
): Promise<ImportBatchView> {
  if (csvText.length > MAX_CSV_BYTES)
    throw new GuardError(413, "file_too_large", "That file is too large. Export a smaller CSV (up to about 5 MB).")
  const b = await loadBatch(cfg, guard, batchId)
  const files = filesOf(b)
  if (files.length >= MAX_FILES)
    throw new GuardError(400, "too_many_files", `An import is limited to ${MAX_FILES} files at a time.`)
  const parsed = parseCsv(csvText)
  if (!parsed.headers.length)
    throw new GuardError(400, "empty_file", `"${name}" has no readable columns. Export it as CSV and try again.`)
  if (parsed.rows.length > MAX_ROWS_PER_FILE)
    throw new GuardError(400, "too_many_rows", `Each file is limited to ${MAX_ROWS_PER_FILE} rows.`)
  files.push({ fileId: ulid(), name: name || "file", headers: parsed.headers, rows: parsed.rows, rowCount: parsed.rows.length })
  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `UPDATE data_import_batches SET files_json = ${sqlString(JSON.stringify(files))}, plan_json = NULL, overall_status = 'draft', updated_at = ${sqlString(now)} WHERE id = ${sqlString(batchId)};`
  )
  return toView(await loadBatch(cfg, guard, batchId))
}

/* ----------------------------------- plan ----------------------------------- */

/** Ask the agent to plan the batch (or the deterministic fallback), store + return
 * it. The caller has metered a credit. */
export async function planBatch(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  batchId: string
): Promise<ImportBatchView> {
  const b = await loadBatch(cfg, guard, batchId)
  const files = filesOf(b)
  if (!files.length) throw new GuardError(400, "no_files", "Add at least one file before planning.")
  const analyzeFiles: AnalyzeFile[] = files.map((f) => ({
    fileId: f.fileId,
    name: f.name,
    headers: f.headers,
    rowCount: f.rowCount,
    rows: f.rows, // full rows → planStep predicts per-row rejections (never sent to the model)
    sampleRows: f.rows.slice(0, 3),
  }))
  const plan = await analyzeBatch(env, analyzeFiles)
  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `UPDATE data_import_batches SET plan_json = ${sqlString(JSON.stringify(plan))}, overall_status = 'planned', updated_at = ${sqlString(now)} WHERE id = ${sqlString(batchId)};`
  )
  return toView(await loadBatch(cfg, guard, batchId))
}

/** The distinct target modules in a plan — the routes gate `create` on each up
 * front so a missing right fails fast, not row-by-row. */
export function planModules(plan: ImportPlan): string[] {
  const mods = new Set<string>()
  for (const key of plan.order) if (TARGETS[key]) mods.add(TARGETS[key].module)
  return [...mods]
}

/* --------------------------------- confirm ---------------------------------- */

/** Read a parent target's rows back into naturalKey→newId, so a mode:"id" child can
 * resolve to them. Only called for a parent that IS referenced by id AND declares
 * `list` (base targets don't — the base's one dependency is value-mode). */
async function buildResolvedMap(
  env: Env,
  request: Request,
  def: TargetDef
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (!def.list) return map
  const fetcher = def.endpoint.binding === "CONTENT" ? env.CONTENT : env.TENANCY
  const res = await fetcher.fetch(`https://internal${def.list.path}`, {
    headers: { Cookie: request.headers.get("Cookie") ?? "" },
  })
  if (!res.ok) return map
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  const rows = (data?.[def.list.key] as Record<string, unknown>[] | undefined) ?? []
  for (const r of rows) {
    const key = norm(String(r[def.list.nameField] ?? ""))
    const id = String(r[def.list.idField] ?? "")
    if (key && id) map.set(key, id)
  }
  return map
}

/** Execute the plan in dependency order (AGENTIC-IMPORT §2.4). Each row: normalize →
 * resolve references → write through the gated create endpoint (audit parity) or
 * reject with a reason. Returns the per-target report. The route publishes one coarse
 * ping per changed module. */
export async function confirmBatch(
  env: Env,
  request: Request,
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  batchId: string
): Promise<{ view: ImportBatchView; report: ImportBatchReport; modules: string[] }> {
  const b = await loadBatch(cfg, guard, batchId)
  if (b.overall_status === "complete") throw new GuardError(409, "already_run", "This import has already been run.")
  const plan = planOf(b)
  if (!plan) throw new GuardError(409, "no_plan", "Plan the import before running it.")
  const files = new Map(filesOf(b).map((f) => [f.fileId, f]))

  // Which parents must be read back for id-resolution (any mode:"id" ref in the batch).
  const idParents = new Set<string>()
  for (const key of plan.order)
    for (const ref of TARGETS[key]?.references ?? []) if (ref.mode === "id") idParents.add(ref.target)

  const resolved = new Map<string, Map<string, string>>()
  const report: ImportBatchReport = { perTarget: [], created: 0, skipped: 0, failed: 0, rejections: [] }

  for (const targetKey of plan.order) {
    const def = TARGETS[targetKey]
    const step = plan.steps.find((s) => s.target === targetKey)
    const file = step ? files.get(step.fileId) : undefined
    if (!def || !step || !file) continue
    const tally = { target: targetKey, targetName: def.displayName, created: 0, skipped: 0, failed: 0 }

    // The SAME scan the plan predicted with (missing required / duplicate rows) —
    // so the review screen and the run can never disagree.
    const scans = scanRows(def, step.mapping, step.transforms, file.headers, file.rows)
    for (let i = 0; i < scans.length; i++) {
      const { mapped, reject } = scans[i]
      if (reject) {
        tally.skipped++
        report.rejections.push({ file: file.name, row: i + 1, reason: reject })
        continue
      }
      const { refs, error } = resolveRow(mapped, def.references ?? [], resolved)
      if (error) {
        tally.skipped++
        report.rejections.push({ file: file.name, row: i + 1, reason: error })
        continue
      }
      const out = await writeRow(env, request, def, def.buildBody(mapped, refs))
      if (out.ok) tally.created++
      else {
        tally.failed++
        report.rejections.push({ file: file.name, row: i + 1, reason: out.error ?? "Write failed." })
      }
    }

    // If a later child resolves to THIS target by id, read its rows back now.
    if (idParents.has(targetKey)) resolved.set(targetKey, await buildResolvedMap(env, request, def))

    report.perTarget.push(tally)
    report.created += tally.created
    report.skipped += tally.skipped
    report.failed += tally.failed
  }

  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `UPDATE data_import_batches SET report_json = ${sqlString(JSON.stringify(report))}, overall_status = 'complete', completed_at = ${sqlString(now)}, updated_at = ${sqlString(now)} WHERE id = ${sqlString(batchId)};`
  )
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Data imported",
    description: `${actor.name} imported ${report.created} row(s) across ${report.perTarget.length} table(s)`,
    relatedTable: "import",
    relatedRowId: batchId,
  })
  return { view: toView(await loadBatch(cfg, guard, batchId)), report, modules: planModules(plan) }
}

export async function getBatchView(cfg: D1Rest, guard: MemberGuard, id: string): Promise<ImportBatchView> {
  return toView(await loadBatch(cfg, guard, id))
}

/** The team's import history, newest first — who ran what, into which tables,
 * with the totals. TEAM-visible (unlike the working batch, which stays creator-
 * scoped): summaries carry file names + counts, never row contents or rejection
 * reasons — the same altitude as the activity feed's "imported N rows" line. */
export async function listBatchSummaries(
  cfg: D1Rest,
  guard: MemberGuard,
  limit = 20
): Promise<ImportBatchSummary[]> {
  const rows = await d1Query<BatchRow & { creator_name: string | null; completed_at: string | null }>(
    cfg,
    guard.databaseId,
    `SELECT ${COLS}, creator_name, completed_at FROM data_import_batches ORDER BY created_at DESC LIMIT ?`,
    [Math.max(1, Math.min(100, limit))]
  )
  return rows.map((b) => {
    const files = filesOf(b)
    const plan = planOf(b)
    const report = b.report_json ? (JSON.parse(b.report_json) as ImportBatchReport) : null
    return {
      id: b.id,
      status: b.overall_status,
      by: b.creator_name ?? "Someone",
      at: b.created_at,
      completedAt: b.completed_at,
      files: files.map((f) => ({ name: f.name, rowCount: f.rowCount })),
      targets: [...new Set((plan?.steps ?? []).map((s) => s.targetName))],
      created: report?.created ?? 0,
      skipped: report?.skipped ?? 0,
      failed: report?.failed ?? 0,
    }
  })
}
