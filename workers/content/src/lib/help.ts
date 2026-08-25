// Help module — team-wide support tickets + threaded replies, inside the team's
// OWN database. Locked model rules enforced HERE on the server:
//   • status is a FIXED lifecycle the code trusts (open / in_progress / resolved /
//     reopened) — help_type is a cosmetic selectable, never the source of truth;
//   • tickets are team-wide: the My/All tabs are just a creator filter, no
//     row-level privacy (a mention is notify-only — see lib/notify);
//   • resolving stamps the resolver audit block + resolved flag; reopening clears
//     it. Every status move (incl. reopen) is gated purely by help:edit;
//   • the AI agent's first-draft reply is a HOOK (maybeDraftFirstReply) left off
//     until the agent worker exists — a ticket always opens regardless.

import { assertNotConflicted, versionPredicate } from "../../../../shared/workers/concurrency"
import { changedFields, describeChanges, logActivity, type Actor } from "../../../../shared/workers/activity"
import { d1ExecScript, d1Query, sqlString, type D1Rest } from "../../../../shared/workers/d1-rest"
import { ulid } from "../../../../shared/workers/id"
import type { HelpMessage, HelpTicket } from "../../../../shared/types"
import { GuardError, type MemberGuard } from "../../../../shared/workers/gating"
import { optionalText, requireText, TEXT_LIMITS } from "../../../../shared/workers/validate"
import { BULK_IDS_LIMIT, THREAD_HARD_CAP } from "../../../../shared/workers/limits"
import { decodeCursor, keysetAfter, PAGE_SIZE, toPage, type Page } from "../../../../shared/workers/paging"

/** The fixed status lifecycle the code trusts (the team-editable dropdown is
 * display-only). Anything outside this set is rejected. */
export const HELP_STATUSES = ["open", "in_progress", "resolved", "reopened"] as const
export type HelpStatus = (typeof HELP_STATUSES)[number]

type TicketRow = {
  id: string
  help_type: string | null
  description: string
  screen_recording_link: string | null
  source_screen: string | null
  status: string
  resolved: number
  resolved_at: string | null
  creator_id: string
  creator_name: string | null
  editor_name: string | null
  created_at: string
  updated_at: string | null
}

function toTicket(r: TicketRow): HelpTicket {
  return {
    id: r.id,
    helpType: r.help_type,
    description: r.description,
    screenRecordingLink: r.screen_recording_link,
    sourceScreen: r.source_screen,
    status: (HELP_STATUSES as readonly string[]).includes(r.status)
      ? (r.status as HelpStatus)
      : "open",
    resolved: r.resolved === 1,
    resolvedAt: r.resolved_at,
    raiserId: r.creator_id,
    raiserName: r.creator_name,
    editorName: r.editor_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

type ReplyRow = {
  id: string
  help_id: string
  message_body: string
  tagged_user_ids: string | null
  is_agent: number
  creator_id: string
  creator_name: string | null
  created_at: string
}

/** Parse the tagged_user_ids JSON safely (untrusted text → string[] or []). */
function parseTagged(json: string | null): string[] {
  if (!json) return []
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []
  } catch {
    return []
  }
}

function toMessage(r: ReplyRow): HelpMessage {
  return {
    id: r.id,
    ticketId: r.help_id,
    body: r.message_body,
    taggedUserIds: parseTagged(r.tagged_user_ids),
    isAgent: r.is_agent === 1,
    authorId: r.creator_id,
    authorName: r.creator_name,
    createdAt: r.created_at,
  }
}

const TICKET_COLS =
  "id, help_type, description, screen_recording_link, source_screen, status, resolved, resolved_at, creator_id, creator_name, editor_name, created_at, updated_at"

/** Fetch one ticket (the raw row the gating + notify need), or throw a clean 404. */
async function ticketOrThrow(cfg: D1Rest, guard: MemberGuard, id: string): Promise<TicketRow> {
  const rows = await d1Query<TicketRow>(
    cfg,
    guard.databaseId,
    `SELECT ${TICKET_COLS} FROM help WHERE id = ?`,
    [id]
  )
  if (!rows[0]) throw new GuardError(404, "help_not_found", "That ticket doesn't exist.")
  return rows[0]
}

/** The sort a ticket list is keyed by: newest activity first, id breaking ties. */
const TICKET_ORDER = "COALESCE(updated_at, created_at)"

/** Tickets for the team, newest-activity first. `scope: "mine"` returns only the
 * caller's own raised tickets (the My tab); "all" returns everyone's (All tab).
 * R14 GROWING collection: keyset-PAGED, not capped — tickets accumulate forever,
 * so the door answers "here's a page and where the next one starts" instead of
 * refusing past a ceiling. `cursor` is the opaque one from the previous page. */
export async function listTickets(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: "mine" | "all",
  cursor?: string | null
): Promise<Page<HelpTicket>> {
  const pos = decodeCursor(cursor)
  const after = keysetAfter(pos, TICKET_ORDER)
  const clauses = [...(scope === "mine" ? ["creator_id = ?"] : []), ...(after.sql ? [after.sql] : [])]
  const params = [...(scope === "mine" ? [guard.userId] : []), ...after.params]
  const rows = await d1Query<TicketRow>(
    cfg,
    guard.databaseId,
    // LIMIT is PAGE_SIZE + 1 — the extra row is how hasMore is known (R14).
    `SELECT ${TICKET_COLS} FROM help ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
     ORDER BY ${TICKET_ORDER} DESC, id DESC LIMIT ${PAGE_SIZE + 1}`,
    params
  )
  const page = toPage(rows, PAGE_SIZE, (r) => [r.updated_at ?? r.created_at, r.id])
  return { ...page, rows: page.rows.map(toTicket) }
}

/** R16: exact server COUNT(*) for the badges — the All total and the caller's
 * own (My) total in one read; never a loaded list's length. */
export async function countTickets(
  cfg: D1Rest,
  guard: MemberGuard
): Promise<{ total: number; mineTotal: number }> {
  const rows = await d1Query<{ total: number; mine: number }>(
    cfg,
    guard.databaseId,
    "SELECT COUNT(*) AS total, SUM(CASE WHEN creator_id = ? THEN 1 ELSE 0 END) AS mine FROM help",
    [guard.userId]
  )
  return { total: rows[0]?.total ?? 0, mineTotal: rows[0]?.mine ?? 0 }
}

/** One ticket by id (or null). */
export async function getTicket(
  cfg: D1Rest,
  guard: MemberGuard,
  id: string
): Promise<HelpTicket | null> {
  const rows = await d1Query<TicketRow>(
    cfg,
    guard.databaseId,
    `SELECT ${TICKET_COLS} FROM help WHERE id = ?`,
    [id]
  )
  return rows[0] ? toTicket(rows[0]) : null
}

/** Every reply on a ticket, oldest first (the conversation order). */
export async function listReplies(
  cfg: D1Rest,
  guard: MemberGuard,
  ticketId: string
): Promise<HelpMessage[]> {
  const rows = await d1Query<ReplyRow>(
    cfg,
    guard.databaseId,
    `SELECT id, help_id, message_body, tagged_user_ids, is_agent, creator_id, creator_name, created_at FROM help_threads WHERE help_id = ? ORDER BY created_at ASC LIMIT ${THREAD_HARD_CAP}`, // R14 hard cap
    [ticketId]
  )
  return rows.map(toMessage)
}

/** ONE reply by id, or null — what posting a reply hands back (R21). The team
 * filter is the ticket the reply belongs to, which the id already carries. */
export async function oneReply(cfg: D1Rest, guard: MemberGuard, id: string): Promise<HelpMessage | null> {
  const rows = await d1Query<ReplyRow>(
    cfg,
    guard.databaseId,
    "SELECT id, help_id, message_body, tagged_user_ids, is_agent, creator_id, creator_name, created_at FROM help_threads WHERE id = ?",
    [id]
  )
  return rows[0] ? toMessage(rows[0]) : null
}

/** R16: the thread's exact reply COUNT(*) — the Conversation badge shows this,
 * never the loaded (THREAD_HARD_CAP-bounded) list's length. */
export async function countReplies(cfg: D1Rest, guard: MemberGuard, ticketId: string): Promise<number> {
  const rows = await d1Query<{ n: number }>(
    cfg,
    guard.databaseId,
    "SELECT COUNT(*) AS n FROM help_threads WHERE help_id = ?",
    [ticketId]
  )
  return rows[0]?.n ?? 0
}

/** Fields a create / update accepts.
 *
 * The optional fields are `| null` because an EDIT body is PARTIAL and the two
 * callers say two different things: the machine surface (agent / MCP) OMITS a
 * field it does not mean to touch, while a form SENDS null for a box a person
 * actually cleared. Typing them as `string | undefined` said the second caller
 * did not exist. */
export type TicketInput = {
  description?: string
  helpType?: string | null
  screenRecordingLink?: string | null
  sourceScreen?: string | null
  sourceRelatedTable?: string | null
  sourceRelatedRowId?: string | null
}

/** Raise a ticket. Description is required; everything else optional. Opens in the
 * `open` status. Returns the new ticket's id. */
export async function createTicket(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  input: TicketInput
): Promise<string> {
  const description = requireText(input.description, "Description", TEXT_LIMITS.long)

  const id = ulid()
  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO help (id, help_type, description, screen_recording_link, source_screen, source_related_table, source_related_row_id, status, resolved, created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(id)}, ${sqlString((optionalText(input.helpType, "Type", TEXT_LIMITS.short) ?? null))}, ${sqlString(description)}, ${sqlString((optionalText(input.screenRecordingLink, "Screen recording link", TEXT_LIMITS.link) ?? null))}, ${sqlString((optionalText(input.sourceScreen, "Source", TEXT_LIMITS.short) ?? null))}, ${sqlString((optionalText(input.sourceRelatedTable, "Source table", TEXT_LIMITS.short) ?? null))}, ${sqlString((optionalText(input.sourceRelatedRowId, "Source row", TEXT_LIMITS.short) ?? null))}, 'open', 0, ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`
  )

  await logActivity(cfg, guard.databaseId, actor, {
    type: "Help ticket raised",
      verb: "created",
    description: `${actor.name} raised a support ticket`,
    relatedTable: "help",
    relatedRowId: id,
  })

  return id
}

/** Edit a ticket's content (description / type / screen recording / source). Stamps
 * the editor audit block + updated_at (which also re-sorts it to the top). */
export async function updateTicket(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  id: string,
  input: TicketInput,
  /** The `updated_at` the caller was shown. Given one, the write refuses to land
   * on a row that has moved on since — see shared/workers/concurrency.ts. */
  expectedVersion?: string | null
): Promise<void> {
  const before = await ticketOrThrow(cfg, guard, id)
  const description = requireText(input.description, "Description", TEXT_LIMITS.long)

  // AN OMITTED FIELD IS NOT AN EMPTY ONE — see the same block in lib/learning.ts.
  //
  // `undefined` means the caller never mentioned the field, so it KEEPS what is
  // stored; `null` (or "") means it was PRESENT and empty, so it really clears.
  // These three were written unconditionally, so `update_help_ticket` — which
  // requires only id + description and is marked agent.confirm: false — turned
  // "reword this ticket" into an unconfirmed wipe of its type and the reporter's
  // screen recording. The web form never sends `sourceScreen` at all, so every
  // edit through the app was also erasing which screen the ticket was raised
  // from. (Correctness review, round 5.)
  const helpType =
    input.helpType === undefined
      ? before.help_type
      : optionalText(input.helpType, "Type", TEXT_LIMITS.short) ?? null
  const screenRecordingLink =
    input.screenRecordingLink === undefined
      ? before.screen_recording_link
      : optionalText(input.screenRecordingLink, "Screen recording link", TEXT_LIMITS.link) ?? null
  const sourceScreen =
    input.sourceScreen === undefined
      ? before.source_screen
      : optionalText(input.sourceScreen, "Source", TEXT_LIMITS.short) ?? null

  const now = new Date().toISOString()
  // RETURNING turns the write into its own answer: no rows came back means
  // the predicate did not match, i.e. someone else changed this row first.
  const landed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE help SET help_type = ${sqlString(helpType)}, description = ${sqlString(description)}, screen_recording_link = ${sqlString(screenRecordingLink)}, source_screen = ${sqlString(sourceScreen)}, updated_at = ${sqlString(now)}, editor_id = ${sqlString(actor.id)}, editor_email = ${sqlString(actor.email)}, editor_name = ${sqlString(actor.name)} WHERE id = ${sqlString(id)}${versionPredicate(expectedVersion)} RETURNING id`
  )
  assertNotConflicted(landed.length, expectedVersion)

  // Every `to` is the value actually WRITTEN above — a preserved field must not
  // be reported as cleared.
  const diff = [
    { label: "Type", from: before.help_type, to: helpType },
    { label: "Description", from: before.description, to: description },
    {
      label: "Screen recording",
      from: before.screen_recording_link,
      to: screenRecordingLink,
      hideValues: true,
    },
    { label: "Source", from: before.source_screen, to: sourceScreen },
  ]
  const changes = describeChanges(diff)
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Help ticket edited",
      verb: "edited",
    description: `${actor.name} edited a support ticket${changes ? ` — ${changes}` : ""}`,
      changes: changedFields(diff),
    relatedTable: "help",
    relatedRowId: id,
  })
}

/** Move a ticket along its fixed lifecycle. Resolving stamps the resolver block +
 * resolved flag; any non-resolved status clears it. Caller-permission lives in the
 * route — every status move (incl. reopen) needs help:edit. */
export async function setStatus(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  id: string,
  status: HelpStatus
): Promise<boolean> {
  await ticketOrThrow(cfg, guard, id)
  // R17: the `status <> ?` predicate makes the move idempotent — re-resolving an
  // already-resolved ticket moves zero rows, so it writes no duplicate history,
  // re-stamps no editor/updated_at (no phantom re-sort), and pings nothing.
  const now = new Date().toISOString()
  const resolved = status === "resolved"
  const resolveBlock = resolved
    ? `resolved = 1, resolved_at = ${sqlString(now)}, resolver_id = ${sqlString(actor.id)}, resolver_email = ${sqlString(actor.email)}, resolver_name = ${sqlString(actor.name)}`
    : "resolved = 0, resolved_at = NULL, resolver_id = NULL, resolver_email = NULL, resolver_name = NULL"
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE help SET status = ?, ${resolveBlock}, updated_at = ?, editor_id = ${sqlString(actor.id)}, editor_email = ${sqlString(actor.email)}, editor_name = ${sqlString(actor.name)} WHERE id = ? AND status <> ? RETURNING id`,
    [status, now, id, status]
  )
  if (!changed[0]) return false

  await logActivity(cfg, guard.databaseId, actor, {
    type: `Help ticket ${status === "resolved" ? "resolved" : status === "reopened" ? "reopened" : "updated"}`,
    verb: "status",
    description: `${actor.name} set a support ticket to ${status.replace("_", " ")}`,
    relatedTable: "help",
    relatedRowId: id,
  })
  return true
}

/** Move MANY tickets to the same status in one call (the bulk sibling of
 * setStatus). Applies the SAME per-row change — same UPDATE, same resolver block,
 * same activity row — and reports how many actually changed vs. were skipped
 * (an id with no matching ticket, or one ALREADY at the target status — R17:
 * a re-run bulk writes no duplicate history and pings nothing). Returns the ids
 * that really changed so the route publishes one row-level ping EACH. */
export async function bulkSetStatus(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  ids: string[],
  status: HelpStatus
): Promise<{ changed: string[]; skipped: number }> {
  const changed: string[] = []
  let skipped = 0
  for (const id of ids) {
    try {
      if (await setStatus(cfg, guard, actor, id, status)) changed.push(id)
      else skipped++ // already at the target status — a no-op, not an event
    } catch (e) {
      // A missing ticket is skipped, not fatal — the rest of the batch still applies.
      if (e instanceof GuardError && e.status === 404) {
        skipped++
        continue
      }
      throw e
    }
  }
  return { changed, skipped }
}

/** The FILTER-shaped bulk (the set-shaped job): "move every ticket matching
 * these facets to <toStatus>" in ONE call — the agent has no variables, only
 * words, so passing it rows means re-saying every id; passing the FILTER is 2
 * calls where 10 round-trips were. It counts FIRST (so a confirm can state the
 * TRUE number), refuses past BULK_IDS_LIMIT, is idempotent by construction
 * (`status <> ?` — a re-run matches nothing), writes ONE activity row for the
 * whole set, and the route publishes only when something moved. Facets ONLY,
 * never free text — a fuzzy ranked match is not something a person can approve
 * honestly. `dryRun` returns the count without writing (the count-first step). */
export async function bulkSetStatusByFilter(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  filter: { status?: HelpStatus; helpType?: string },
  toStatus: HelpStatus,
  dryRun: boolean
): Promise<{ matched: number; changed: number }> {
  // The same facet set the Help screen sends (status / type). The R17 predicate
  // (`status <> ?`) is INLINE in both statements below — source-visible for the
  // idempotent-transitions scan — so "matched" is already "would change".
  const extra: string[] = []
  const extraParams: (string | number)[] = []
  if (filter.status) {
    extra.push("status = ?")
    extraParams.push(filter.status)
  }
  if (filter.helpType) {
    extra.push("help_type = ?")
    extraParams.push(filter.helpType)
  }
  const extraSql = extra.length ? ` AND ${extra.join(" AND ")}` : ""

  const countRows = await d1Query<{ n: number }>(
    cfg,
    guard.databaseId,
    `SELECT COUNT(*) AS n FROM help WHERE status <> ?${extraSql}`,
    [toStatus, ...extraParams]
  )
  const matched = countRows[0]?.n ?? 0
  if (dryRun || matched === 0) return { matched, changed: 0 }
  if (matched > BULK_IDS_LIMIT)
    throw new GuardError(
      400,
      "too_many",
      `That filter matches ${matched} tickets — the bulk ceiling is ${BULK_IDS_LIMIT}. Narrow the filter.`
    )

  const now = new Date().toISOString()
  const resolved = toStatus === "resolved"
  const resolveBlock = resolved
    ? `resolved = 1, resolved_at = ${sqlString(now)}, resolver_id = ${sqlString(actor.id)}, resolver_email = ${sqlString(actor.email)}, resolver_name = ${sqlString(actor.name)}`
    : "resolved = 0, resolved_at = NULL, resolver_id = NULL, resolver_email = NULL, resolver_name = NULL"
  const changedRows = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE help SET status = ?, ${resolveBlock}, updated_at = ?, editor_id = ${sqlString(actor.id)}, editor_email = ${sqlString(actor.email)}, editor_name = ${sqlString(actor.name)} WHERE status <> ?${extraSql} RETURNING id`,
    [toStatus, now, toStatus, ...extraParams]
  )
  const changed = changedRows.length
  if (changed > 0)
    // ONE activity row for the set — history says what happened, not per-row noise.
    // A 500-ticket resolve must NOT become 500 rows in the fastest-growing table
    // in the team database; that trades a readable record for a scaling problem.
    //
    // But the row still has to be FINDABLE, and it was not. Without `verb` it was
    // invisible to "every status change this month" — the very query the verb
    // column exists to answer — and it is the only status move in the module that
    // omitted it, so the closed set looked complete while this door wrote outside
    // it. Without `relatedRowId` it reached no record's own Activity tab either,
    // so a ticket resolved in bulk showed a ticket that resolved itself.
    //
    // A set of many has no single row to hang off, and inventing one would be a
    // lie. A set of ONE does — and "resolve the three open bugs" landing on one
    // ticket is the ordinary case, not the edge — so the id rides along exactly
    // when it is true. (Activity-log review, round 5.)
    await logActivity(cfg, guard.databaseId, actor, {
      type: `Help tickets ${toStatus === "resolved" ? "resolved" : "updated"} (bulk)`,
      verb: "status",
      description: `${actor.name} set ${changed} support ticket${changed === 1 ? "" : "s"}${filter.helpType ? ` of type "${filter.helpType}"` : ""}${filter.status ? ` from ${filter.status.replace("_", " ")}` : ""} to ${toStatus.replace("_", " ")}`,
      relatedTable: "help",
      relatedRowId: changed === 1 ? changedRows[0].id : undefined,
    })
  return { matched, changed }
}

/** Add a reply to a ticket's thread, and bump the ticket's updated_at so it
 * re-sorts to the top of both tabs. `taggedUserIds` are notify-only mentions (the
 * notify happens in the route). `isAgent` marks the AI-drafted reply. Returns the
 * new reply's id. */
export async function addReply(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  ticketId: string,
  body: string,
  taggedUserIds: string[],
  isAgent: boolean
): Promise<string> {
  const clean = body.trim()
  if (!clean) throw new GuardError(400, "invalid_input", "A reply can't be empty.")
  await ticketOrThrow(cfg, guard, ticketId)

  const id = ulid()
  const now = new Date().toISOString()
  const tagged = taggedUserIds.length ? sqlString(JSON.stringify(taggedUserIds)) : "NULL"
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO help_threads (id, help_id, message_body, tagged_user_ids, is_agent, created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(id)}, ${sqlString(ticketId)}, ${sqlString(clean)}, ${tagged}, ${isAgent ? 1 : 0}, ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});
UPDATE help SET updated_at = ${sqlString(now)} WHERE id = ${sqlString(ticketId)};`
  )

  // LAW R25 — a reply is a real change to a real record, and this was the only
  // user-editable business table in the base whose writes were logged nowhere.
  // It mattered most for the surface least likely to be watched: `add_help_reply`
  // is an agent AND MCP tool, so the assistant could add content to a customer's
  // support ticket and leave no trace of having done so. The previous audit
  // missed it because a `logActivity` sits thirty lines above, in a different
  // function. (Activity-log review, 2026-08-25.)
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Ticket reply added",
    verb: "created",
    description: `${actor.name} replied to a support ticket${isAgent ? " (drafted by the assistant)" : ""}`,
    relatedTable: "help",
    relatedRowId: ticketId,
  })

  return id
}

/** HOOK (Phase 3) — the AI agent drafts the FIRST reply here, labelled "Drafted by
 * the Brimba assistant" (is_agent = 1), built from Learning content + the team's
 * data. Until the data-ops/agent worker exists this stays a no-op, so a ticket
 * always opens awaiting a human reply (per the locked "ticket always opens" rule).
 * When implemented it will addReply(..., isAgent=true) and publish help_threads. */
export async function maybeDraftFirstReply(
  _cfg: D1Rest,
  _guard: MemberGuard,
  _ticketId: string,
  _description: string
): Promise<string | null> {
  return null
}
