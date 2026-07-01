// The agent's saved conversations (per-team memory), in the team's OWN database.
// agent_threads = one conversation; agent_messages = each turn, including the agent's
// tool-calls (the audit of what it did) + the source (in-app vs which MCP client).
// This is also the agent audit log: human turns are role "user"; agent output is
// "assistant"/"tool"; `source` tags where the request came from.

import { d1ExecScript, d1Query, sqlString, type D1Rest } from "../../../../shared/workers/d1-rest"
import { ulid } from "../../../../shared/workers/id"
import { GuardError, type MemberGuard } from "../../../../shared/workers/gating"
import type { AgentMessage, AgentThread } from "../../../../shared/types"

type ThreadRow = { id: string; title: string | null; last_message_at: string | null; created_at: string }
type MsgRow = {
  id: string
  thread_id: string
  role: string
  content: string | null
  tool_calls_json: string | null
  source: string | null
  created_at: string
}

function toThread(r: ThreadRow): AgentThread {
  return { id: r.id, title: r.title, lastMessageAt: r.last_message_at, createdAt: r.created_at }
}

function toMessage(r: MsgRow): AgentMessage {
  let toolCalls: AgentMessage["toolCalls"]
  if (r.tool_calls_json) {
    try {
      toolCalls = JSON.parse(r.tool_calls_json)
    } catch {
      toolCalls = undefined
    }
  }
  return {
    id: r.id,
    threadId: r.thread_id,
    role: (r.role === "assistant" || r.role === "tool" ? r.role : "user") as AgentMessage["role"],
    content: r.content,
    toolCalls,
    source: r.source,
    createdAt: r.created_at,
  }
}

/** The caller's own saved conversations, newest activity first. */
export async function listThreads(cfg: D1Rest, guard: MemberGuard): Promise<AgentThread[]> {
  const rows = await d1Query<ThreadRow>(
    cfg,
    guard.databaseId,
    "SELECT id, title, last_message_at, created_at FROM agent_threads WHERE creator_id = ? ORDER BY COALESCE(last_message_at, created_at) DESC",
    [guard.userId]
  )
  return rows.map(toThread)
}

/** Every message in a thread, oldest first. Throws 404 if the thread isn't the
 * caller's (own conversations only). */
export async function listMessages(
  cfg: D1Rest,
  guard: MemberGuard,
  threadId: string
): Promise<AgentMessage[]> {
  await ownThreadOrThrow(cfg, guard, threadId)
  const rows = await d1Query<MsgRow>(
    cfg,
    guard.databaseId,
    "SELECT id, thread_id, role, content, tool_calls_json, source, created_at FROM agent_messages WHERE thread_id = ? ORDER BY created_at ASC",
    [threadId]
  )
  return rows.map(toMessage)
}

async function ownThreadOrThrow(cfg: D1Rest, guard: MemberGuard, threadId: string): Promise<void> {
  const rows = await d1Query<{ creator_id: string }>(
    cfg,
    guard.databaseId,
    "SELECT creator_id FROM agent_threads WHERE id = ?",
    [threadId]
  )
  if (!rows[0]) throw new GuardError(404, "thread_not_found", "That conversation doesn't exist.")
  if (rows[0].creator_id !== guard.userId)
    throw new GuardError(403, "forbidden", "That conversation isn't yours.")
}

export async function createThread(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: { id: string; email: string; name: string },
  title: string
): Promise<string> {
  const id = ulid()
  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO agent_threads (id, title, last_message_at, created_at, creator_id, creator_email, creator_name) VALUES (${sqlString(id)}, ${sqlString(title.slice(0, 80) || null)}, ${sqlString(now)}, ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`
  )
  return id
}

export async function appendMessage(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: { id: string; email: string; name: string },
  threadId: string,
  msg: { role: "user" | "assistant" | "tool"; content: string; toolCallsJson?: string; source: string }
): Promise<string> {
  const id = ulid()
  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO agent_messages (id, thread_id, role, content, tool_calls_json, source, created_at) VALUES (${sqlString(id)}, ${sqlString(threadId)}, ${sqlString(msg.role)}, ${sqlString(msg.content || null)}, ${sqlString(msg.toolCallsJson ?? null)}, ${sqlString(msg.source)}, ${sqlString(now)});
UPDATE agent_threads SET last_message_at = ${sqlString(now)} WHERE id = ${sqlString(threadId)};`
  )
  return id
}

/** The dangerous calls the LAST turn proposed for this thread (name + input), read
 * from the most recent assistant message's stored proposal. The confirm path runs
 * exactly these — not whatever the client sends — so a client can't approve a call
 * the model never proposed. Owner-scoped (ownThreadOrThrow). */
export async function getPendingProposal(
  cfg: D1Rest,
  guard: MemberGuard,
  threadId: string
): Promise<{ name: string; input: Record<string, unknown> }[]> {
  await ownThreadOrThrow(cfg, guard, threadId)
  const rows = await d1Query<{ tool_calls_json: string | null }>(
    cfg,
    guard.databaseId,
    "SELECT tool_calls_json FROM agent_messages WHERE thread_id = ? AND role = 'assistant' AND tool_calls_json IS NOT NULL ORDER BY created_at DESC LIMIT 1",
    [threadId]
  )
  const raw = rows[0]?.tool_calls_json
  if (!raw) return []
  try {
    const arr = JSON.parse(raw) as { tool?: string; input?: unknown; status?: string }[]
    if (!Array.isArray(arr)) return []
    return arr
      .filter((x) => x && x.status === "proposed" && typeof x.tool === "string")
      .map((x) => ({
        name: x.tool as string,
        input: (x.input && typeof x.input === "object" ? x.input : {}) as Record<string, unknown>,
      }))
  } catch {
    return []
  }
}

/** Flip the pending proposal's statuses "proposed" → "done" once its calls have run,
 * so a stray re-POST to /confirm finds nothing waiting and can't replay a remove.
 * Rewrites the SAME row getPendingProposal reads (owner-scoped). */
export async function consumePendingProposal(
  cfg: D1Rest,
  guard: MemberGuard,
  threadId: string
): Promise<void> {
  await ownThreadOrThrow(cfg, guard, threadId)
  const rows = await d1Query<{ id: string; tool_calls_json: string | null }>(
    cfg,
    guard.databaseId,
    "SELECT id, tool_calls_json FROM agent_messages WHERE thread_id = ? AND role = 'assistant' AND tool_calls_json IS NOT NULL ORDER BY created_at DESC LIMIT 1",
    [threadId]
  )
  const row = rows[0]
  if (!row?.tool_calls_json) return
  let updated: string
  try {
    const arr = JSON.parse(row.tool_calls_json) as { status?: string }[]
    if (!Array.isArray(arr)) return
    updated = JSON.stringify(arr.map((x) => (x && x.status === "proposed" ? { ...x, status: "done" } : x)))
  } catch {
    return
  }
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `UPDATE agent_messages SET tool_calls_json = ${sqlString(updated)} WHERE id = ${sqlString(row.id)};`
  )
}
