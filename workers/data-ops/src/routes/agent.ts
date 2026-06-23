// Agent routes: the team's AI quota, the owner credit top-up, and the agent itself —
// chat (run a turn), confirm (approve/decline a proposed dangerous action), and the
// saved conversations. Using the agent is gated by the `agent` module right
// (read = view history; create = use it). The agent's ACTIONS are gated again at the
// real endpoint it calls (act-as-user), so it can never exceed the caller's rights.

import { fail, json } from "../../../../shared/workers/http"
import { publishChange } from "../../../../shared/workers/realtime"
import { adminGuard, requireRight, teamContext } from "../../../../shared/workers/gating"
import { getQuota, grantCredits } from "../lib/credits"
import { confirmAndRun, runChat } from "../lib/agent"
import { listMessages, listThreads } from "../lib/threads"
import type { Env } from "../env"

/** GET /api/data-ops/agent/usage — the active team's AI quota (free + credits). */
export async function getAgentUsage(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "agent", "read")
  return json({ quota: await getQuota(env, guard.teamId) })
}

/** POST /api/data-ops/admin/grant-credits — owner-only credit top-up (x-admin-key). */
export async function postGrantCredits(request: Request, env: Env): Promise<Response> {
  const blocked = adminGuard(request, env)
  if (blocked) return blocked
  const body = (await request.json().catch(() => ({}))) as { teamId?: string; amount?: number }
  const amount = Number(body.amount)
  if (!body.teamId || !Number.isFinite(amount) || amount <= 0 || Math.trunc(amount) !== amount)
    return fail(400, "invalid_input", "teamId and a positive whole amount are required.")
  const balance = await grantCredits(env, body.teamId, amount)
  await publishChange(env.REALTIME, body.teamId, "agent_usage")
  return json({ teamId: body.teamId, balance })
}

/** POST /api/data-ops/agent/chat — run one agent turn (answer, or propose/take action). */
export async function postAgentChat(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "agent", "create")
  const body = (await request.json().catch(() => ({}))) as { threadId?: string; message?: string }
  if (!body.message?.trim()) return fail(400, "invalid_input", "Type a message for the assistant.")
  const outcome = await runChat(env, request, cfg, guard, actor, {
    threadId: body.threadId,
    message: body.message,
    source: "in-app",
  })
  return json(outcome)
}

/** POST /api/data-ops/agent/confirm — approve (or decline) the proposed dangerous
 * action(s) the last turn returned, then resume. */
export async function postAgentConfirm(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "agent", "create")
  const body = (await request.json().catch(() => ({}))) as { threadId?: string; approve?: boolean }
  if (!body.threadId || typeof body.approve !== "boolean")
    return fail(400, "invalid_input", "threadId and approve are required.")
  // What runs comes from the server's stored proposal (in confirmAndRun), not the
  // client — any client-supplied `calls` are ignored, so nothing un-proposed executes.
  const out = await confirmAndRun(env, request, cfg, guard, actor, {
    threadId: body.threadId,
    approve: body.approve,
    source: "in-app",
  })
  return json(out)
}

/** GET /api/data-ops/agent/threads — the caller's saved conversations. */
export async function getAgentThreads(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "agent", "read")
  return json({ threads: await listThreads(cfg, guard) })
}

/** GET /api/data-ops/agent/thread?id= — one conversation's messages. */
export async function getAgentThread(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "agent", "read")
  const id = new URL(request.url).searchParams.get("id")
  if (!id) return fail(400, "invalid_input", "A conversation id is required.")
  return json({ messages: await listMessages(cfg, guard, id) })
}
