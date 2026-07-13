// The agent quota gate (owner's credit-based model). Each team gets a FREE daily
// allowance of AI requests; beyond that it spends from a purchasable credit balance;
// out of both, the agent warns then hard-stops for the day. The agent consumes ONE
// unit per AI request (the real cost driver) at this single shared gate. Lives over
// the global core DB (agent_usage = the daily-free counter; agent_credits = the
// balance) so it works without opening a team database.

import type { AgentQuota, UsageLogRow } from "../../../../shared/types"
import type { Actor } from "../../../../shared/workers/gating"
import { ulid } from "../../../../shared/workers/id"
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

/** Give back AI units a turn metered but that accomplished NOTHING the user wanted — a
 * refused/failed action (e.g. inviting someone already on the team) or a model error. A
 * blocked action must never cost the user. Mirrors consumeAiUnit in reverse: return paid
 * CREDITS to the balance, then un-count FREE units for today (bounded at zero). Best-effort
 * — a refund hiccup must never break the turn. */
export async function refundAiUnits(
  env: Env,
  teamId: string,
  freeUnits: number,
  creditUnits: number
): Promise<void> {
  const now = new Date().toISOString()
  try {
    if (creditUnits > 0)
      await env.DB.prepare(
        "UPDATE agent_credits SET balance = balance + ?, updated_at = ? WHERE team_id = ?"
      )
        .bind(creditUnits, now, teamId)
        .run()
    if (freeUnits > 0)
      await env.DB.prepare(
        "UPDATE agent_usage SET used = MAX(0, used - ?), updated_at = ? WHERE team_id = ? AND period = ?"
      )
        .bind(freeUnits, now, teamId, today())
        .run()
  } catch {
    /* refund is best-effort — a hiccup must never break the turn the user cares about */
  }
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

/** Where a turn's AI units came from: all free, all paid credit, or a bit of each. */
export type UsageSource = "free" | "credit" | "mixed"

/** Record ONE agent turn in the usage log (the human trail, not the metering counter).
 * Best-effort by design: any error — a missing table, a write hiccup — is swallowed so a
 * logging failure can never break the turn the user actually cares about. */
export async function logUsage(
  env: Env,
  teamId: string,
  actor: Actor,
  credits: number,
  source: UsageSource,
  summary: string
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO agent_usage_log (id, team_id, actor_id, actor_name, created_at, credits, source, summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(ulid(), teamId, actor.id, actor.name, new Date().toISOString(), credits, source, summary)
      .run()
  } catch {
    /* logging is never fatal — a missing table or write error must not break the turn */
  }
}

/** Fold a confirm-continuation's units INTO the command's existing log row — the propose
 * turn's row, which is the latest for this team+actor (the UI blocks new agent input while
 * a confirm is pending, so nothing else can slip in between). This keeps ONE user command
 * as ONE history entry whose credit count reconciles with the balance, instead of a
 * cryptic separate "(continued)" row (the reconciliation bug a teammate reported: balance
 * dropped 3 but the history read as 1+1). The `source` becomes 'mixed' if the added units
 * came from a different pool than the row already had. Best-effort like `logUsage`; if the
 * propose row somehow isn't there (its best-effort write failed), it writes a fresh row so
 * the units still surface rather than vanish. */
export async function foldUsageIntoLatest(
  env: Env,
  teamId: string,
  actor: Actor,
  addCredits: number,
  addSource: UsageSource,
  title: string
): Promise<void> {
  if (addCredits <= 0) return
  try {
    // Fold the units in AND re-title the row to what the confirm actually did — so a
    // confirmed command reads "Remove Jane Doe", never the propose prompt or "(continued)".
    const res = await env.DB.prepare(
      `UPDATE agent_usage_log
         SET credits = credits + ?,
             source = CASE WHEN source = ? THEN source ELSE 'mixed' END,
             summary = ?
       WHERE id = (
         SELECT id FROM agent_usage_log
         WHERE team_id = ? AND actor_id = ? ORDER BY created_at DESC LIMIT 1
       )`
    )
      .bind(addCredits, addSource, title, teamId, actor.id)
      .run()
    // No prior row to fold into (propose log failed) → don't lose the units.
    if ((res.meta.changes ?? 0) === 0)
      await logUsage(env, teamId, actor, addCredits, addSource, title)
  } catch {
    /* best-effort — a fold failure must never break the turn */
  }
}

/** The team's usage log, newest-first (the panel's "N left today" badge opens this).
 * PRIVACY: the `summary` is the actor's own (truncated) AI prompt, so it's shown ONLY on
 * the viewer's OWN rows — a teammate sees who spent how many credits and when, but never
 * another person's prompt text. (Everything else — actor, credits, source, time — is
 * team-visible billing detail.) */
export async function readUsageLog(
  env: Env,
  teamId: string,
  viewerId: string,
  limit: number
): Promise<UsageLogRow[]> {
  const res = await env.DB.prepare(
    `SELECT id, created_at AS createdAt, actor_name AS actorName, credits, source,
            CASE WHEN actor_id = ? THEN summary ELSE NULL END AS summary
     FROM agent_usage_log WHERE team_id = ? ORDER BY created_at DESC LIMIT ?`
  )
    .bind(viewerId, teamId, limit)
    .all<UsageLogRow>()
  return res.results ?? []
}
