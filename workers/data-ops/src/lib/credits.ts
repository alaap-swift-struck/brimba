// The agent quota gate (owner's credit-based model). Each team gets a FREE daily
// allowance of AI requests; beyond that it spends from a purchasable credit balance;
// out of both, the agent warns then hard-stops for the day. The agent consumes ONE
// unit per AI request (the real cost driver) at this single shared gate. Lives over
// the global core DB (agent_usage = the daily-free counter; agent_credits = the
// balance) so it works without opening a team database.

import type { AgentQuota } from "../../../../shared/types"
import type { Env } from "../env"

/** Free AI requests per team per day before credits are spent. */
export const FREE_DAILY = 25

/** Today's metering window, 'YYYY-MM-DD' (the free counter resets daily). */
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/** A team's current quota snapshot (free used today + purchasable balance). */
export async function getQuota(env: Env, teamId: string): Promise<AgentQuota> {
  const usage = await env.DB.prepare(
    "SELECT used FROM agent_usage WHERE team_id = ? AND period = ?"
  )
    .bind(teamId, today())
    .first<{ used: number }>()
  const credit = await env.DB.prepare("SELECT balance FROM agent_credits WHERE team_id = ?")
    .bind(teamId)
    .first<{ balance: number }>()
  const cap = Number(env.AGENT_FREE_DAILY) || FREE_DAILY
  const freeUsedToday = usage?.used ?? 0
  const creditBalance = credit?.balance ?? 0
  const freeRemaining = Math.max(0, cap - freeUsedToday)
  return {
    freeDaily: cap,
    freeUsedToday,
    freeRemaining,
    creditBalance,
    remaining: freeRemaining + creditBalance,
    blocked: freeRemaining + creditBalance <= 0,
  }
}

export type ConsumeResult = {
  ok: boolean
  source: "free" | "credit" | "none"
  /** true when the team just ran out (free + credits both 0) or is nearly out. */
  warn: boolean
  quota: AgentQuota
}

/** Spend one AI unit for a team: the free daily allowance first, then a purchased
 * credit. The credit decrement is race-safe (`WHERE balance > 0`, so it can never go
 * negative — that's real money). The free counter may overshoot by a hair under heavy
 * concurrency, which is fine (free units cost nothing). Returns ok:false when both are
 * exhausted — the caller hard-stops and tells the user they're out for the day. */
export async function consumeAiUnit(env: Env, teamId: string): Promise<ConsumeResult> {
  const now = new Date().toISOString()
  const period = today()
  const usage = await env.DB.prepare(
    "SELECT used FROM agent_usage WHERE team_id = ? AND period = ?"
  )
    .bind(teamId, period)
    .first<{ used: number }>()
  const freeUsed = usage?.used ?? 0

  const cap = Number(env.AGENT_FREE_DAILY) || FREE_DAILY
  if (freeUsed < cap) {
    await env.DB.prepare(
      `INSERT INTO agent_usage (team_id, period, used, updated_at) VALUES (?, ?, 1, ?)
       ON CONFLICT(team_id, period) DO UPDATE SET used = used + 1, updated_at = ?`
    )
      .bind(teamId, period, now, now)
      .run()
    const quota = await getQuota(env, teamId)
    return { ok: true, source: "free", warn: quota.remaining === 0, quota }
  }

  const res = await env.DB.prepare(
    "UPDATE agent_credits SET balance = balance - 1, updated_at = ? WHERE team_id = ? AND balance > 0"
  )
    .bind(now, teamId)
    .run()
  if ((res.meta.changes ?? 0) === 0) {
    return { ok: false, source: "none", warn: true, quota: await getQuota(env, teamId) }
  }
  const quota = await getQuota(env, teamId)
  return { ok: true, source: "credit", warn: quota.creditBalance <= 3, quota }
}

/** Owner/admin top-up: add credits to a team's balance (idempotent insert/accumulate).
 * Returns the new balance. Real payment integration will call this same path later. */
export async function grantCredits(env: Env, teamId: string, amount: number): Promise<number> {
  const now = new Date().toISOString()
  await env.DB.prepare(
    `INSERT INTO agent_credits (team_id, balance, lifetime_granted, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(team_id) DO UPDATE SET balance = balance + ?, lifetime_granted = lifetime_granted + ?, updated_at = ?`
  )
    .bind(teamId, amount, amount, now, amount, amount, now)
    .run()
  const row = await env.DB.prepare("SELECT balance FROM agent_credits WHERE team_id = ?")
    .bind(teamId)
    .first<{ balance: number }>()
  return row?.balance ?? 0
}
