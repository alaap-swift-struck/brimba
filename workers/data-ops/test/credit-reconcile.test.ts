// A confirmed command must stay ONE reconciling history entry. A command that pauses for a
// yes/no confirm spans two turns (propose + confirm); if the confirm-continuation wrote its
// own "(continued)" usage-log row, the history read as 1 + 1 while the balance dropped by 2
// (the reconciliation bug a teammate reported: balance -3, history 1+1). The confirm turn
// must instead FOLD its units into the propose row. These source-scans lock that in — no DB,
// like publish-seam / import-idempotency.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { runChat } from "../src/lib/agent"
import { getTool, requiresConfirm } from "../src/lib/tools"
import type { Env } from "../src/env"

const credits = readFileSync(join(__dirname, "..", "src", "lib", "credits.ts"), "utf8")
const agent = readFileSync(join(__dirname, "..", "src", "lib", "agent.ts"), "utf8")

const confirmBody = (() => {
  const start = agent.indexOf("export async function confirmAndRun")
  const next = agent.indexOf("\nexport ", start + 1)
  return agent.slice(start, next === -1 ? undefined : next)
})()

describe("credit history reconciles with the balance (one row per command)", () => {
  it("foldUsageIntoLatest folds units into the latest command row (an UPDATE, not a new row)", () => {
    const start = credits.indexOf("export async function foldUsageIntoLatest")
    expect(start, "foldUsageIntoLatest must exist").toBeGreaterThan(-1)
    const body = credits.slice(start, credits.indexOf("\nexport ", start + 1))
    // It UPDATEs the newest row for this team+actor (the propose row) — not a fresh INSERT.
    expect(/UPDATE agent_usage_log/.test(body), "must UPDATE the existing row").toBe(true)
    expect(/ORDER BY created_at DESC LIMIT 1/.test(body), "must target the LATEST row").toBe(true)
    expect(/credits = credits \+ \?/.test(body), "must ADD the units, not overwrite").toBe(true)
    // Mixing pools flips the row to 'mixed' (free row + a credit unit → mixed).
    expect(/'mixed'/.test(body)).toBe(true)
  })

  it("confirmAndRun FOLDS its units instead of writing a separate '(continued)' row", () => {
    expect(confirmBody, "confirmAndRun must exist").toBeTruthy()
    // The confirm continuation folds (both the failure wrap-up path and the resumed loop).
    expect(/foldUsageIntoLatest/.test(confirmBody), "confirm turn must fold its units").toBe(true)
    expect(/fold: true/.test(confirmBody), "the resumed loop runs in fold mode").toBe(true)
    // It must NOT write its own row via logUsage — that was the split "(continued)" row.
    expect(/\blogUsage\(/.test(confirmBody), "confirm path must fold, never logUsage a new row").toBe(false)
  })

  // A row is TITLED by what the assistant DID (the WRITE actions run), falling back to the
  // user's prompt for a read-only / no-action turn — so a clarifying reply reads as the
  // question, not "List roles" (the credit-log-clarity feedback). And a fold APPENDS the
  // confirm's actions to the command's title — NEVER replaces: one command can pause for
  // confirmation more than once, and replacing left a 10-credit turn titled by its last
  // step alone (C3).
  it("the usage row is titled by the ACTION taken, and the fold APPENDS (never replaces)", () => {
    // agent.ts derives the title from the tally's actions, falling back to the prompt.
    expect(/function usageTitle/.test(agent), "usageTitle must exist").toBe(true)
    expect(/tally\.actions\.push/.test(agent), "each ran WRITE must be recorded as an action").toBe(true)
    const start = credits.indexOf("export async function foldUsageIntoLatest")
    const body = credits.slice(start, credits.indexOf("\nexport ", start + 1))
    // APPEND semantics: the new actions concatenate onto the existing summary…
    expect(/summary \|\| ' · ' \|\|/.test(body), "fold must APPEND to the title (summary || ' · ' || …)").toBe(true)
    // …and a bare replacement must not sneak back in.
    expect(/summary = \?,/.test(body), "fold must never REPLACE the title outright").toBe(false)
    // Folding real actions makes the row team-visible ('action' kind).
    expect(/kind = CASE/.test(body), "fold must mark the row an action row").toBe(true)
  })

  // C3: the row records WHICH kind of title it carries — an action (team-visible)
  // or the author's prompt (their own; back-filled NULL rows stay private).
  it("visibility rides the recorded kind — actions team-visible, prompts author-only", () => {
    const start = credits.indexOf("export async function readUsageLog")
    const body = credits.slice(start, credits.indexOf("\nexport ", start + 1) === -1 ? undefined : credits.indexOf("\nexport ", start + 1))
    expect(/kind = 'action' OR actor_id = \?/.test(body), "an action row's summary is team-visible; a prompt row's is the author's own").toBe(true)
    expect(/\bkind\b/.test(credits.slice(credits.indexOf("export async function logUsage"))), "logUsage must record the kind").toBe(true)
  })

  // A READ is not an action the user "did", so it must not title the row — only writes are
  // pushed; a read-only clarifying turn then falls back to the prompt (the question).
  it("only WRITES title the row — a read-only turn isn't logged as 'List roles'", () => {
    expect(
      /if \(t\?\.write\)\s*\{[\s\S]*?tally\.actions\.push/.test(agent),
      "tally.actions.push must be guarded by the tool being a write"
    ).toBe(true)
  })
})

// A turn that changed NOTHING the user wanted — a refused action (inviting an existing
// member) or a model hiccup — must not cost a credit. The turn meters up front (before the
// outcome is known), then hands the units back on the failure exits when no write succeeded.
describe("credit fairness — a refused/failed turn is refunded", () => {
  it("refundAiUnits reverses BOTH pools (paid credits back, free units un-counted)", () => {
    const start = credits.indexOf("export async function refundAiUnits")
    expect(start, "refundAiUnits must exist").toBeGreaterThan(-1)
    const body = credits.slice(start, credits.indexOf("\nexport ", start + 1))
    expect(/balance = balance \+ \?/.test(body), "returns paid credits to the balance").toBe(true)
    expect(/used = MAX\(0, used - \?\)/.test(body), "un-counts today's free units, bounded at zero").toBe(true)
  })
})

/* ───────────────────────────────────────────────────────────────────────────────
 * THE REFUND MUST NOT ERASE THE ACCOUNT'S ONLY METER.
 *
 * What used to stand here were two source-scans asserting that the failure exits
 * CALL the refund and that it hands back everything the turn metered. That is a
 * description of the hole, not of the intent, so both went green on a real defect:
 *
 *   • `failureWrapUp` is a THIRTEENTH model call, and it was unmetered;
 *   • `refundIfNothingDone` handed back every unit the turn had metered — and the
 *     column it subtracts from, `agent_usage.used`, is the exact column the
 *     account-wide spend alarm sums (`checkAccountAiSpend`,
 *     workers/tenancy/src/lib/sharding.ts).
 *
 * Together: a turn whose actions were all refused bought real inference, charged
 * nothing, and erased its own trace from the one meter built to see it — repeatably.
 *
 * Which function is called is not the invariant. What the two counters READ
 * afterwards is. So this runs the REAL `runChat` against a scripted model, a fake
 * team-database door and an in-memory core database, and reads them:
 *
 *   1. the person is not charged for the actions they were refused, and
 *   2. the account-wide meter still shows that the reply bought model calls.
 *
 * The fake database understands only the handful of statements `credits.ts` sends;
 * the source-scan above is what keeps it honest if that SQL ever changes.
 * ─────────────────────────────────────────────────────────────────────────────── */

const TEAM = "01TEAMTEAMTEAMTEAMTEAMTE"
const USER = "01USERUSERUSERUSERUSERUS"

/** The numbers this whole file is about: today's free counter (what the account-wide
 * alarm sums), the purchased balance (real money), and `claimed` — the running total of
 * units the meter ever handed out, which a refund cannot reduce. `claimed` is the
 * test's own bookkeeping, not a column: it is how many MODEL CALLS the app paid for,
 * and it is the number that must match how many it actually made. */
type Meter = { used: number; balance: number; claimed: number }

/** Just enough of D1's `prepare().bind().run()/first()` to run the credit meter.
 * Every branch mirrors one statement in `credits.ts` — nothing else is a database. */
function coreDb(m: Meter) {
  const changed = (n: number) => ({ meta: { changes: n } })
  return {
    prepare(sql: string) {
      return {
        bind(...a: (string | number | null)[]) {
          return {
            async run() {
              // The claim: create the row at 1, or +1 only while still under the cap.
              if (/INSERT INTO agent_usage \(/.test(sql)) {
                const cap = Number(a[a.length - 1])
                if (m.used < cap) return (m.used += 1), (m.claimed += 1), changed(1)
                return changed(0)
              }
              if (/UPDATE agent_credits SET balance = balance - 1/.test(sql)) {
                if (m.balance > 0) return (m.balance -= 1), (m.claimed += 1), changed(1)
                return changed(0)
              }
              if (/UPDATE agent_credits SET balance = balance \+ \?/.test(sql))
                return (m.balance += Number(a[0])), changed(1)
              if (/UPDATE agent_usage SET used = MAX\(0, used - \?\)/.test(sql))
                return (m.used = Math.max(0, m.used - Number(a[0]))), changed(1)
              return changed(1) // the usage-LOG write; not what this asserts
            },
            async first() {
              if (/SELECT used FROM agent_usage/.test(sql)) return { used: m.used }
              if (/SELECT balance FROM agent_credits/.test(sql)) return { balance: m.balance }
              return null
            },
          }
        },
      }
    },
  }
}

/** One scripted model turn: some text, and the tools it decides to call. */
type Turn = { text?: string; calls?: { name: string; input: Record<string, unknown> }[] }

/** Stand in for the two things `runChat` reaches over the network: the Anthropic
 * Messages API and the D1 REST door. Returns the model-call tally — the count that
 * says how much inference the turn actually bought. */
function stubNetwork(script: Turn[]) {
  const real = globalThis.fetch
  const modelCalls: string[] = []
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const href = String(url)
    if (href.startsWith("https://api.anthropic.com")) {
      modelCalls.push(href)
      const turn = script.shift()
      if (!turn) throw new Error("the model was called more times than the test scripted")
      const content: unknown[] = []
      if (turn.text) content.push({ type: "text", text: turn.text })
      for (const [i, c] of (turn.calls ?? []).entries())
        content.push({ type: "tool_use", id: `tu_${i}`, name: c.name, input: c.input })
      return new Response(JSON.stringify({ content, usage: {} }), { status: 200 })
    }
    if (href.startsWith("https://api.cloudflare.com")) {
      const sql = String((JSON.parse(String(init?.body ?? "{}")) as { sql?: string }).sql ?? "")
      // The only read the agent loop makes of the team DB that must answer: the
      // ownership check in front of listMessages.
      const results = /SELECT creator_id FROM agent_threads/.test(sql) ? [{ creator_id: USER }] : []
      return new Response(JSON.stringify({ success: true, result: [{ results }] }), { status: 200 })
    }
    throw new Error(`unexpected fetch to ${href}`)
  }) as typeof fetch
  return { modelCalls, restore: () => void (globalThis.fetch = real) }
}

/** A gated door that refuses anything matching `refuse` with a 403 (exactly what a
 * missing permission looks like to `executeTool`) and answers everything else. */
function door(refuse: RegExp) {
  return {
    async fetch(url: string) {
      return refuse.test(url)
        ? new Response(JSON.stringify({ message: "Your role doesn't include that." }), { status: 403 })
        : new Response(JSON.stringify({ roles: [] }), { status: 200 })
    },
  }
}

function agentEnv(m: Meter, freeDaily: string) {
  return {
    DB: coreDb(m),
    AUTH: door(/$^/),
    REALTIME: door(/$^/),
    CONTENT: door(/$^/),
    // Renaming the team is refused; listing roles is not.
    TENANCY: door(/teams\/update/),
    CF_ACCOUNT_ID: "acct",
    AI: {},
    ANTHROPIC_API_KEY: "test-key",
    AGENT_FREE_DAILY: freeDaily,
  } as unknown as Env
}

/** One user turn: the model reads, then attempts a write it is refused, then the
 * wrap-up explains. Two tool steps + one wrap-up = THREE real model calls. */
async function refusedTurn(env: Env): Promise<number> {
  const net = stubNetwork([
    { text: "Let me check the roles first.", calls: [{ name: "list_roles", input: {} }] },
    { calls: [{ name: "update_team", input: { name: "Acme" } }] },
    { text: "Your role doesn't include editing team details — an admin can do it." },
  ])
  try {
    await runChat(
      env,
      new Request("https://internal/api/data-ops/agent/chat", { headers: { Cookie: "s=1" } }),
      { accountId: "acct", apiToken: "tok" },
      { userId: USER, teamId: TEAM, roleId: "01ROLE", databaseId: "db", movedModules: 0 },
      { id: USER, email: "sam@x.com", name: "Sam" },
      { message: "rename the team to Acme", source: "web" }
    )
    return net.modelCalls.length
  } finally {
    net.restore()
  }
}

describe("a refused turn: free to the person, visible to the account", () => {
  it("the two tools this turn uses are what the test assumes they are", () => {
    // If either changes shape the scenario below stops meaning what it says.
    expect(getTool("list_roles")!.write, "list_roles is a read").toBe(false)
    expect(getTool("update_team")!.write, "update_team is a write").toBe(true)
    expect(requiresConfirm(getTool("update_team")!), "…that runs without a confirm panel").toBe(false)
  })

  it("meters every model call it makes — the wrap-up included", async () => {
    const meter: Meter = { used: 0, balance: 0, claimed: 0 }
    const calls = await refusedTurn(agentEnv(meter, "25"))

    expect(calls, "the reply really made three model calls (two steps + the wrap-up)").toBe(3)
    // The wrap-up is a model call like any other, so it must claim a unit like any other.
    // Left unmetered it was invisible twice over: the team's quota never saw it, and
    // neither did the account — while it is the single most expensive call of the reply,
    // carrying the whole conversation and all its tool results.
    expect(meter.claimed, "every model call this reply made must have claimed a unit").toBe(calls)
  })

  it("refunds the refused ACTIONS but never the model call that explained them", async () => {
    const meter: Meter = { used: 0, balance: 0, claimed: 0 }
    await refusedTurn(agentEnv(meter, "25"))

    // The fairness half: the two refused STEPS come back, so the turn does not cost the
    // person their day's requests for work they were not allowed to do.
    // The visibility half: it does not cost ZERO either — `agent_usage.used` is the only
    // column `checkAccountAiSpend` can see, and three model calls were bought.
    expect(
      meter.used,
      "a wholly-refused turn must leave exactly the wrap-up's unit on the account meter"
    ).toBe(1)
    expect(meter.balance, "and must never touch purchased credits").toBe(0)
  })

  it("cannot be repeated for free inference — the meter climbs, turn after turn", async () => {
    const meter: Meter = { used: 0, balance: 0, claimed: 0 }
    const env = agentEnv(meter, "25")
    for (let i = 0; i < 5; i++) await refusedTurn(env)
    // Five refused turns = fifteen model calls. A meter still reading zero would make
    // forcing a refusal an unbounded way to buy inference the account never sees; a
    // meter that climbs is what makes the daily cap the real ceiling on a refusal loop.
    expect(meter.used, "each refused turn must cost one unit that is never handed back").toBe(5)
  })
})
