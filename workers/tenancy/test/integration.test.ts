// REAL-DATABASE integration tests for the tenancy write paths. Unlike the
// mock-based unit tests, these run the ACTUAL SQL — the atomic last-admin writes
// and the partial unique invite index — against a real in-memory SQLite via
// Node's built-in node:sqlite. D1 *is* SQLite, so this exercises the real
// semantics with no Cloudflare infra and no extra dependency.
import { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

// The team-DB reads (admin-role lookup, role existence) go through d1Query (the
// REST door) — mock those; the global-DB writes hit our real-SQLite env.DB.
const { d1Query } = vi.hoisted(() => ({ d1Query: vi.fn() }))
vi.mock("../../../shared/workers/d1-rest", () => ({ d1Query }))
vi.mock("../../../shared/workers/activity", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}))

import { changeMemberRole, removeMember } from "../src/lib/members"
import { createInvite } from "../src/lib/invites"

const cfg = { accountId: "a", apiToken: "t" } as never
const actor = { id: "ME", email: "me@x.com", name: "Me" }
const guard = { userId: "ME", teamId: "T", roleId: "EDITOR", databaseId: "db" }

/** A D1Database-shaped adapter backed by a real node:sqlite database. */
function makeD1(db: DatabaseSync) {
  const wrap = (sql: string, args: unknown[]) => ({
    first: async () => (db.prepare(sql).get(...(args as [])) ?? null),
    all: async () => ({ results: db.prepare(sql).all(...(args as [])) }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...(args as [])).changes) } }),
  })
  return {
    prepare: (sql: string) => ({ bind: (...args: unknown[]) => wrap(sql, args), ...wrap(sql, []) }),
  } as never
}

function seedMembers(db: DatabaseSync, rows: { id: string; user: string; role: string }[]) {
  db.exec(`CREATE TABLE team_members (
    id TEXT PRIMARY KEY, team_id TEXT NOT NULL, user_id TEXT NOT NULL, role_id TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT, deactivated_at TEXT, UNIQUE(team_id, user_id));`)
  const ins = db.prepare(
    "INSERT INTO team_members (id, team_id, user_id, role_id, created_at) VALUES (?, 'T', ?, ?, '2026-01-01')"
  )
  for (const r of rows) ins.run(r.id, r.user, r.role)
}

const adminCount = (db: DatabaseSync) =>
  (db.prepare("SELECT COUNT(*) AS n FROM team_members WHERE role_id='ADMIN' AND deactivated_at IS NULL").get() as { n: number }).n

beforeEach(() => {
  d1Query.mockReset()
  d1Query.mockImplementation(async (_c: unknown, _db: unknown, sql: string, params?: string[]) => {
    if (sql.includes("is_default = 1")) return [{ id: "ADMIN" }]
    if (sql.includes("WHERE id = ?")) return [{ id: params?.[0], title: "Some role" }]
    return []
  })
})

describe("removeMember against a real SQLite database", () => {
  it("removes an admin while another remains, then blocks removing the last one", async () => {
    const db = new DatabaseSync(":memory:")
    seedMembers(db, [
      { id: "m_me", user: "ME", role: "EDITOR" },
      { id: "m_b", user: "B", role: "ADMIN" },
      { id: "m_c", user: "C", role: "ADMIN" },
    ])
    const env = { DB: makeD1(db) } as never

    await removeMember(env, cfg, guard, actor, "B")
    expect(adminCount(db)).toBe(1)
    expect((db.prepare("SELECT deactivated_at d FROM team_members WHERE user_id='B'").get() as { d: string | null }).d).not.toBeNull()

    await expect(removeMember(env, cfg, guard, actor, "C")).rejects.toMatchObject({ code: "last_admin" })
    expect(adminCount(db)).toBe(1) // C is untouched — the team keeps its admin
  })
})

describe("changeMemberRole against a real SQLite database", () => {
  it("blocks demoting the last admin (the DB row is unchanged)", async () => {
    const db = new DatabaseSync(":memory:")
    seedMembers(db, [
      { id: "m_me", user: "ME", role: "EDITOR" },
      { id: "m_b", user: "B", role: "ADMIN" },
    ])
    const env = { DB: makeD1(db) } as never
    await expect(changeMemberRole(env, cfg, guard, actor, "B", "VIEWER")).rejects.toMatchObject({ code: "last_admin" })
    expect((db.prepare("SELECT role_id r FROM team_members WHERE user_id='B'").get() as { r: string }).r).toBe("ADMIN")
  })

  it("writes a normal role change", async () => {
    const db = new DatabaseSync(":memory:")
    seedMembers(db, [
      { id: "m_me", user: "ME", role: "ADMIN" },
      { id: "m_b", user: "B", role: "ADMIN" },
      { id: "m_c", user: "C", role: "VIEWER" },
    ])
    const env = { DB: makeD1(db) } as never
    await changeMemberRole(env, cfg, guard, actor, "C", "EDITOR")
    expect((db.prepare("SELECT role_id r FROM team_members WHERE user_id='C'").get() as { r: string }).r).toBe("EDITOR")
  })
})

describe("invite_index partial unique index (db/core/0006)", () => {
  it("rejects a second pending invite for the same team+email, but lets non-pending coexist", () => {
    const db = new DatabaseSync(":memory:")
    db.exec(`CREATE TABLE invite_index (
      id TEXT PRIMARY KEY, email TEXT NOT NULL, team_id TEXT NOT NULL, invite_row_id TEXT NOT NULL,
      role_id TEXT NOT NULL, expires_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL);
      CREATE UNIQUE INDEX idx_invite_pending_unique ON invite_index (team_id, email) WHERE status = 'pending';`)
    const ins = (id: string, status: string) =>
      db
        .prepare("INSERT INTO invite_index (id, email, team_id, invite_row_id, role_id, expires_at, status, created_at) VALUES (?, 'a@b.com', 'T', ?, 'R', '2030', ?, '2026')")
        .run(id, id, status)

    ins("i1", "pending")
    expect(() => ins("i2", "pending")).toThrow() // duplicate pending — rejected by the index
    expect(() => ins("i3", "revoked")).not.toThrow() // a non-pending row coexists fine
    db.prepare("UPDATE invite_index SET status='revoked' WHERE id='i1'").run()
    expect(() => ins("i5", "pending")).not.toThrow() // once the original is revoked, a new pending is allowed
  })
})

describe("createInvite against a real SQLite database (end-to-end write path)", () => {
  it("creates a pending invite, then refuses a duplicate for the same email", async () => {
    const db = new DatabaseSync(":memory:")
    db.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT);
      CREATE TABLE team_members (id TEXT PRIMARY KEY, team_id TEXT, user_id TEXT, role_id TEXT, deactivated_at TEXT);
      CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT);
      CREATE TABLE invite_index (id TEXT PRIMARY KEY, email TEXT NOT NULL, team_id TEXT NOT NULL, invite_row_id TEXT NOT NULL, role_id TEXT NOT NULL, expires_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL);
      CREATE UNIQUE INDEX idx_invite_pending_unique ON invite_index (team_id, email) WHERE status = 'pending';
      INSERT INTO teams (id, name) VALUES ('T', 'Acme');`)
    const env = { DB: makeD1(db), AUTH: { fetch: async () => ({ ok: true }) }, INTERNAL_KEY: "" } as never

    await createInvite(env, cfg, guard, actor, "x@y.com", "R", "https://app")
    const pending = () =>
      (db.prepare("SELECT COUNT(*) AS n FROM invite_index WHERE status='pending'").get() as { n: number }).n
    expect(pending()).toBe(1)

    await expect(createInvite(env, cfg, guard, actor, "x@y.com", "R", "https://app")).rejects.toMatchObject({
      code: "already_invited",
    })
    expect(pending()).toBe(1) // still just one — no duplicate
  })
})
