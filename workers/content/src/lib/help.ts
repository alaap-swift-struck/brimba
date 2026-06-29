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

import { logActivity, type Actor } from "../../../../shared/workers/activity"
import { d1ExecScript, d1Query, sqlString, type D1Rest } from "../../../../shared/workers/d1-rest"
import { ulid } from "../../../../shared/workers/id"
import type { HelpMessage, HelpTicket } from "../../../../shared/types"
import { GuardError, type MemberGuard } from "../../../../shared/workers/gating"
import { optionalText, requireText, TEXT_LIMITS } from "../../../../shared/workers/validate"

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
  "id, help_type, description, screen_recording_link, source_screen, status, resolved, resolved_at, creator_id, creator_name, created_at, updated_at"

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

/** Tickets for the team, newest-activity first. `scope: "mine"` returns only the
 * caller's own raised tickets (the My tab); "all" returns everyone's (All tab). */
export async function listTickets(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: "mine" | "all"
): Promise<HelpTicket[]> {
  const where = scope === "mine" ? "WHERE creator_id = ?" : ""
  const params = scope === "mine" ? [guard.userId] : []
  const rows = await d1Query<TicketRow>(
    cfg,
    guard.databaseId,
    `SELECT ${TICKET_COLS} FROM help ${where} ORDER BY COALESCE(updated_at, created_at) DESC`,
    params
  )
  return rows.map(toTicket)
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
    "SELECT id, help_id, message_body, tagged_user_ids, is_agent, creator_id, creator_name, created_at FROM help_threads WHERE help_id = ? ORDER BY created_at ASC",
    [ticketId]
  )
  return rows.map(toMessage)
}

/** Fields a create / update accepts. */
export type TicketInput = {
  description?: string
  helpType?: string
  screenRecordingLink?: string
  sourceScreen?: string
  sourceRelatedTable?: string
  sourceRelatedRowId?: string
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
  input: TicketInput
): Promise<void> {
  await ticketOrThrow(cfg, guard, id)
  const description = requireText(input.description, "Description", TEXT_LIMITS.long)

  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `UPDATE help SET help_type = ${sqlString((optionalText(input.helpType, "Type", TEXT_LIMITS.short) ?? null))}, description = ${sqlString(description)}, screen_recording_link = ${sqlString((optionalText(input.screenRecordingLink, "Screen recording link", TEXT_LIMITS.link) ?? null))}, source_screen = ${sqlString((optionalText(input.sourceScreen, "Source", TEXT_LIMITS.short) ?? null))}, updated_at = ${sqlString(now)}, editor_id = ${sqlString(actor.id)}, editor_email = ${sqlString(actor.email)}, editor_name = ${sqlString(actor.name)} WHERE id = ${sqlString(id)};`
  )

  await logActivity(cfg, guard.databaseId, actor, {
    type: "Help ticket edited",
    description: `${actor.name} edited a support ticket`,
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
): Promise<void> {
  await ticketOrThrow(cfg, guard, id)
  const now = new Date().toISOString()
  const resolved = status === "resolved"
  const resolveBlock = resolved
    ? `resolved = 1, resolved_at = ${sqlString(now)}, resolver_id = ${sqlString(actor.id)}, resolver_email = ${sqlString(actor.email)}, resolver_name = ${sqlString(actor.name)}`
    : "resolved = 0, resolved_at = NULL, resolver_id = NULL, resolver_email = NULL, resolver_name = NULL"
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `UPDATE help SET status = ${sqlString(status)}, ${resolveBlock}, updated_at = ${sqlString(now)}, editor_id = ${sqlString(actor.id)}, editor_email = ${sqlString(actor.email)}, editor_name = ${sqlString(actor.name)} WHERE id = ${sqlString(id)};`
  )

  await logActivity(cfg, guard.databaseId, actor, {
    type: `Help ticket ${status === "resolved" ? "resolved" : status === "reopened" ? "reopened" : "updated"}`,
    description: `${actor.name} set a support ticket to ${status.replace("_", " ")}`,
    relatedTable: "help",
    relatedRowId: id,
  })
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
