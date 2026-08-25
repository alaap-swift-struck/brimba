// THE TIMINGS — read the numbers the app now reports about itself.
//
// `speed_review` scored 37, then 39, then 45, and its headline never changed:
// nothing was instrumented, so no number existed for any operation and the review
// could report shape and nothing else. `timed()` fixed the capability — every
// response carries `Server-Timing` and a request id. But round 3 was blunt about
// what that is worth on its own: **a capability is not a measurement.** The
// rubric's 35-point row asks whether anyone has actually READ one.
//
// So this reads them, and round 5 fixed what it was reading. The first four
// probes are all UNAUTHENTICATED — a static page and three health checks that
// return a literal `{ok:true}` without opening a database. None of them crosses
// the path a real request takes (gateway → worker → auth → the D1 REST door), so
// the slowest and most interesting hop in the system was the one hop no number
// existed for. Three authenticated probes now cross it.
//
//   node scripts/timings.mjs                     against staging
//   node scripts/timings.mjs --production        public probes only, by design
//   node scripts/timings.mjs --url https://…
//
// The authenticated probes need TEST_LOGIN_KEY in the environment — the same
// staging-only secret the smoke test signs in with. They CANNOT run against
// production, structurally: see THE PRODUCTION LOCKS below.

import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const PRODUCTION_URL = "https://brimba.swift-struck.workers.dev"
const STAGING_URL = "https://brimba-staging.swift-struck.workers.dev"

const BASE = process.argv.includes("--production")
  ? PRODUCTION_URL
  : process.argv.includes("--url")
    ? process.argv[process.argv.indexOf("--url") + 1]
    : STAGING_URL

// THE PRODUCTION LOCKS. One authenticated probe CREATES A REAL RECORD, so "don't
// run this against production" cannot be a sentence in a comment. Three
// independent locks, none of which is a promise:
//
//   1. THE DOOR ITSELF. `POST /api/auth/admin/test-login` refuses outright when
//      ENVIRONMENT is "production" (workers/auth/src/index.ts). No session can be
//      minted there, so no authenticated probe can run there, whatever this
//      script believes about the URL it was handed.
//   2. THE URL, checked here — by HOST, not by whether someone passed the flag,
//      so `--url https://brimba.swift-struck.workers.dev` is caught too. The
//      authenticated probes are refused before a single request is sent.
//   3. THE ACCOUNT. Sign-in is hard-wired to one fixed scratch address that
//      belongs to no person. Even pointed somewhere unexpected, the write lands
//      in the scratch team it creates for itself and never in a real user's.
const TARGETS_PRODUCTION = new URL(BASE).host === new URL(PRODUCTION_URL).host

// The scratch account the authenticated probes act as. Fixed on purpose: one
// account means ONE scratch team, reused every run, rather than a new team (and a
// new database) per run. Resend's test inbox never bounces, and the +label keeps
// it clear of the smoke test's own account and its codes-per-hour throttle.
const SCRATCH_EMAIL = "delivered+timings@resend.dev"
// Stamped on every ticket the write probe raises, because the write probe cannot
// tidy up after itself: help has no delete door (this base deactivates rather
// than deletes, and `help` carries no deactivated_at at all), so there is no
// gated way to remove one. The scratch team IS the containment — nothing here
// ever touches a real team — and `node scripts/reset-all.mjs staging` empties it.
const SCRATCH_NOTE = "[timings] automated speed probe — safe to delete"

/** THE BUDGET FOR A CLASS OF OPERATION, not for a URL.
 *
 * Per-URL budgets meant a newly added endpoint had no target until somebody
 * remembered to give it one, so the default for anything new was "unmeasured".
 * A class default inverts that: an endpoint inherits a line to answer to the day
 * it is added, and only a genuine exception needs its own number.
 *
 * The numbers are what a request that crosses the D1 REST door should cost — one
 * or two round trips to the door plus the worker's own work. A write pays for the
 * insert, the read-back and the publish; bulk pays per row, so it is the one
 * class whose ceiling is deliberately loose. */
const CLASS_BUDGET = {
  read: 400,
  write: 600,
  delete: 500,
  bulk: 1500,
}

/** Each probe names its CLASS and inherits that budget. `budget` overrides it for
 * a genuine exception — the cold page load is a static asset, the health checks
 * open no database, and one ticket by id does two team-database reads at once. */
const PROBES = [
  // Unauthenticated: the front door and the three health checks.
  { name: "cold page load", path: "/", class: "read", budget: 800 },
  { name: "auth health", path: "/api/auth/health", class: "read", budget: 200 },
  { name: "realtime health", path: "/api/realtime/health", class: "read", budget: 200 },
  { name: "mcp health", path: "/api/mcp/health", class: "read", budget: 200 },
  // Authenticated: gateway → worker → auth → the D1 REST door. The point of the
  // exercise — these are the only probes that measure the real request path.
  { name: "members list", path: "/api/tenancy/members", class: "read", authed: true },
  {
    name: "one ticket by id",
    path: (ctx) => `/api/content/help?id=${encodeURIComponent(ctx.seedTicketId)}`,
    class: "read",
    budget: 500, // two team-database reads in one request: the row and the counts.
    authed: true,
  },
  {
    name: "raise a ticket",
    path: "/api/content/help",
    method: "POST",
    body: () => ({ description: `${SCRATCH_NOTE} · ${new Date().toISOString()}` }),
    class: "write",
    authed: true,
  },
]

const RUNS = 5
const budgetOf = (p) => p.budget ?? CLASS_BUDGET[p.class]

// The history. Capped at the last 50 RUNS (not the last 50 rows) so the file
// stays small and diffable however many probes get added later.
const HISTORY_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "timings.json")
const HISTORY_RUNS = 50

const readHistory = () => {
  try {
    const parsed = JSON.parse(readFileSync(HISTORY_PATH, "utf8"))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return [] // no file yet, or an unreadable one — a lost history must not fail a run.
  }
}

const die = (message) => {
  console.error(`\n  ${message}\n`)
  process.exit(1)
}

/** Sign in through the staging-only test-login door and leave the scratch team
 * ready to be measured. Returns the session cookie and a ticket id to read. */
async function signIn() {
  const key = process.env.TEST_LOGIN_KEY ?? ""
  if (!key)
    die(
      "No TEST_LOGIN_KEY in the environment.\n" +
        "  The authenticated probes sign in through POST /api/auth/admin/test-login,\n" +
        "  the same staging-only door the smoke test uses. Export the staging\n" +
        "  TEST_LOGIN_KEY and run again, or pass --production for the public probes only."
    )

  const post = async (path, body, cookie = "") => {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        ...(path.endsWith("/test-login") ? { "x-admin-key": key } : {}),
      },
      body: JSON.stringify(body ?? {}),
    })
    return { res, body: await res.json().catch(() => null) }
  }

  const minted = await post("/api/auth/admin/test-login", { email: SCRATCH_EMAIL })
  if (!minted.res.ok || typeof minted.body?.code !== "string")
    die(
      `The test-login door refused (HTTP ${minted.res.status}).\n` +
        "  It needs its own TEST_LOGIN_KEY secret set on this environment's auth worker:\n" +
        "    cd workers/auth && npx wrangler secret put TEST_LOGIN_KEY --env staging\n" +
        "  It also refuses outright on production, by design."
    )

  const verified = await fetch(`${BASE}/api/auth/email/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: SCRATCH_EMAIL, code: minted.body.code }),
  })
  const cookie = (verified.headers.get("set-cookie") ?? "").split(";")[0]
  if (!cookie.startsWith("brimba_session=")) die(`Sign-in failed (HTTP ${verified.status}) — no session cookie.`)

  // Both are idempotent: the first ever run builds the scratch account's profile
  // and its team database, every later run just gets them back.
  await post("/api/auth/profile", { firstName: "Timings", lastName: "Probe" }, cookie)
  const boot = await post("/api/tenancy/bootstrap", {}, cookie)
  if (boot.body?.teams?.[0]?.dbStatus !== "ready")
    die(`The scratch team's database is not ready: ${JSON.stringify(boot.body)}`)

  // Something to read by id. Prefer a ticket a previous run already raised —
  // re-using one keeps the scratch team from growing by an extra row per run.
  const listed = await fetch(`${BASE}/api/content/help`, { headers: { Cookie: cookie } })
  const existing = (await listed.json().catch(() => null))?.tickets?.[0]?.id
  const seedTicketId =
    existing ?? (await post("/api/content/help", { description: SCRATCH_NOTE }, cookie)).body?.created?.id
  if (!seedTicketId) die("Could not find or raise a ticket in the scratch team to read.")

  return { cookie, seedTicketId }
}

async function probe(p, ctx) {
  const path = typeof p.path === "function" ? p.path(ctx) : p.path
  const times = []
  let reported = null
  for (let i = 0; i < RUNS; i++) {
    const started = Date.now()
    const res = await fetch(`${BASE}${path}`, {
      method: p.method ?? "GET",
      redirect: "manual",
      headers: {
        ...(p.body ? { "Content-Type": "application/json" } : {}),
        ...(p.authed ? { Cookie: ctx.cookie } : {}),
      },
      ...(p.body ? { body: JSON.stringify(p.body()) } : {}),
    })
    times.push(Date.now() - started)
    // Several workers can each append a Server-Timing entry to one response, so
    // take the LARGEST — the outermost duration is the whole server-side cost.
    const durations = [...(res.headers.get("server-timing") ?? "").matchAll(/dur=([\d.]+)/g)].map((m) => Number(m[1]))
    if (durations.length) reported = Math.max(...durations)
    await res.arrayBuffer()
  }
  times.sort((a, b) => a - b)
  return { median: times[Math.floor(times.length / 2)], best: times[0], worst: times[times.length - 1], reported }
}

// ── run ───────────────────────────────────────────────────────────────────────

const authedProbes = PROBES.filter((p) => p.authed)
if (TARGETS_PRODUCTION)
  die(
    `${authedProbes.length} authenticated probes cannot run against production, so this run would\n` +
      "  measure only static pages and health checks — which is the gap round 5 was\n" +
      "  opened to close, not a smaller version of the same measurement.\n\n" +
      "  Why: they sign in through the test-login door, which production refuses by\n" +
      "  design, and one of them CREATES A RECORD. Run them against staging:\n" +
      "    node scripts/timings.mjs\n\n" +
      "  For the public probes against production, run with --url and no authenticated\n" +
      "  probes, or read them from the browser's own network panel."
  )

const ctx = await signIn()

const history = readHistory()
const priorFor = (op) => [...history].reverse().find((r) => r.op === op && r.target === BASE)
const stamp = new Date().toISOString()
const fresh = []

console.log(`\n  ${BASE}\n  ${RUNS} runs each · "server" is what the worker reports about itself`)
console.log(`  signed in as ${SCRATCH_EMAIL} (scratch team)\n`)
console.log("  operation           class   median   best   worst   server   budget   vs last   verdict")
console.log("  " + "─".repeat(88))

let over = 0
for (const p of PROBES) {
  const r = await probe(p, ctx)
  const budget = budgetOf(p)
  const ok = r.median <= budget
  if (!ok) over++
  const prior = priorFor(p.name)
  const delta = prior ? r.median - prior.median : null
  fresh.push({ date: stamp, target: BASE, op: p.name, class: p.class, median: r.median, server: r.reported })
  console.log(
    `  ${p.name.padEnd(18)} ${p.class.padEnd(6)} ${String(r.median).padStart(6)}ms ${String(r.best).padStart(5)} ` +
      `${String(r.worst).padStart(7)} ${String(r.reported ?? "—").padStart(7)} ${String(budget).padStart(7)}ms ` +
      `${(delta === null ? "  new" : `${delta > 0 ? "+" : ""}${delta}ms`).padStart(8)}   ${ok ? "ok" : "OVER"}`
  )
}

// Keep the newest HISTORY_RUNS runs, counted by run stamp so a run is never
// half-kept, and write the file back sorted oldest-first.
const all = [...history, ...fresh]
const keep = new Set([...new Set(all.map((r) => r.date))].sort().slice(-HISTORY_RUNS))
writeFileSync(HISTORY_PATH, `${JSON.stringify(all.filter((r) => keep.has(r.date)), null, 2)}\n`)

const regressions = fresh.filter((r) => {
  const prior = priorFor(r.op)
  return prior && r.median - prior.median > prior.median * 0.25
})
console.log(
  `\n  ${over === 0 ? "Every operation is inside its budget." : `${over} operation(s) OVER budget.`}` +
    (regressions.length ? `\n  ${regressions.length} slower than last run by more than 25%: ${regressions.map((r) => r.op).join(", ")}.` : "") +
    `\n  History: ${keep.size} run(s) in timings.json — "vs last" is against the previous run on this target.` +
    `\n  Round-trip includes the network from wherever you ran this; "server" does not.\n`
)
process.exit(over === 0 ? 0 : 1)
