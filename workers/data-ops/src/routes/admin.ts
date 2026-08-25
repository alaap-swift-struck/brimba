// Owner-only import-catalog maintenance (x-admin-key, like tenancy's maintenance
// endpoints). The import catalog (importable_databases) is global + owner-maintained;
// seeded to the code-supported targets in DEFAULT_CATALOG (Object.values(TARGETS)):
// today selectable_data (Dropdown values) + member_roles + learning.
// Re-running the seed is idempotent (upsert by table_key), so it's safe at deploy.

import { opsDatabase } from "../../../../shared/workers/ops-db"
import { fail, json } from "../../../../shared/workers/http"
import { adminGuard } from "../../../../shared/workers/gating"
import { DEFAULT_CATALOG } from "../lib/targets"
import { seedDefaultCatalog } from "../lib/import"
import type { Env } from "../env"
import { requireText, TEXT_LIMITS } from "../../../../shared/workers/validate"

/** POST /api/data-ops/admin/seed-targets — upsert the default import catalog. */
export async function postSeedTargets(request: Request, env: Env): Promise<Response> {
  const blocked = adminGuard(request, env)
  if (blocked) return blocked
  const actor = { id: "owner", email: "owner", name: "Owner" }
  const count = await seedDefaultCatalog(env, actor, DEFAULT_CATALOG)
  return json({ seeded: count, targets: DEFAULT_CATALOG.map((d) => d.tableKey) })
}

/** GET /api/data-ops/admin/errors?status=open|resolved|all&limit=N — the central
 * error log, newest first (ERROR-HANDLING.md). Owner-only: reading stack traces
 * is a maintainer activity, so it sits behind the maintenance key, not a role. */
export async function getErrors(request: Request, env: Env): Promise<Response> {
  const blocked = adminGuard(request, env)
  if (blocked) return blocked
  const url = new URL(request.url)
  const status = url.searchParams.get("status") ?? "open"
  // R14 hard cap — bounded at BOTH ends, and it has to be. `Math.min(Number(…)
  // || 100, 200)` reads like a ceiling and is only half of one: nothing bounded
  // the bottom, so `?limit=-1` passed through untouched and reached SQLite as
  // `LIMIT -1`, which SQLite defines as NO LIMIT — the whole `error_logs` table,
  // every stack trace and every URL in it, in one response. Owner-gated bounds
  // who can ask, not what happens when they do; a bookmarked link with a stale
  // query string is enough. `Math.trunc` because the number is interpolated (D1
  // will not bind a LIMIT), so it must be a whole one. Same reading as the
  // sibling door in routes/agent.ts, deliberately — one pattern, two doors.
  const raw = Number(url.searchParams.get("limit"))
  const limit = Number.isFinite(raw) && raw > 0 ? Math.min(Math.trunc(raw), 200) : 100
  const where = status === "all" ? "" : "WHERE status = ?"
  const stmt = opsDatabase(env).prepare(
    `SELECT id, at, source, place, message, stack, team_id, user_id, url, status, resolved_at, resolution_note
     FROM error_logs ${where} ORDER BY at DESC LIMIT ${limit}`
  )
  const rows = await (status === "all" ? stmt : stmt.bind(status)).all()
  return json({ errors: rows.results ?? [] })
}

/** POST /api/data-ops/admin/errors/resolve { id, note } — close an error with the
 * what-went-wrong / how-it-was-fixed note. Idempotent (re-resolving overwrites
 * the note); an unknown id is a clean 404 via updated:0. */
export async function postResolveError(request: Request, env: Env): Promise<Response> {
  const blocked = adminGuard(request, env)
  if (blocked) return blocked
  const b = (await request.json().catch(() => ({}))) as { id?: string; note?: string }
  // Already type-checked; through the seam so the length is capped and an embedded
  // NUL is STRIPPED rather than reaching a bound parameter, where D1 raises a 500.
  // (Security round 5.)
  const id = requireText(b.id, "id", TEXT_LIMITS.short)
  const res = await opsDatabase(env).prepare(
    `UPDATE error_logs SET status = 'resolved', resolved_at = ?, resolution_note = ? WHERE id = ?`
  )
    .bind(new Date().toISOString(), (b.note ?? "").slice(0, 2000) || null, id.slice(0, 40))
    .run()
  return json({ updated: res.meta.changes ?? 0 })
}
