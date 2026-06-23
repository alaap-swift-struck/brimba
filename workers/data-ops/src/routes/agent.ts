// Agent routes. For now: the team's AI quota snapshot (members) and the owner-only
// credit top-up. The agent chat/executor endpoints land here next (increment B).

import { fail, json } from "../../../../shared/workers/http"
import { publishChange } from "../../../../shared/workers/realtime"
import { adminGuard, teamContext } from "../../../../shared/workers/gating"
import { getQuota, grantCredits } from "../lib/credits"
import type { Env } from "../env"

/** GET /api/data-ops/agent/usage — the active team's AI quota (free + credits). */
export async function getAgentUsage(request: Request, env: Env): Promise<Response> {
  const { guard } = await teamContext(request, env)
  return json({ quota: await getQuota(env, guard.teamId) })
}

/** POST /api/data-ops/admin/grant-credits — owner-only credit top-up for a team
 * (x-admin-key). Pings the team so an open usage view refreshes. The future payment
 * webhook will call the same grant path. */
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
