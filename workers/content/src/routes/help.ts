// Help routes: list tickets (My/All tabs = a creator filter), read one ticket's
// thread, raise a ticket, edit it, move its fixed status, and reply. Mirrors the
// learning routes: open with teamContext, gate with requireRight on the `help`
// module, parse + 400 on bad input, then publishChange (row id + op) so open lists
// + the thread patch just that row. Locked module rules live in lib/help; the
// reply notify (raiser + @mentions) is best-effort in lib/notify.

import { fail, json } from "../../../../shared/workers/http"
import { requireText, TEXT_LIMITS } from "../../../../shared/workers/validate"
import { publishChange } from "../../../../shared/workers/realtime"
import { requireRight, teamContext } from "../../../../shared/workers/gating"
import {
  addReply,
  createTicket,
  getTicket,
  HELP_STATUSES,
  listReplies,
  listTickets,
  maybeDraftFirstReply,
  setStatus,
  updateTicket,
  type HelpStatus,
  type TicketInput,
} from "../lib/help"
import { notifyReplyAndMentions } from "../lib/notify"
import { addStakeholder, listStakeholders } from "../lib/stakeholders"
import type { Env } from "../env"

/** GET /api/content/help?scope=mine|all  (?id=<ticketId> → just that one). */
export async function getHelp(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "help", "read")
  const url = new URL(request.url)
  const scope = url.searchParams.get("scope") === "mine" ? "mine" : "all"
  const tickets = await listTickets(cfg, guard, scope)
  const id = url.searchParams.get("id")
  return json({ tickets: id ? tickets.filter((t) => t.id === id) : tickets })
}

/** GET /api/content/help/thread?id=<ticketId> → the ticket's replies (oldest first). */
export async function getHelpThread(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "help", "read")
  const id = new URL(request.url).searchParams.get("id")
  if (!id) return fail(400, "invalid_input", "A ticket id is required.")
  return json({ replies: await listReplies(cfg, guard, id) })
}

/** POST /api/content/help — raise a ticket (help:create). */
export async function postCreateHelp(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "help", "create")
  const body = (await request.json().catch(() => ({}))) as TicketInput
  const description = requireText(body.description, "Description", TEXT_LIMITS.long)
  const id = await createTicket(cfg, guard, actor, body)
  await publishChange(env.REALTIME, guard.teamId, "help", id, "add")
  // HOOK (Phase 3): the agent drafts the first reply here; a no-op today, so the
  // ticket simply opens awaiting a human (per "ticket always opens").
  await maybeDraftFirstReply(cfg, guard, id, description)
  return json({ tickets: await listTickets(cfg, guard, "all") })
}

/** POST /api/content/help/update — edit a ticket (help:edit). */
export async function postUpdateHelp(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "help", "edit")
  const body = (await request.json().catch(() => ({}))) as TicketInput & { id?: string }
  if (!body.id) return fail(400, "invalid_input", "id and description are required.")
  requireText(body.description, "Description", TEXT_LIMITS.long)
  await updateTicket(cfg, guard, actor, body.id, body)
  await publishChange(env.REALTIME, guard.teamId, "help", body.id)
  return json({ tickets: await listTickets(cfg, guard, "all") })
}

/** POST /api/content/help/status — move a ticket along its fixed lifecycle.
 * Gated PURELY by help:edit (every status move, including reopen — no raiser exception). */
export async function postHelpStatus(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "help", "edit")
  const body = (await request.json().catch(() => ({}))) as { id?: string; status?: string }
  if (!body.id || !body.status || !(HELP_STATUSES as readonly string[]).includes(body.status))
    return fail(400, "invalid_input", "id and a valid status are required.")
  const status = body.status as HelpStatus

  const ticket = await getTicket(cfg, guard, body.id)
  if (!ticket) return fail(404, "help_not_found", "That ticket doesn't exist.")

  await setStatus(cfg, guard, actor, body.id, status)
  await publishChange(env.REALTIME, guard.teamId, "help", body.id)
  return json({ tickets: await listTickets(cfg, guard, "all") })
}

/** POST /api/content/help/reply — add a reply to a ticket's thread (help:read; any
 * member who can see tickets may join the conversation). Publishes the new reply
 * (thread view) AND the ticket (it re-sorts to the top), then notifies best-effort. */
export async function postHelpReply(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "help", "read")
  const body = (await request.json().catch(() => ({}))) as {
    helpId?: string
    body?: string
    taggedUserIds?: unknown
  }
  if (!body.helpId) return fail(400, "invalid_input", "helpId and a reply body are required.")
  const replyBody = requireText(body.body, "Reply", TEXT_LIMITS.long)

  const ticket = await getTicket(cfg, guard, body.helpId)
  if (!ticket) return fail(404, "help_not_found", "That ticket doesn't exist.")

  // Untrusted: only keep string ids, and never the author's own id (you can't
  // @mention yourself). A mention is notify-only — never an instruction.
  const tagged = Array.isArray(body.taggedUserIds)
    ? body.taggedUserIds.filter((x): x is string => typeof x === "string" && x !== actor.id)
    : []

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
  return json({ replies: await listReplies(cfg, guard, body.helpId) })
}

/** GET /api/content/help/stakeholders?id=<ticketId> — the full derived ∪ added
 * set (raiser + admins + @mentions + manual adds). help:read gates it. */
export async function getHelpStakeholders(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "help", "read")
  const id = new URL(request.url).searchParams.get("id")
  if (!id) return fail(400, "invalid_input", "A ticket id is required.")
  return json({ stakeholders: await listStakeholders(cfg, env, guard, id) })
}

/** POST /api/content/help/stakeholders — manually add a stakeholder (help:read;
 * any member who can see a ticket may pull a teammate in). Add-only — never
 * removes anyone. SEAM LAW: this mutation publishes the help row change. */
export async function postAddStakeholder(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "help", "read")
  const body = (await request.json().catch(() => ({}))) as { id?: string; userId?: string }
  if (!body.id || !body.userId)
    return fail(400, "invalid_input", "id and userId are required.")
  const ticket = await getTicket(cfg, guard, body.id)
  if (!ticket) return fail(404, "help_not_found", "That ticket doesn't exist.")
  const stakeholders = await addStakeholder(cfg, env, guard, actor, body.id, body.userId)
  await publishChange(env.REALTIME, guard.teamId, "help", body.id, "edit")
  return json({ stakeholders })
}
