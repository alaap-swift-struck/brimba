// AN UNCAPPED CREATE DOOR IS A RESOURCE-CREATION DOOR. Every team provisions a
// REAL database, so anyone who can sign up could otherwise mint them in a loop
// until the platform's database quota is gone — no permission is exceeded, no
// tenant is breached, and the whole product stops working anyway.
//
// The cap counts teams the caller CREATED, never teams they belong to: being
// invited to twenty teams costs nobody a database, and counting memberships
// would punish the wrong person.

import { beforeEach, describe, expect, it, vi } from "vitest"

import { MAX_TEAMS_PER_USER } from "../../../shared/workers/limits"

const created: string[] = []
vi.mock("../src/context", () => ({
  whoAmI: vi.fn(async () => ({ id: "u1", email: "a@b.c", firstName: "A", onboardingComplete: true })),
  toActor: (u: { id: string }) => ({ id: u.id, email: "a@b.c", name: "A" }),
  teamContext: vi.fn(),
}))
vi.mock("../src/lib/teams", () => ({
  createTeam: vi.fn(async (_e: unknown, _a: unknown, name: string) => created.push(name)),
  d1Config: () => ({}),
  getActiveContext: async () => ({ ok: true }),
  listMyTeams: async () => [],
  acceptPendingInvites: async () => 0,
  switchTeam: async () => true,
  getTeamMeta: async () => ({}),
  updateTeamDetails: async () => undefined,
}))

const { createNamedTeam } = await import("../src/routes/team")

/** env whose `teams` table reports `existing` rows created by this user. */
const envWith = (existing: number, override?: string) =>
  ({
    MAX_TEAMS_PER_USER: override,
    DB: {
      prepare: (sql: string) => ({
        bind: () => ({
          first: async () => (sql.includes("COUNT(*)") ? { n: existing } : null),
        }),
      }),
    },
  }) as never

/** `createNamedTeam` now takes the route's `ctx` so the team-creation ping leaves
 * after the response. Nothing here reaches a publish (the teams lib is mocked
 * whole), so this only has to exist. */
const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext

const post = () =>
  new Request("https://x/api/tenancy/teams", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Another team" }),
  })

beforeEach(() => (created.length = 0))

describe("team creation is capped per user", () => {
  it("lets an ordinary user create teams below the cap", async () => {
    const res = await createNamedTeam(post(), envWith(MAX_TEAMS_PER_USER - 1), CTX)
    expect(res.status).toBe(200)
    expect(created, "the team was actually provisioned").toHaveLength(1)
  })

  it("refuses AT the cap — cleanly, and without provisioning a database", async () => {
    const res = await createNamedTeam(post(), envWith(MAX_TEAMS_PER_USER), CTX)
    expect(res.status).toBe(403)
    expect((await res.json()) as { error: string }).toMatchObject({ error: "team_limit" })
    expect(created, "no database may be provisioned by a refused request").toHaveLength(0)
  })

  it("counts teams the caller CREATED, not teams they belong to", async () => {
    let asked = ""
    const env = {
      DB: { prepare: (sql: string) => ((asked = sql), { bind: () => ({ first: async () => ({ n: 0 }) }) }) },
    } as never
    await createNamedTeam(post(), env, CTX)
    expect(asked, "the count must be by creator_id").toContain("creator_id")
    expect(asked, "…never by membership").not.toContain("team_members")
  })

  // "Create five, switch them off, repeat" would otherwise be an unbounded
  // database generator wearing a cap: a deactivated team still HAS its database.
  it("a deactivated team still counts against the cap", async () => {
    let asked = ""
    const env = {
      DB: { prepare: (sql: string) => ((asked = sql), { bind: () => ({ first: async () => ({ n: 0 }) }) }) },
    } as never
    await createNamedTeam(post(), env, CTX)
    expect(asked, "the count must NOT filter deactivated teams — their databases still exist").not.toMatch(
      /deactivated|is_active|archived/i
    )
  })

  it("the owner can raise it per environment", async () => {
    const res = await createNamedTeam(post(), envWith(MAX_TEAMS_PER_USER, String(MAX_TEAMS_PER_USER + 5)), CTX)
    expect(res.status, "an override above the count must allow the create").toBe(200)
  })

  it("an override of ZERO means zero — it does not fall back to the default", async () => {
    const res = await createNamedTeam(post(), envWith(0, "0"), CTX)
    expect(res.status, "MAX_TEAMS_PER_USER=0 must refuse, not silently allow 5").toBe(403)
    expect(created).toHaveLength(0)
  })
})
