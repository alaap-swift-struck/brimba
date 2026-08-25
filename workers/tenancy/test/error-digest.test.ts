// THE NIGHTLY ERROR DIGEST — the first thing in this base that tells a PERSON
// something is wrong.
//
// Everything else here records. Recording is not alerting: `error_logs` has had
// a resolve workflow and ninety days of history for months, in a table nobody
// opens, on a screen nobody visits at 3am.
//
// Two properties carry the whole feature, and they are in tension, which is why
// they are tested together:
//
//   1. SILENCE IS THE ALL-CLEAR. A clean night sends nothing. A digest that
//      mails "0 errors" every night trains its only reader to delete it unread,
//      and the night it matters it is deleted unread too.
//
//   2. WHICH MAKES A SILENT FAILURE TO SEND THE WORST POSSIBLE BUG. Auth's
//      /internal/send-email answers a clean 200 with `{ sent: false }` when
//      RESEND_API_KEY is unset, and the old `send()` discarded its response
//      entirely. An unconfigured mailer would then look EXACTLY like a healthy
//      system — the precise failure this feature exists to prevent.
//
// Run against real SQLite (D1 is SQLite), so the numbered parameters, the
// CASE-based split of one window into two, and the string-comparison-as-time-
// comparison on an ISO column are all exercised for real rather than assumed.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { recordWorkerError } = vi.hoisted(() => ({ recordWorkerError: vi.fn() }))
vi.mock("../../../shared/workers/error-log", () => ({
  recordWorkerError,
  logError: vi.fn(),
}))

const { buildErrorDigest } = await import("../src/lib/error-digest")

/** A D1Database-shaped adapter backed by a real node:sqlite database. */
function makeD1(db: DatabaseSync) {
  const wrap = (sql: string, args: unknown[]) => ({
    first: async () => db.prepare(sql).get(...(args as [])) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...(args as [])) }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...(args as [])).changes) } }),
  })
  return {
    prepare: (sql: string) => ({ bind: (...args: unknown[]) => wrap(sql, args), ...wrap(sql, []) }),
  }
}

const HOUR = 3_600_000
/** `n` hours ago, as the ISO string the `at` column actually stores. */
const ago = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString()
/** One of this worker's source files, read off disk. */
const readSource = (...parts: string[]) =>
  readFileSync(join(__dirname, "..", ...parts), "utf8")

function freshDb() {
  const db = new DatabaseSync(":memory:")
  db.exec(`
    CREATE TABLE error_logs (
      id TEXT PRIMARY KEY, at TEXT NOT NULL, source TEXT NOT NULL, place TEXT NOT NULL,
      message TEXT NOT NULL, stack TEXT, team_id TEXT, user_id TEXT, url TEXT,
      status TEXT NOT NULL DEFAULT 'open', resolved_at TEXT, resolution_note TEXT);
    CREATE TABLE cron_runs (job TEXT PRIMARY KEY, last_run_at TEXT, cursor TEXT);
  `)
  return db
}

let seq = 0
function addError(
  db: DatabaseSync,
  o: { source: string; place: string; hoursAgo: number; message?: string; status?: string }
) {
  db.prepare(
    "INSERT INTO error_logs (id, at, source, place, message, status) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(
    `e${seq++}`,
    ago(o.hoursAgo),
    o.source,
    o.place,
    o.message ?? "something went wrong",
    o.status ?? "open"
  )
}

/** The cron says it finished `hoursAgo` hours ago. Omit for a first-ever run. */
function heartbeat(db: DatabaseSync, hoursAgo?: number) {
  if (hoursAgo === undefined) return
  db.prepare("INSERT INTO cron_runs (job, last_run_at) VALUES ('tenancy-nightly', ?)").run(
    ago(hoursAgo)
  )
}

const envOf = (db: DatabaseSync) => ({ DB: makeD1(db), OPS: makeD1(db) }) as never

beforeEach(() => recordWorkerError.mockReset())

describe("a clean night sends NOTHING", () => {
  it("returns null when the window is empty — the absence of the email IS the all-clear", async () => {
    const db = freshDb()
    heartbeat(db, 24)
    expect(
      await buildErrorDigest(envOf(db)),
      "an empty window must not produce a mail; a nightly 'all clear' trains its reader to ignore it"
    ).toBeNull()
  })

  it("returns null when everything is OLD — a quiet week is not news every night", async () => {
    const db = freshDb()
    heartbeat(db, 24)
    // Inside the 7-day comparison window, but nothing at all last night.
    addError(db, { source: "auth", place: "POST /api/auth/verify", hoursAgo: 100 })
    addError(db, { source: "auth", place: "POST /api/auth/verify", hoursAgo: 120 })
    expect(
      await buildErrorDigest(envOf(db)),
      "a signature that fired four days ago and has been quiet since is history, not an alert"
    ).toBeNull()
  })

  it("ignores errors somebody already RESOLVED", async () => {
    const db = freshDb()
    heartbeat(db, 24)
    for (let i = 0; i < 5; i++)
      addError(db, { source: "content", place: "GET /api/help", hoursAgo: 3, status: "resolved" })
    expect(
      await buildErrorDigest(envOf(db)),
      "re-reporting what has been dealt with is how a digest becomes noise"
    ).toBeNull()
  })
})

describe("a night with errors", () => {
  it("reports a brand-NEW signature", async () => {
    const db = freshDb()
    heartbeat(db, 24)
    addError(db, {
      source: "tenancy",
      place: "POST /api/tenancy/members/role",
      hoursAgo: 2,
      message: "Cannot read properties of undefined",
    })
    const digest = await buildErrorDigest(envOf(db))
    expect(digest, "a new failure overnight must produce a mail").not.toBeNull()
    expect(digest!.subject).toMatch(/1 new/)
    expect(digest!.text).toMatch(/NEW tenancy · POST \/api\/tenancy\/members\/role/)
    expect(digest!.text, "the operator needs the message, not just a count").toMatch(
      /Cannot read properties of undefined/
    )
  })

  it("calls a SPIKE a spike — the same signature, suddenly much worse", async () => {
    const db = freshDb()
    heartbeat(db, 24)
    // One a day for the six prior days => avg_prior = 1.0 …
    for (let d = 1; d <= 6; d++)
      addError(db, { source: "data-ops", place: "POST /api/agent/chat", hoursAgo: 24 * d + 6 })
    // … then nine last night. 9 > 3×1.0 and 9 >= 5.
    for (let i = 0; i < 9; i++)
      addError(db, { source: "data-ops", place: "POST /api/agent/chat", hoursAgo: 4 })

    const digest = await buildErrorDigest(envOf(db))
    expect(digest).not.toBeNull()
    expect(digest!.subject).toMatch(/1 spiking/)
    expect(digest!.text).toMatch(/SPIKE data-ops · POST \/api\/agent\/chat — 9 in 24h/)
    expect(digest!.text, "the comparison is the point — show what normal looks like").toMatch(
      /usually 1\.0\/day/
    )
  })

  it("does NOT call a busy-but-steady signature a spike", async () => {
    const db = freshDb()
    heartbeat(db, 24)
    // Ten a day for six days (avg 10/day), twelve last night. Higher, not a spike.
    for (let d = 1; d <= 6; d++)
      for (let i = 0; i < 10; i++)
        addError(db, { source: "gateway", place: "GET /media/learning", hoursAgo: 24 * d + 6 })
    for (let i = 0; i < 12; i++)
      addError(db, { source: "gateway", place: "GET /media/learning", hoursAgo: 4 })

    const digest = await buildErrorDigest(envOf(db))
    expect(digest, "it still happened, so it is still listed").not.toBeNull()
    expect(
      digest!.text,
      "12 against a 10/day average is a normal night — calling it a spike is how an alarm gets muted"
    ).not.toMatch(/SPIKE/)
    expect(digest!.subject).not.toMatch(/spiking/)
  })

  it("does not let a tiny ratio trip the alarm — a spike needs a FLOOR too", async () => {
    const db = freshDb()
    heartbeat(db, 24)
    // avg_prior = 1/6 ≈ 0.17, and 4 last night is >3× that — but 4 < 5.
    addError(db, { source: "auth", place: "GET /api/auth/me", hoursAgo: 60 })
    for (let i = 0; i < 4; i++)
      addError(db, { source: "auth", place: "GET /api/auth/me", hoursAgo: 3 })

    const digest = await buildErrorDigest(envOf(db))
    expect(digest).not.toBeNull()
    expect(
      digest!.text,
      "one error yesterday and four today is noise, not a spike — the >=5 floor is what makes the ratio safe"
    ).not.toMatch(/SPIKE/)
  })

  it("groups many copies of one bug into ONE line", async () => {
    const db = freshDb()
    heartbeat(db, 24)
    for (let i = 0; i < 12; i++)
      addError(db, { source: "content", place: "POST /api/content/help", hoursAgo: 5 })
    const digest = await buildErrorDigest(envOf(db))
    expect(
      (digest!.text.match(/POST \/api\/content\/help/g) ?? []).length,
      "twelve rows of one signature must read as one line, or the digest is just the table again"
    ).toBe(1)
    expect(digest!.text).toMatch(/12 in 24h/)
  })
})

describe("the cron heartbeat", () => {
  it("records an error when the job MISSED a night", async () => {
    const db = freshDb()
    heartbeat(db, 50) // more than 26 hours ago
    await buildErrorDigest(envOf(db))
    expect(
      recordWorkerError,
      "a cron that stops firing raises nothing and looks exactly like a quiet night"
    ).toHaveBeenCalledTimes(1)
    expect(recordWorkerError.mock.calls[0][2]).toBe("cron/heartbeat")
  })

  it("stays quiet on a normal run, including the drift a nightly job really has", async () => {
    const db = freshDb()
    heartbeat(db, 25) // 24h + an hour of drift is NOT a missed night
    await buildErrorDigest(envOf(db))
    expect(
      recordWorkerError,
      "an alarm that cries wolf on ordinary schedule drift is an alarm that gets muted"
    ).not.toHaveBeenCalled()
  })

  it("does NOT alarm on a first-ever run, when there is no heartbeat at all", async () => {
    const db = freshDb()
    heartbeat(db, undefined)
    await buildErrorDigest(envOf(db))
    expect(
      recordWorkerError,
      "'I have never run before' is not evidence that anything is broken — a fresh environment must not open with a false alarm"
    ).not.toHaveBeenCalled()
  })

  it("puts the missed night into the SAME digest that reports it", async () => {
    // The check runs BEFORE the digest query on purpose: the error it records is
    // picked up by that query and mailed the same night. Alarm and delivery in
    // one pass, rather than a row that waits 24 hours for the next digest.
    const db = freshDb()
    heartbeat(db, 50)
    // The real recordWorkerError writes the row; the mock does not, so stand in
    // for it to prove the ORDER is right rather than the mock's behaviour.
    recordWorkerError.mockImplementation(async () => {
      addError(db, { source: "tenancy", place: "cron/heartbeat", hoursAgo: 0 })
    })
    const digest = await buildErrorDigest(envOf(db))
    expect(digest, "a missed night must itself produce the mail").not.toBeNull()
    expect(digest!.text).toMatch(/NEW tenancy · cron\/heartbeat/)
  })
})

describe("the 7-day window", () => {
  it("ignores anything older than the comparison window entirely", async () => {
    const db = freshDb()
    heartbeat(db, 24)
    // A signature that was enormous nine days ago and fired 5 times last night.
    for (let i = 0; i < 500; i++)
      addError(db, { source: "auth", place: "POST /api/auth/login", hoursAgo: 9 * 24 })
    for (let i = 0; i < 5; i++)
      addError(db, { source: "auth", place: "POST /api/auth/login", hoursAgo: 2 })

    const digest = await buildErrorDigest(envOf(db))
    expect(
      digest,
      "history outside the window must not suppress a report inside it — 500 rows nine days ago are not last week's average"
    ).not.toBeNull()
    // And it reads as NEW, which is the honest label: the window is the memory,
    // so a signature absent from all seven days IS new as far as anyone can see.
    // The count is last night's five, never the 500 that fell outside.
    expect(digest!.text).toMatch(/NEW auth · POST \/api\/auth\/login — 5 in 24h/)
    expect(digest!.text, "the buried 500 must not leak into the count").not.toMatch(/50[05] in 24h/)
  })

  it("treats a signature first seen INSIDE the window but before last night as not-new", async () => {
    const db = freshDb()
    heartbeat(db, 24)
    addError(db, { source: "mcp", place: "POST /mcp", hoursAgo: 3 * 24 })
    addError(db, { source: "mcp", place: "POST /mcp", hoursAgo: 6 })
    const digest = await buildErrorDigest(envOf(db))
    expect(digest!.text, "it existed before tonight, so it is not new").not.toMatch(/NEW mcp/)
    expect(digest!.subject).not.toMatch(/new/)
  })
})

describe("the digest is safe to put in an email", () => {
  it("escapes a crash message — an error message is attacker-shaped text", async () => {
    const db = freshDb()
    heartbeat(db, 24)
    addError(db, {
      source: "web",
      place: "render",
      hoursAgo: 2,
      message: `<script>alert('x')</script>`,
    })
    const digest = await buildErrorDigest(envOf(db))
    expect(
      digest!.html,
      "an unescaped crash message in an ops email is a stored-XSS delivered to the one person who can act on it"
    ).not.toContain("<script>")
    expect(digest!.html).toContain("&lt;script&gt;")
  })

  it("caps the sample so one enormous message cannot become the email", async () => {
    const db = freshDb()
    heartbeat(db, 24)
    addError(db, { source: "web", place: "render", hoursAgo: 2, message: "x".repeat(5_000) })
    const digest = await buildErrorDigest(envOf(db))
    expect((digest!.text.match(/x+/)?.[0].length ?? 0)).toBeLessThanOrEqual(160)
  })
})

describe("the delivery contract", () => {
  const notify = readSource("src", "lib", "notify.ts")
  const cron = readSource("src", "index.ts")

  it("READS the send response instead of discarding it", () => {
    // THE BUG THIS FEATURE COULD MOST EASILY HAVE SHIPPED WITH. `send()` used to
    // `await callService(...)` and throw the answer away, while auth returns a
    // clean 200 with `{ sent: false }` when RESEND_API_KEY is unset.
    expect(notify, "the mail seam must answer whether the mail actually went").toMatch(
      /sent\s*===\s*true/
    )
    expect(notify).toMatch(/export async function sendMail/)
  })

  it("has ONE door out to a mailbox, not two", () => {
    // The branded-notice helper must delegate to the same seam rather than
    // growing a second copy of the internal-key call that can drift from it.
    expect(
      (notify.match(/callService\(/g) ?? []).length,
      "a second callService here is a second place that knows the internal key and the timeout"
    ).toBe(1)
  })

  it("records an error when the digest could not be DELIVERED", () => {
    const scheduled = cron.slice(cron.indexOf("async scheduled"))
    expect(
      scheduled,
      "an undeliverable digest must be loud: silence already means 'clean night', so a broken mailer would be indistinguishable from a healthy system"
    ).toMatch(/sendMail\(env, to, digest\.subject, digest\)/)
    expect(scheduled).toMatch(/cron\/nightly-digest/)
    // …and the same for having nowhere to send it at all.
    expect(scheduled).toMatch(/OPS_ALERT_EMAIL/)
  })

  it("files a nightly failure under cron/nightly, not under the size check", () => {
    // `place` is the signature the digest groups by, so a wrong one sends
    // whoever reads it to the wrong subsystem — every night, consistently.
    const scheduled = cron.slice(cron.indexOf("async scheduled"))
    expect(scheduled).toMatch(/"cron\/nightly"/)
    expect(scheduled, "the one try now covers far more than the size check").not.toMatch(
      /"cron\/size-check"/
    )
  })

  it("builds the digest BEFORE writing tonight's heartbeat", () => {
    // Or the digest reads the heartbeat it just wrote and can never notice a
    // missed night.
    const scheduled = cron.slice(cron.indexOf("async scheduled"))
    expect(scheduled.indexOf("buildErrorDigest")).toBeLessThan(
      scheduled.indexOf("noteCronHeartbeat")
    )
  })
})

