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
vi.mock("../../../shared/workers/realtime", () => ({
  publishChange: vi.fn().mockResolvedValue(undefined),
}))

import { changeMemberRole, removeMember } from "../src/lib/members"
import { createInvite } from "../src/lib/invites"
import { acceptInvite, listReceivedInvites } from "../src/lib/teams"

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
    created_at TEXT NOT NULL, updated_at TEXT, deactivated_at TEXT, UNIQUE(team_id, user_id));
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, first_name TEXT, last_name TEXT, image_url TEXT);`)
  const insMember = db.prepare(
    "INSERT INTO team_members (id, team_id, user_id, role_id, created_at) VALUES (?, 'T', ?, ?, '2026-01-01')"
  )
  // membership() now joins users for the activity-naming snapshot.
  const insUser = db.prepare(
    "INSERT OR IGNORE INTO users (id, email, first_name, last_name) VALUES (?, ?, ?, ?)"
  )
  for (const r of rows) {
    insMember.run(r.id, r.user, r.role)
    insUser.run(r.user, `${r.user.toLowerCase()}@x.com`, r.user, null)
  }
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

describe("acceptInvite / listReceivedInvites against a real SQLite database", () => {
  const invitee = { id: "U", email: "invitee@x.com", name: "Invitee" }
  function setup() {
    const db = new DatabaseSync(":memory:")
    db.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, current_team_id TEXT, updated_at TEXT);
      CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, logo_url TEXT, db_status TEXT NOT NULL DEFAULT 'ready', deactivated_at TEXT, created_at TEXT);
      CREATE TABLE team_members (id TEXT PRIMARY KEY, team_id TEXT, user_id TEXT, role_id TEXT, created_at TEXT, creator_id TEXT, creator_email TEXT, creator_name TEXT, updated_at TEXT, deactivated_at TEXT, UNIQUE(team_id, user_id));
      CREATE TABLE invite_index (id TEXT PRIMARY KEY, email TEXT NOT NULL, team_id TEXT NOT NULL, invite_row_id TEXT NOT NULL, role_id TEXT NOT NULL, expires_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL);
      INSERT INTO users (id, email) VALUES ('U', 'invitee@x.com');
      INSERT INTO teams (id, name, db_status, created_at) VALUES ('T1', 'Acme', 'ready', '2026-01-01');`)
    return db
  }
  const addInvite = (
    db: DatabaseSync,
    o: { id: string; email?: string; status?: string; expires?: string; team?: string }
  ) =>
    db
      .prepare(
        "INSERT INTO invite_index (id, email, team_id, invite_row_id, role_id, expires_at, status, created_at) VALUES (?, ?, ?, ?, 'ROLE', ?, ?, '2026-01-01')"
      )
      .run(o.id, o.email ?? "invitee@x.com", o.team ?? "T1", o.id, o.expires ?? "2030-01-01", o.status ?? "pending")
  const members = (db: DatabaseSync) =>
    (db.prepare("SELECT COUNT(*) AS n FROM team_members WHERE team_id='T1' AND user_id='U'").get() as { n: number }).n

  it("joins + switches when the caller accepts their own pending invite", async () => {
    const db = setup()
    addInvite(db, { id: "inv1" })
    const env = { DB: makeD1(db), REALTIME: {} } as never
    expect(await acceptInvite(env, invitee, "inv1")).toBe("T1")
    expect(members(db)).toBe(1)
    expect((db.prepare("SELECT status s FROM invite_index WHERE id='inv1'").get() as { s: string }).s).toBe("accepted")
    expect((db.prepare("SELECT current_team_id c FROM users WHERE id='U'").get() as { c: string }).c).toBe("T1")
  })

  it("refuses an invite addressed to a different email (no join, invite untouched)", async () => {
    const db = setup()
    addInvite(db, { id: "inv2", email: "someone-else@x.com" })
    const env = { DB: makeD1(db), REALTIME: {} } as never
    expect(await acceptInvite(env, invitee, "inv2")).toBeNull()
    expect(members(db)).toBe(0)
    expect((db.prepare("SELECT status s FROM invite_index WHERE id='inv2'").get() as { s: string }).s).toBe("pending")
  })

  it("refuses an expired invite", async () => {
    const db = setup()
    addInvite(db, { id: "inv3", expires: "2000-01-01" })
    const env = { DB: makeD1(db), REALTIME: {} } as never
    expect(await acceptInvite(env, invitee, "inv3")).toBeNull()
    expect(members(db)).toBe(0)
  })

  it("is idempotent: a second accept is a no-op, never a double-join", async () => {
    const db = setup()
    addInvite(db, { id: "inv4" })
    const env = { DB: makeD1(db), REALTIME: {} } as never
    expect(await acceptInvite(env, invitee, "inv4")).toBe("T1")
    expect(await acceptInvite(env, invitee, "inv4")).toBeNull() // already accepted
    expect(members(db)).toBe(1) // not two
  })

  it("re-activates + re-roles a previously-removed member (deactivate-not-delete)", async () => {
    const db = setup()
    // They were on the team before and got removed: row soft-deactivated, old role.
    db.prepare(
      "INSERT INTO team_members (id, team_id, user_id, role_id, created_at, deactivated_at) VALUES ('old', 'T1', 'U', 'OLDROLE', '2026-01-01', '2026-01-02')"
    ).run()
    addInvite(db, { id: "inv5" }) // role 'ROLE'
    const env = { DB: makeD1(db), REALTIME: {} } as never
    expect(await acceptInvite(env, invitee, "inv5")).toBe("T1")
    const row = db
      .prepare("SELECT role_id r, deactivated_at d FROM team_members WHERE team_id='T1' AND user_id='U'")
      .get() as { r: string; d: string | null }
    expect(row.d).toBeNull() // reactivated, not a dead deactivated row
    expect(row.r).toBe("ROLE") // re-roled to the invited role
    expect(members(db)).toBe(1) // upserted the existing row, not a duplicate
  })

  it("listReceivedInvites returns only pending, unexpired invites to a live team for that email", async () => {
    const db = setup()
    db.prepare("INSERT INTO teams (id, name, db_status, created_at) VALUES ('T3','Gamma','creating','2026-01-03')").run()
    addInvite(db, { id: "p1" }) // valid
    addInvite(db, { id: "p2", expires: "2000-01-01" }) // expired
    addInvite(db, { id: "p3", status: "accepted" }) // not pending
    addInvite(db, { id: "p4", email: "other@x.com" }) // not me
    addInvite(db, { id: "p5", team: "T3" }) // team not ready
    const env = { DB: makeD1(db) } as never
    const list = await listReceivedInvites(env, "invitee@x.com")
    expect(list.map((i) => i.id)).toEqual(["p1"])
    expect(list[0].teamName).toBe("Acme")
  })
})
