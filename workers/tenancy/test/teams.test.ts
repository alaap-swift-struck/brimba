// Integration tests for the team factory's orchestration — the most critical
// path in the product. Cloudflare's REST API is mocked; the core database is
// a tiny in-memory fake that records every SQL call.
import { beforeEach, describe, expect, it, vi } from "vitest"

// Mock ONLY the network functions of the data door; keep sqlString/sqlValue real.
vi.mock("../../../shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<object>()
  return {
    ...actual,
    d1CreateDatabase: vi.fn(async () => "db-new-123"),
    d1ExecScript: vi.fn(async () => {}),
    d1DeleteDatabase: vi.fn(async () => {}),
    d1Query: vi.fn(async () => []),
  }
})

import {
  d1CreateDatabase,
  d1DeleteDatabase,
  d1ExecScript,
} from "../../../shared/workers/d1-rest"
import {
  acceptPendingInvites,
  createTeam,
  listMyTeams,
} from "../src/lib/teams"
import type { Env } from "../src/env"

const ACTOR = { id: "01USER", email: "chris@x.com", name: "Chris Martin" }

/** A minimal fake D1: dispatches on SQL substrings, records every call. */
function fakeDb(handlers: { match: string; first?: unknown; all?: unknown[] }[] = []) {
  const calls: { sql: string; params: unknown[] }[] = []
  const db = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          calls.push({ sql, params })
          const h = handlers.find((h) => sql.includes(h.match))
          return {
            async run() {
              return {}
            },
            async first() {
              return h?.first ?? null
            },
            async all() {
              return { results: h?.all ?? [] }
            },
          }
        },
      }
    },
  }
  return { db: db as unknown as Env["DB"], calls }
}

/**
 * Every ping the live seam actually tried to send.
 *
 * `REALTIME: {} as Fetcher` used to stand in here, which throws on `.fetch` and
 * is swallowed by `callService` — so a publish that had been deleted outright and
 * a publish that worked looked identical from these tests. Both team-lifecycle
 * publishes now travel through `ctx.waitUntil`, which makes the difference even
 * easier to miss, so the stub records instead of exploding.
 */
const publishes: { channel: string; event: { resource: string; id?: string; op?: string } }[] = []
const REALTIME = {
  fetch: async (_url: string, init?: RequestInit) => {
    publishes.push(JSON.parse(String(init?.body ?? "{}")))
    return new Response("{}", { status: 200 })
  },
} as unknown as Fetcher

/**
 * An `ExecutionContext` stand-in that KEEPS what it is handed.
 *
 * A stub whose `waitUntil` dropped the promise would let a ping that never left
 * read as a pass — the same blindness the publish seam was rewritten to catch, one
 * layer down. `settled()` is how a test says "now let the deferred work finish".
 */
function fakeCtx() {
  const held: Promise<unknown>[] = []
  return {
    ctx: {
      waitUntil: (p: Promise<unknown>) => void held.push(p),
      passThroughOnException: () => {},
    } as unknown as ExecutionContext,
    /** How many promises were HANDED OVER rather than awaited inline. `waitUntil`
     * does not delay the start of the work — it only takes it off the response's
     * critical path — so "was it deferred?" is this count, never a timing check on
     * the ping itself. A timing check would pass for the wrong reason. */
    deferred: () => held.length,
    settled: () => Promise.all(held),
  }
}

function envWith(db: Env["DB"]): Env {
  return {
    DB: db,
    AUTH: {} as Fetcher,
    REALTIME,
    MEDIA: {} as R2Bucket,
    LEARNING_MEDIA: {} as R2Bucket,
    CF_ACCOUNT_ID: "acct",
    CF_D1_TOKEN: "token",
  }
}

beforeEach(() => {
  publishes.length = 0
  vi.mocked(d1CreateDatabase).mockClear()
  vi.mocked(d1ExecScript).mockClear()
  vi.mocked(d1DeleteDatabase).mockClear()
  vi.mocked(d1ExecScript).mockResolvedValue(undefined)
})

describe("createTeam (the factory)", () => {
  it("creates DB, applies schema + seeds, writes membership, marks ready", async () => {
    const { db, calls } = fakeDb()
    const { ctx, deferred, settled } = fakeCtx()
    const result = await createTeam(envWith(db), ACTOR, "Chris's team", null, ctx)

    expect(result.teamId).toHaveLength(26)
    // DEFERRED, NOT DROPPED. Creating a team is already the slowest thing in the
    // base — a real database, a schema, a seed — so the ping must come off the
    // response's critical path, and it must still arrive. `ctx.waitUntil` is the
    // only shape that is both; a bare call would be cancelled with the isolate.
    expect(deferred(), "the ping must be handed to waitUntil, not awaited in front of the answer").toBe(1)
    await settled()
    expect(publishes, "…and it must still be sent").toEqual([
      { channel: `user:${ACTOR.id}`, event: { resource: "teams", id: result.teamId, op: "add" } },
    ])
    expect(d1CreateDatabase).toHaveBeenCalledWith(
      expect.anything(),
      `team-${result.teamId.toLowerCase()}`
    )
    // schema migration + stamp, then the seed script
    expect(vi.mocked(d1ExecScript).mock.calls.length).toBeGreaterThanOrEqual(2)

    const sqls = calls.map((c) => c.sql)
    expect(sqls.some((s) => s.includes("INSERT INTO teams"))).toBe(true)
    expect(sqls.some((s) => s.includes("INSERT INTO team_members"))).toBe(true)
    expect(sqls.some((s) => s.includes("db_status = 'ready'"))).toBe(true)
    expect(sqls.some((s) => s.includes("SET current_team_id"))).toBe(true)

    // ordering: membership only AFTER the seed scripts succeeded
    const memberIdx = sqls.findIndex((s) => s.includes("INSERT INTO team_members"))
    const teamIdx = sqls.findIndex((s) => s.includes("INSERT INTO teams"))
    expect(memberIdx).toBeGreaterThan(teamIdx)
  })

  it("on failure: marks the team failed AND deletes the orphan database", async () => {
    vi.mocked(d1ExecScript).mockRejectedValueOnce(new Error("boom"))
    const { db, calls } = fakeDb()

    await expect(
      createTeam(envWith(db), ACTOR, "Doomed team", null, fakeCtx().ctx)
    ).rejects.toThrow("boom")

    const sqls = calls.map((c) => c.sql)
    expect(sqls.some((s) => s.includes("db_status = 'failed'"))).toBe(true)
    expect(d1DeleteDatabase).toHaveBeenCalledWith(expect.anything(), "db-new-123")
    // no membership row for a failed team
    expect(sqls.some((s) => s.includes("INSERT INTO team_members"))).toBe(false)
  })

  it("refuses to run without the cloud key", async () => {
    const { db } = fakeDb()
    const env = { ...envWith(db), CF_D1_TOKEN: undefined }
    await expect(createTeam(env, ACTOR, "X", null, fakeCtx().ctx)).rejects.toThrow(
      "cloud_key_missing"
    )
  })
})

describe("acceptPendingInvites (locked onboarding flow)", () => {
  it("joins every active invite and lands in the first team", async () => {
    const { db, calls } = fakeDb([
      {
        match: "FROM invite_index",
        all: [
          { id: "i1", team_id: "team-A", role_id: "role-1" },
          { id: "i2", team_id: "team-B", role_id: "role-2" },
        ],
      },
    ])
    const { ctx, deferred, settled } = fakeCtx()
    const accepted = await acceptPendingInvites(envWith(db), ACTOR, ctx)

    expect(accepted).toBe(2)
    const sqls = calls.map((c) => c.sql)
    expect(sqls.filter((s) => s.includes("INTO team_members"))).toHaveLength(2)
    expect(sqls.filter((s) => s.includes("SET status = 'accepted'"))).toHaveLength(2)
    const current = calls.find((c) => c.sql.includes("SET current_team_id"))
    expect(current?.params[0]).toBe("team-A")

    // Five pings — one per invite, one per team, one cross-device — and NOT ONE of
    // them in front of the answer. This is onboarding: the person is waiting on the
    // very first screen of the product, and these are Durable Object hops nothing
    // in the response depends on.
    expect(deferred(), "all five must come off onboarding's critical path").toBe(5)
    await settled()
    expect(publishes.map((p) => `${p.channel}/${p.event.resource}`)).toEqual([
      "team:team-A/invites",
      "team:team-B/invites",
      "team:team-A/members",
      "team:team-B/members",
      `user:${ACTOR.id}/teams`,
    ])
  })

  it("does nothing when there are no invites (personal team path)", async () => {
    const { db, calls } = fakeDb()
    expect(await acceptPendingInvites(envWith(db), ACTOR, fakeCtx().ctx)).toBe(0)
    expect(calls.some((c) => c.sql.includes("INTO team_members"))).toBe(false)
  })
})

describe("listMyTeams", () => {
  it("maps rows to the shared TeamSummary shape", async () => {
    const { db } = fakeDb([
      {
        match: "FROM team_members",
        all: [
          { id: "t1", name: "Chris's team", logo_url: null, db_status: "ready", role_id: "r1" },
        ],
      },
    ])
    const teams = await listMyTeams(envWith(db), "01USER")
    expect(teams).toEqual([
      { id: "t1", name: "Chris's team", logoUrl: null, dbStatus: "ready", roleId: "r1" },
    ])
  })
})
