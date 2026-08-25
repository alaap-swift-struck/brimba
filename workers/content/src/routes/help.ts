// Help routes: list tickets (My/All tabs = a creator filter), read one ticket's
// thread, raise a ticket, edit it, move its fixed status, and reply. Mirrors the
// learning routes: open with the shared gated opening (teamContext + requireRight
// on the `help` module + defensive body read), parse + 400 on bad input, then
// publishChange (row id + op) so open lists + the thread patch just that row.
// Locked module rules live in lib/help; the reply notify (raiser + @mentions) is
// best-effort in lib/notify.

import { fail, json, pagedJson } from "../../../../shared/workers/http"
import { optionalText, requireText, TEXT_LIMITS } from "../../../../shared/workers/validate"
import { publishChange } from "../../../../shared/workers/realtime"
import { gated, gatedBody } from "../../../../shared/workers/route"
import { requireIdList } from "../../../../shared/workers/bulk"
import {
  addReply,
  bulkSetStatus,
  createTicket,
  getTicket,
  HELP_STATUSES,
  listReplies,
  oneReply,
  listTickets,
  maybeDraftFirstReply,
  setStatus,
  updateTicket,
  type HelpStatus,
  type TicketInput,
  countTickets,
  countReplies,
  bulkSetStatusByFilter,
} from "../lib/help"
import { notifyReplyAndMentions } from "../lib/notify"
import { addStakeholder, listStakeholders } from "../lib/stakeholders"
import type { Env } from "../env"
import { MENTION_LIMIT, optionalIdList } from "../../../../shared/workers/bulk"

/** EVERY ticket response is a PAGE (R14) — including the one a mutation returns,
 * so a client re-priming its list from a write still learns where page two
 * starts. One seam: rows + exact totals + hasMore + the opaque cursor. */
async function ticketPage(
  cfg: Parameters<typeof listTickets>[0],
  guard: Parameters<typeof listTickets>[1],
  scope: "mine" | "all",
  cursor: string | null = null
): Promise<Response> {
  const [page, counts] = await Promise.all([listTickets(cfg, guard, scope, cursor), countTickets(cfg, guard)])
  return pagedJson("tickets", { ...page, total: counts.total }, { mineTotal: counts.mineTotal })
}

/** GET /api/content/help?scope=mine|all  (?id=<ticketId> → just that one). */
export async function getHelp(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "help", "read")
  const url = new URL(request.url)
  const scope = url.searchParams.get("scope") === "mine" ? "mine" : "all"
  const id = url.searchParams.get("id")
  // One ticket by id is a LOOKUP, not a page — answer it directly rather than
  // filtering a page (which could legitimately not contain it once paged).
  if (id) {
    const one = await getTicket(cfg, guard, id)
    const counts = await countTickets(cfg, guard)
    return pagedJson(
      "tickets",
      { rows: one ? [one] : [], total: counts.total, hasMore: false, nextCursor: null },
      { mineTotal: counts.mineTotal }
    )
  }
  // R14: tickets are a GROWING collection, so the door pages by key — the opaque
  // cursor comes straight back from the previous response. R16: the exact server
  // totals (All + the caller's My) ride every list response.
  return ticketPage(cfg, guard, scope, url.searchParams.get("cursor"))
}

/** GET /api/content/help/thread?id=<ticketId> → the ticket's replies (oldest first). */
export async function getHelpThread(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "help", "read")
  const id = new URL(request.url).searchParams.get("id")
  if (!id) return fail(400, "invalid_input", "A ticket id is required.")
  return json({ replies: await listReplies(cfg, guard, id) , total: await countReplies(cfg, guard, id) })
}

/** POST /api/content/help — raise a ticket (help:create). */
export async function postCreateHelp(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<TicketInput>(request, env, "help", "create")
  const description = requireText(body.description, "Description", TEXT_LIMITS.long)
  const id = await createTicket(cfg, guard, actor, body)
  await publishChange(env.REALTIME, guard.teamId, "help", id, "add")
  // HOOK (Phase 3): the agent drafts the first reply here; a no-op today, so the
  // ticket simply opens awaiting a human (per "ticket always opens").
  await maybeDraftFirstReply(cfg, guard, id, description)
  // R21: the CREATED ROW, not page one of the collection. Handing a paged screen
  // its first page on every create is the exact thing R14 exists to stop — the
  // caller patches this one row into whichever scope it is showing.
  const counts = await countTickets(cfg, guard)
  return json({ created: await getTicket(cfg, guard, id), total: counts.total, mineTotal: counts.mineTotal })
}

/** POST /api/content/help/update — edit a ticket (help:edit). */
export async function postUpdateHelp(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<TicketInput & { id?: string; expectedVersion?: string }>(request, env, "help", "edit")
  if (!body.id) return fail(400, "invalid_input", "id and description are required.")
  requireText(body.description, "Description", TEXT_LIMITS.long)
  await updateTicket(cfg, guard, actor, body.id, body, body.expectedVersion)
  await publishChange(env.REALTIME, guard.teamId, "help", body.id)
  // R23: the affected ROW, never the collection. See RULES.md.
  return json({ updated: await getTicket(cfg, guard, body.id) })
}

/** POST /api/content/help/status — move a ticket along its fixed lifecycle.
 * Gated PURELY by help:edit (every status move, including reopen — no raiser exception). */
export async function postHelpStatus(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ id?: string; status?: string }>(request, env, "help", "edit")
  if (!body.id || !body.status || !(HELP_STATUSES as readonly string[]).includes(body.status))
    return fail(400, "invalid_input", "id and a valid status are required.")
  const status = body.status as HelpStatus

  const ticket = await getTicket(cfg, guard, body.id)
  if (!ticket) return fail(404, "help_not_found", "That ticket doesn't exist.")

  // R17: already at that status → zero rows moved → no ping, no duplicate history.
  const changed = await setStatus(cfg, guard, actor, body.id, status)
  if (changed) await publishChange(env.REALTIME, guard.teamId, "help", body.id)
  // R23: the affected ROW, never the collection. See RULES.md.
  return json({ updated: await getTicket(cfg, guard, body.id) })
}

/** POST /api/content/help/bulk-status-by-filter — the SET-shaped bulk: move every
 * ticket matching the facet filter (status / type) to one status, in one call.
 * Counts first (dryRun returns just the count), refuses past the bulk ceiling,
 * idempotent by construction, ONE activity row, and publishes ONE coarse ping
 * only when something moved (R17: a no-op publishes nothing). Facets only —
 * free text is deliberately NOT a filter for a write. Gated by help:edit. */
export async function postBulkHelpStatusByFilter(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{
    toStatus?: unknown
    status?: unknown
    helpType?: unknown
    dryRun?: unknown
  }>(request, env, "help", "edit")
  if (typeof body.toStatus !== "string" || !(HELP_STATUSES as readonly string[]).includes(body.toStatus))
    return fail(400, "invalid_input", "A valid toStatus is required.")
  const filter: { status?: HelpStatus; helpType?: string } = {}
  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !(HELP_STATUSES as readonly string[]).includes(body.status))
      return fail(400, "invalid_input", "status must be a valid status facet.")
    filter.status = body.status as HelpStatus
  }
  const helpType = optionalText(body.helpType, "Type", TEXT_LIMITS.short)
  if (helpType) filter.helpType = helpType
  const result = await bulkSetStatusByFilter(
    cfg, guard, actor, filter, body.toStatus as HelpStatus, body.dryRun === true
  )
  // ONE coarse list-ping for the whole set — and only when something moved.
  if (result.changed > 0) await publishChange(env.REALTIME, guard.teamId, "help")
  return json(result)
}

/** POST /api/content/help/bulk-status — move MANY tickets to the same status in one
 * call (the bulk sibling of the single status endpoint). Gated ONCE by the SAME
 * right (help:edit), validates ids at the boundary (non-empty array of non-empty
 * strings, cap 500 → clean 400) and the status against the same allowed set the
 * single endpoint uses, applies the same per-row change to every matching ticket,
 * and — the live-sync law — publishes ONE row-level ping per CHANGED row (patch
 * that row, never refetch the list). Returns { updated, skipped }. */
export async function postBulkHelpStatus(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ ids?: unknown; status?: unknown }>(request, env, "help", "edit")
  const ids = requireIdList(body.ids)
  if (typeof body.status !== "string" || !(HELP_STATUSES as readonly string[]).includes(body.status))
    return fail(400, "invalid_input", "A valid status is required.")
  const { changed, skipped } = await bulkSetStatus(cfg, guard, actor, ids, body.status as HelpStatus)
  // Row-level live-sync: one ping per changed ticket (same row shape the single
  // endpoint patches) — no list refetch.
  for (const id of changed) await publishChange(env.REALTIME, guard.teamId, "help", id)
  return json({ updated: changed.length, skipped })
}

/** POST /api/content/help/reply — add a reply to a ticket's thread (help:read; any
 * member who can see tickets may join the conversation). Publishes the new reply
 * (thread view) AND the ticket (it re-sorts to the top), then notifies best-effort. */
export async function postHelpReply(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{
    helpId?: string
    body?: string
    taggedUserIds?: unknown
  }>(request, env, "help", "read")
  if (!body.helpId) return fail(400, "invalid_input", "helpId and a reply body are required.")
  const replyBody = requireText(body.body, "Reply", TEXT_LIMITS.long)

  const ticket = await getTicket(cfg, guard, body.helpId)
  if (!ticket) return fail(404, "help_not_found", "That ticket doesn't exist.")

  // Untrusted, and CAPPED. A mention is notify-only — never an instruction — and
  // each one becomes an email, so an uncounted list let any `help:read` holder
  // address the whole team from a single reply. `optionalIdList` bounds it at
  // BULK_IDS_LIMIT and refuses a malformed entry with a clean 400; the author's
  // own id is dropped after, because you cannot @mention yourself.
  const tagged = optionalIdList(body.taggedUserIds, MENTION_LIMIT).filter((x) => x !== actor.id)

  const replyId = await addReply(cfg, guard, actor, body.helpId, replyBody, tagged, false)
  await publishChange(env.REALTIME, guard.teamId, "help_threads", replyId, "add")
  await publishChange(env.REALTIME, guard.teamId, "help", body.helpId, "edit")
  await notifyReplyAndMentions(
    env,
    guard.teamId,
    { id: ticket.id, raiserId: ticket.raiserId },
    { id: actor.id, name: actor.name },
    replyBody,
    tagged
  )
  // R21 again, one level down: a reply is a create too. The thread grows with
  // use, so returning all of it to add one message is the same defect at a
  // smaller scale — the caller appends this message to the loaded thread.
  return json({ created: await oneReply(cfg, guard, replyId), total: await countReplies(cfg, guard, body.helpId) })
}

/** GET /api/content/help/stakeholders?id=<ticketId> — the full derived ∪ added
 * set (raiser + admins + @mentions + manual adds). help:read gates it. */
export async function getHelpStakeholders(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "help", "read")
  const id = new URL(request.url).searchParams.get("id")
  if (!id) return fail(400, "invalid_input", "A ticket id is required.")
  return json({ stakeholders: await listStakeholders(cfg, env, guard, id) })
}

/** POST /api/content/help/stakeholders — manually add a stakeholder (help:read;
 * any member who can see a ticket may pull a teammate in). Add-only — never
 * removes anyone. SEAM LAW: this mutation publishes the help row change. */
export async function postAddStakeholder(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ id?: string; userId?: string }>(request, env, "help", "read")
  if (!body.id || !body.userId)
    return fail(400, "invalid_input", "id and userId are required.")
  const ticket = await getTicket(cfg, guard, body.id)
  if (!ticket) return fail(404, "help_not_found", "That ticket doesn't exist.")
  const stakeholders = await addStakeholder(cfg, env, guard, actor, body.id, body.userId)
  await publishChange(env.REALTIME, guard.teamId, "help", body.id, "edit")
  return json({ stakeholders })
}
