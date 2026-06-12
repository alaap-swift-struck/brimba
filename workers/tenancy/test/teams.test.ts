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

function envWith(db: Env["DB"]): Env {
  return {
    DB: db,
    AUTH: {} as Fetcher,
    CF_ACCOUNT_ID: "acct",
    CF_D1_TOKEN: "token",
  }
}

beforeEach(() => {
  vi.mocked(d1CreateDatabase).mockClear()
  vi.mocked(d1ExecScript).mockClear()
  vi.mocked(d1DeleteDatabase).mockClear()
  vi.mocked(d1ExecScript).mockResolvedValue(undefined)
})

describe("createTeam (the factory)", () => {
  it("creates DB, applies schema + seeds, writes membership, marks ready", async () => {
    const { db, calls } = fakeDb()
    const result = await createTeam(envWith(db), ACTOR, "Chris's team", null)

    expect(result.teamId).toHaveLength(26)
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
      createTeam(envWith(db), ACTOR, "Doomed team", null)
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
    await expect(createTeam(env, ACTOR, "X", null)).rejects.toThrow(
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
    const accepted = await acceptPendingInvites(envWith(db), ACTOR)

    expect(accepted).toBe(2)
    const sqls = calls.map((c) => c.sql)
    expect(sqls.filter((s) => s.includes("INTO team_members"))).toHaveLength(2)
    expect(sqls.filter((s) => s.includes("SET status = 'accepted'"))).toHaveLength(2)
    const current = calls.find((c) => c.sql.includes("SET current_team_id"))
    expect(current?.params[0]).toBe("team-A")
  })

  it("does nothing when there are no invites (personal team path)", async () => {
    const { db, calls } = fakeDb()
    expect(await acceptPendingInvites(envWith(db), ACTOR)).toBe(0)
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
