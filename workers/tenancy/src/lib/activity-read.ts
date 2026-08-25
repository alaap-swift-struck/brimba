// Read side of the activity log (the write side is shared/workers/activity.ts).
// One feed table per team; the SAME rows are surfaced in three scopes by the
// relation each row carries: the whole team, one user, or one role. See
// the activity ruleset in ARCHITECTURE.md.

import type { ActivityItem } from "../../../../shared/types"
import { ACTIVITY_ORIGINS, ACTIVITY_VERBS, type FieldDiff } from "../../../../shared/workers/activity"
import { d1Query, type D1Rest } from "../../../../shared/workers/d1-rest"
import { GuardError } from "../../../../shared/workers/gating"
import type { MemberGuard } from "./permissions"
import { decodeCursor, keysetAfter, PAGE_SIZE, toPage, type Page } from "../../../../shared/workers/paging"
import { optionalText, TEXT_LIMITS } from "../../../../shared/workers/validate"

type ActivityRow = {
  id: string
  type: string
  description: string
  created_at: string
  creator_name: string | null
  origin: string | null
  verb: string | null
  before_after: string | null
}

/**
 * THE FIELD DIFF, FINALLY READ.
 *
 * `before_after` has been WRITTEN by three modules (learning, help, member_roles)
 * and read by nothing: every "what changed" detail was captured and then thrown
 * away, so a feed could say "Ada edited it" and never which field, from what, to
 * what. A column three modules pay to write and nobody reads is not an audit
 * trail, it is a cost — the same finding that got `origin` and `verb` a reader.
 *
 * TWO THINGS BOUND IT, and both are the reason this is not simply passed through:
 *
 * 1 · ONLY ON A SINGLE-RECORD SCOPE. The team feed returns every module's rows
 *     behind one gate, and shipping raw before/after values there is precisely
 *     the leak R18 was earned by ("changed BIG-0000001 price from 4,500 to
 *     3,900"). Every other scope names ONE record and the route has already
 *     gated the caller on that module's read right, so the values are ones they
 *     may see. The team feed's SELECT — the hot one, on the biggest table in the
 *     database — is left exactly as it was.
 *
 * 2 · `hideValues` IS HONOURED HERE. `changedFields` filters unchanged fields but
 *     does NOT strip values, so a stored diff for an article body carries the
 *     WHOLE body twice — up to ~40 KB on one row, and values the human sentence
 *     deliberately withheld. Returning that raw would both leak past the writer's
 *     own decision and put megabytes on a page. So the label survives, the values
 *     do not, and everything else is clipped.
 *
 * This serves the human expander on the Activity tab. A future reconstruct-the-
 * record path would read the column unclipped — and should say so where it does.
 */
const DIFF_VALUE_CAP = 200

function readDiff(raw: string | null): FieldDiff[] | undefined {
  if (!raw) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    // A malformed diff must never take the whole feed down with it — the trail
    // is more useful missing one row's detail than failing to load at all.
    return undefined
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return undefined
  const clip = (v: string | null | undefined) =>
    typeof v === "string" && v.length > DIFF_VALUE_CAP ? `${v.slice(0, DIFF_VALUE_CAP - 1)}…` : v ?? null
  return parsed
    .filter((f): f is FieldDiff => !!f && typeof (f as FieldDiff).label === "string")
    .map((f) =>
      f.hideValues
        ? { label: f.label, hideValues: true }
        : { label: f.label, from: clip(f.from), to: clip(f.to) }
    )
}

/**
 * What a feed row is, on the wire.
 *
 * A LOCAL WIDENING of the shared `ActivityItem` rather than an edit to
 * `shared/types.ts`: the diff is produced by this reader and by nothing else, so
 * the extra field is described where it is produced. When the Activity tab grows
 * its expander, `ActivityItem` gains `changes?: FieldDiff[]` and this alias
 * collapses back to it — see the note on `readDiff` for what the UI receives.
 */
export type ActivityFeedItem = ActivityItem & { changes?: FieldDiff[] }

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

/**
 * NARROWING THE FEED ON THE SERVER.
 *
 * Values arrive as `unknown` and are validated HERE rather than in the route,
 * because three surfaces call this reader — the screen, the assistant and MCP —
 * and a filter checked at one door is checked at none. Same reason the scope
 * itself is re-validated below even though the route already did it.
 *
 * Without these, narrowing to "every deactivation the assistant made last week"
 * meant fetching pages and discarding them in the browser: the client reading
 * the whole table to show six rows of it.
 */
export type ActivityFilters = {
  /** one of ACTIVITY_VERBS */
  verb?: unknown
  /** one of ACTIVITY_ORIGINS — "did the agent do this?" */
  origin?: unknown
  /** ISO date or timestamp, inclusive */
  from?: unknown
  /** ISO date or timestamp, inclusive — a bare date covers the whole day */
  to?: unknown
}

/** A date or a timestamp, and nothing else. `created_at` is written by
 * `toISOString()`, so it sorts lexicographically and a prefix compares correctly
 * — which is the whole reason a string range works here at all. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?Z?)?$/

/** One of a closed set, or a clean 400. Never trust a request body: these values
 * reach a WHERE clause, and an unchecked one is at best a filter that silently
 * matches nothing and at worst a 500 on `.trim` of a number. */
function oneOf(value: unknown, field: string, allowed: readonly string[]): string | undefined {
  const clean = optionalText(value, field, TEXT_LIMITS.short)
  if (clean === undefined) return undefined
  if (!allowed.includes(clean))
    throw new GuardError(400, "invalid_input", `${field} must be one of: ${allowed.join(", ")}.`)
  return clean
}

function isoBound(value: unknown, field: string, endOfDay: boolean): string | undefined {
  const clean = optionalText(value, field, TEXT_LIMITS.short)
  if (clean === undefined) return undefined
  if (!ISO_DATE.test(clean))
    throw new GuardError(400, "invalid_input", `${field} must be a date (YYYY-MM-DD) or an ISO timestamp.`)
  // A bare `to = 2026-08-31` compared against a full timestamp would drop
  // everything that happened on the 31st after midnight — a filter answering a
  // different question than the one asked. `from` needs no such help: a bare
  // date already sorts before every timestamp within it.
  return endOfDay && clean.length === 10 ? `${clean}T23:59:59.999Z` : clean
}

/** The validated filter clauses, in the order their params must be bound. */
function filterClauses(f: ActivityFilters): { clauses: string[]; params: string[] } {
  const clauses: string[] = []
  const params: string[] = []
  const add = (sql: string, value: string | undefined) => {
    if (value === undefined) return
    clauses.push(sql)
    params.push(value)
  }
  add("verb = ?", oneOf(f.verb, "verb", ACTIVITY_VERBS))
  add("origin = ?", oneOf(f.origin, "origin", ACTIVITY_ORIGINS))
  add("created_at >= ?", isoBound(f.from, "from", false))
  add("created_at <= ?", isoBound(f.to, "to", true))
  return { clauses, params }
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
 *             (help, learning, products…) surface its activity with zero new code.
 *
 * `filters` narrows any of those by verb, origin and time window — validated
 * here, ANDed onto the scope, and carried by the COUNT as well as the page. */
export async function getActivity(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: "team" | "user" | "role" | "invite" | "record",
  id?: string,
  table?: string,
  allowedTables: string[] | null = null,
  cursor?: string | null,
  filters: ActivityFilters = {}
): Promise<Page<ActivityFeedItem> & { total: number }> {
  // Validated BEFORE the fail-closed checks below, so a bad filter is a clean
  // 400 rather than an empty page that looks like an honest answer.
  const filter = filterClauses(filters)
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
  // The filters AND on TOP of the scope — they never replace it. Pushed after the
  // scope clause so the bound values stay in statement order, and into the SAME
  // arrays, so they ride the COUNT as well as the page: a badge counting rows the
  // list will not show is the R16 failure this shares its where-clause to avoid.
  clauses.push(...filter.clauses)
  params.push(...filter.params)
  const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""

  // R14 GROWING collection: the feed gains a row on EVERY mutation, so it pages by
  // key rather than stopping at a ceiling. PAGE_SIZE + 1 reveals hasMore.
  const after = keysetAfter(decodeCursor(cursor), "created_at")
  const pageWhere = after.sql ? `${where ? `${where} AND` : " WHERE"} ${after.sql}` : where
  // The diff rides a single-record read only — see `readDiff` for why the team
  // feed's column list is deliberately unchanged.
  const withDiff = scope !== "team"
  const [rows, counted] = await Promise.all([
    d1Query<ActivityRow>(
      cfg,
      guard.databaseId,
      // `origin` and `verb` are SELECTed, not merely stored. Migration 0008 added
      // three columns and the writers to fill them; no reader was ever written,
      // so for a week the base recorded which door every change came through and
      // could not show it to anyone. A column nothing reads is not an audit
      // trail — it is a cost. (Activity-log review, 2026-08-25.)
      `SELECT id, type, description, created_at, creator_name, origin, verb${
        withDiff ? ", before_after" : ""
      } FROM activity${pageWhere}
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
      // Gated HERE as well as in the SELECT, and not because one of them might
      // be wrong: R18's leak arrived by omission, so the scope decides twice —
      // once about what is asked for and once about what is handed back.
      // Absent (not null, not []) on the team feed and on rows whose door sends
      // no diff, because "this door doesn't diff yet" and "nothing changed" stay
      // two different facts, exactly as the writer keeps them.
      changes: withDiff ? readDiff(r.before_after ?? null) : undefined,
    })),
    total: counted[0]?.n ?? 0,
  }
}
