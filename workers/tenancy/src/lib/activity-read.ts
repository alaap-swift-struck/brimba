// Read side of the activity log (the write side is shared/workers/activity.ts).
// One feed table per team; the SAME rows are surfaced in three scopes by the
// relation each row carries: the whole team, one user, or one role. See
// the activity ruleset in ARCHITECTURE.md.

import type { ActivityItem } from "../../../../shared/types"
import { d1Query, type D1Rest } from "../../../../shared/workers/d1-rest"
import type { MemberGuard } from "./permissions"
import { decodeCursor, keysetAfter, PAGE_SIZE, toPage, type Page } from "../../../../shared/workers/paging"

type ActivityRow = {
  id: string
  type: string
  description: string
  created_at: string
  creator_name: string | null
  origin: string | null
  verb: string | null
}

/** R18 — the ONE visibility clause for the cross-module team feed. The feed's
 * rows name records and their before/after, so the team scope must subtract the
 * caller's denied modules — and ANY count over the feed must go through THIS
 * same builder, because a badge counting more than its list shows is itself the
 * leak. `null` = unrestricted (the single-table scopes the route already gated
 * per-module). Rows with no related_table name nothing, so they stay visible. */
export function activityVisibilityClause(
  allowedTables: string[] | null
): { sql: string; params: string[] } {
  if (allowedTables === null) return { sql: "", params: [] }
  if (allowedTables.length === 0) return { sql: " WHERE related_table IS NULL", params: [] }
  const marks = allowedTables.map(() => "?").join(", ")
  return { sql: ` WHERE (related_table IS NULL OR related_table IN (${marks}))`, params: allowedTables }
}

/** The team's activity, newest first — optionally scoped to one record:
 *  • team   → everything that happened in the team THAT THE CALLER MAY SEE —
 *             the route passes `allowedTables` built from their module rights
 *             plus the pinned exemptions (R18: a cross-module read carries the
 *             caller's module rights)
 *  • user   → events about that member (role changes, removal, join)
 *  • role   → events about that role (created, renamed, permissions changed)
 *  • invite → events about that invite (sent, revoked) — `id` is the team-local
 *             invite_logs row id (the caller maps invite_index.id → it first)
 *  • record → GENERIC: any module's record, by (`table`, `id`). user/role/invite
 *             are just fixed-`table` aliases of this; `record` lets a NEW module
 *             (help, learning, products…) surface its activity with zero new code. */
export async function getActivity(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: "team" | "user" | "role" | "invite" | "record",
  id?: string,
  table?: string,
  allowedTables: string[] | null = null,
  cursor?: string | null
): Promise<Page<ActivityItem> & { total: number }> {
  // FAIL CLOSED. An id-scope with no id used to match NO branch below, leaving the
  // WHERE empty — so `?scope=user` with no `id` returned the entire team's
  // cross-module history, unfiltered, to anyone with team_members:read. That is
  // precisely the leak R18 exists to stop, arrived at by omission rather than by
  // a missing gate. An unresolved scope now returns nothing at all.
  if (scope !== "team" && !id) return { rows: [], hasMore: false, nextCursor: null, total: 0 }
  if (scope === "record" && !table) return { rows: [], hasMore: false, nextCursor: null, total: 0 }

  // ONE where-clause, shared by the page read and the COUNT — a total that didn't
  // pass through the same visibility filter would over-count what it can't show.
  const clauses: string[] = []
  const params: string[] = []
  if (scope === "user" && id) {
    clauses.push("related_table = 'users' AND related_row_id = ?")
    params.push(id)
  } else if (scope === "role" && id) {
    clauses.push("related_table = 'member_roles' AND related_row_id = ?")
    params.push(id)
  } else if (scope === "invite" && id) {
    clauses.push("related_table = 'invite_logs' AND related_row_id = ?")
    params.push(id)
  } else if (scope === "record" && id && table) {
    clauses.push("related_table = ? AND related_row_id = ?")
    params.push(table, id)
  } else {
    // `else`, not `else if (scope === "team")` — anything that reaches here is
    // the whole-team read and MUST carry the R18 filter. A scope string the route
    // didn't recognise must never widen into an unfiltered feed.
    const clause = activityVisibilityClause(allowedTables)
    if (clause.sql) clauses.push(clause.sql.replace(/^\s*WHERE\s*/, ""))
    params.push(...clause.params)
  }
  const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""

  // R14 GROWING collection: the feed gains a row on EVERY mutation, so it pages by
  // key rather than stopping at a ceiling. PAGE_SIZE + 1 reveals hasMore.
  const after = keysetAfter(decodeCursor(cursor), "created_at")
  const pageWhere = after.sql ? `${where ? `${where} AND` : " WHERE"} ${after.sql}` : where
  const [rows, counted] = await Promise.all([
    d1Query<ActivityRow>(
      cfg,
      guard.databaseId,
      // `origin` and `verb` are SELECTed, not merely stored. Migration 0008 added
      // three columns and the writers to fill them; no reader was ever written,
      // so for a week the base recorded which door every change came through and
      // could not show it to anyone. A column nothing reads is not an audit
      // trail — it is a cost. (Activity-log review, 2026-08-25.)
      `SELECT id, type, description, created_at, creator_name, origin, verb FROM activity${pageWhere}
       ORDER BY created_at DESC, id DESC LIMIT ${PAGE_SIZE + 1}`,
      [...params, ...after.params]
    ),
    // R16: the exact total of what this caller may see — never the page's length.
    d1Query<{ n: number }>(cfg, guard.databaseId, `SELECT COUNT(*) AS n FROM activity${where}`, params),
  ])
  const page = toPage(rows, PAGE_SIZE, (r) => [r.created_at, r.id])
  return {
    ...page,
    rows: page.rows.map((r) => ({
      id: r.id,
      type: r.type,
      description: r.description,
      actorName: r.creator_name,
      createdAt: r.created_at,
      origin: r.origin,
      verb: r.verb,
    })),
    total: counted[0]?.n ?? 0,
  }
}
