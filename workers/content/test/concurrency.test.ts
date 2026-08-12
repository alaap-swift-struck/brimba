// THE TWO SILENT RACES.
//
// CONCURRENCY.md makes INVARIANTS race-safe — keep ≥1 admin, never-negative
// balance, one pending invite. Those are rules the app knows it has. These two
// are not rules, they are assumptions, and breaking them produces no error at
// all:
//
//   a retried request does the work TWICE (the team gets two of something)
//   a second save overwrites a first one it never saw (an edit vanishes)
//
// Both are fixed by the same principle the ruleset already uses — the condition
// rides the write — so what this file guards is that the condition is actually
// THERE. A missing predicate does not fail; it just quietly stops protecting.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
  IDEMPOTENCY_HEADER,
  MAX_REPLAY_BYTES,
  versionPredicate,
} from "../../../shared/workers/concurrency"

const root = join(__dirname, "..", "..", "..")
const seam = readFileSync(join(root, "shared", "workers", "concurrency.ts"), "utf8")
const WORKERS_WITH_ROUTES = ["tenancy", "content", "data-ops"]

describe("the version predicate", () => {
  it("is EMPTY when the caller states no expectation", () => {
    // A client that has not adopted this must behave exactly as it did before —
    // otherwise adopting a safety feature would be a breaking change for every
    // existing caller, which is how safety features end up reverted.
    expect(versionPredicate(undefined)).toBe("")
    expect(versionPredicate(null)).toBe("")
    expect(versionPredicate("")).toBe("")
  })

  it("escapes the version instead of pasting it into SQL", () => {
    // The value arrives in a request body. It reaches a statement that is built
    // by string concatenation (the REST door forbids params in scripts), so the
    // ONE thing that must never happen is it arriving unescaped.
    const evil = versionPredicate("2026-01-01' OR '1'='1")
    expect(evil).not.toContain("OR '1'='1'")
    expect(evil).toContain("''")
  })

  it("COALESCES, so a never-edited row still has a version to guard on", () => {
    // A fresh row has a NULL updated_at. Without the fallback the FIRST
    // concurrent edit of a new record — exactly when two people are most likely
    // to be looking at the same new thing — is the one edit that is unprotected.
    expect(versionPredicate("2026-08-11T00:00:00.000Z")).toBe(
      " AND COALESCE(updated_at, created_at) = '2026-08-11T00:00:00.000Z'"
    )
  })
})

describe("every record update carries the guard", () => {
  // Named explicitly rather than discovered: a lib that stops being listed here
  // is a deliberate edit someone has to make, whereas a discovery rule that
  // stops matching goes quiet on its own.
  const GUARDED = [
    ["content", "learning.ts", "updateLearning"],
    ["content", "help.ts", "updateTicket"],
    ["tenancy", "selectable.ts", "updateSelectable"],
    ["tenancy", "roles.ts", "updateRole"],
  ] as const

  for (const [worker, file, fn] of GUARDED) {
    it(`${fn} refuses to land on a row that moved`, () => {
      const src = readFileSync(join(root, "workers", worker, "src", "lib", file), "utf8")
      const body = src.slice(src.indexOf(`export async function ${fn}`))
      const upToWrite = body.slice(0, body.indexOf("assertNotConflicted") + 120)

      expect(
        upToWrite.includes("${versionPredicate(expectedVersion)}"),
        `${fn}'s UPDATE must carry the version predicate, or a stale save silently wins`
      ).toBe(true)
      expect(
        /RETURNING id/.test(upToWrite),
        `${fn} must read back whether the row moved — without RETURNING there is nothing to check`
      ).toBe(true)
      expect(
        /assertNotConflicted\(landed\.length, expectedVersion\)/.test(upToWrite),
        `${fn} must ACT on the result: a predicate whose outcome is discarded protects nothing`
      ).toBe(true)
    })
  }
})

describe("idempotency", () => {
  it("costs nothing when the client sends no key", () => {
    // The pass-through is the reason this is affordable at all. If it ever
    // starts querying unconditionally, every mutation in the app pays a
    // round-trip to protect the few that are actually retried.
    const fn = seam.slice(seam.indexOf("export async function withIdempotency"))
    const beforeAnyQuery = fn.slice(0, fn.indexOf("db\n") + 3)
    expect(
      /if \(!key\) return run\(\)/.test(beforeAnyQuery),
      "the no-key path must return before touching the database"
    ).toBe(true)
  })

  it("claims the key by INSERT, so two simultaneous retries cannot both proceed", () => {
    // This is the whole mutual exclusion. A SELECT-then-INSERT would let both
    // retries see "not claimed" and both go on to do the work — the exact bug
    // this exists to prevent, reintroduced inside the fix.
    expect(seam).toMatch(/INSERT INTO idempotency_keys \(key, owner, route, created_at\)/)
    expect(
      /SELECT[\s\S]{0,80}FROM idempotency_keys[\s\S]{0,400}INSERT INTO idempotency_keys/.test(seam),
      "the claim must not be preceded by a check — that is a race, not a guard"
    ).toBe(false)
  })

  it("refuses a key that belongs to someone else or to another action", () => {
    expect(seam).toMatch(/prior\.owner !== owner \|\| prior\.route !== route/)
    expect(seam).toContain("idempotency_key_reused")
  })

  it("refuses rather than replays while the first attempt is still running", () => {
    // status IS NULL means the winner has not finished. Returning its (absent)
    // body would tell the caller the work succeeded when it may still fail.
    expect(seam).toMatch(/prior\.status === null/)
    expect(seam).toContain("in_progress")
  })

  it("releases the claim when the work FAILED, so a retry is a real retry", () => {
    const fn = seam.slice(seam.indexOf("let response: Response"))
    expect(
      /catch[\s\S]{0,400}DELETE FROM idempotency_keys WHERE key = \?/.test(fn),
      "holding a claim after a failure turns one transient error into a permanent one for that key"
    ).toBe(true)
  })

  it("never stores an unbounded response body", () => {
    expect(MAX_REPLAY_BYTES).toBeLessThanOrEqual(64 * 1024)
    expect(seam).toMatch(/text\.length <= MAX_REPLAY_BYTES \? text : null/)
  })

  it("stores a DIGEST of the session, never the session itself", () => {
    // The owner column ties a key to its claimer. If it held the raw cookie,
    // this table would become a second place session tokens live.
    expect(seam).toMatch(/crypto\.subtle\.digest\("SHA-256"/)
    const owner = seam.slice(seam.indexOf("async function ownerOf"))
    expect(
      owner.slice(0, owner.indexOf("}")).includes("return cookie"),
      "the raw cookie must never be what gets stored"
    ).toBe(false)
  })

  it("is wired to every worker that dispatches mutations — and ONLY to mutations", () => {
    for (const w of WORKERS_WITH_ROUTES) {
      const src = readFileSync(join(root, "workers", w, "src", "index.ts"), "utf8")
      expect(
        src.includes("withIdempotency(request, env.DB, route, () => def.handler(request, env))"),
        `${w} dispatches mutations without the retry seam`
      ).toBe(true)
      expect(
        src.includes('if (def.kind !== "mutation") return await def.handler(request, env)'),
        `${w} must leave reads and housekeeping on the untouched path`
      ).toBe(true)
    }
  })

  it("is swept, because it is the fastest-growing table the base has", () => {
    const retention = readFileSync(join(root, "shared", "workers", "retention.ts"), "utf8")
    expect(retention).toContain('table: "idempotency_keys"')
    const rule = retention.slice(retention.indexOf('table: "idempotency_keys"'))
    const days = Number(/days: (\d+)/.exec(rule)?.[1])
    expect(days, "a retry window measured in days, not a history").toBeGreaterThan(0)
    expect(days).toBeLessThanOrEqual(7)
  })

  it("names the header the client actually sends", () => {
    const client = readFileSync(join(root, "web", "lib", "api.ts"), "utf8")
    expect(client).toContain(`"${IDEMPOTENCY_HEADER}": key`)
  })
})

describe("the client side of the retry key", () => {
  const shell = readFileSync(join(root, "web", "components", "form-shell.tsx"), "utf8")

  it("keeps the key when a submit FAILS and drops it when one SUCCEEDS", () => {
    // Both halves matter and they fail in opposite directions. Minting a fresh
    // key on retry protects nothing; reusing one after success replays the last
    // save and silently discards the new edit.
    const fn = shell.slice(shell.indexOf("async function handleSubmit"))
    expect(fn).toMatch(/if \(!submitKey\.current\) submitKey\.current = newSubmitKey\(\)/)
    const afterAwait = fn.slice(fn.indexOf("await withSubmitKey"))
    expect(
      /submitKey\.current = ""/.test(afterAwait),
      "the key must be cleared AFTER a successful submit — before it, and a retry gets a new key"
    ).toBe(true)
  })

  it("carries the key on writes only", () => {
    const client = readFileSync(join(root, "web", "lib", "api.ts"), "utf8")
    expect(client).toMatch(/init\?\.method && init\.method !== "GET" \? currentSubmitKey\(\) : null/)
  })
})

describe("the machine surface inherits the retry protection", () => {
  it("MCP passes an inbound Idempotency-Key through to the door", () => {
    // An agent loop or an integration with automatic retries re-sends a failed
    // POST without a person deciding to — so a MACHINE caller is the likeliest
    // retrier there is. If the key stops at the MCP front desk, the machine
    // surface becomes the one place the protection does not reach.
    const mcp = readFileSync(join(root, "workers", "mcp", "src", "index.ts"), "utf8")
    expect(mcp).toMatch(/const idempotencyKey = request\.headers\.get\(IDEMPOTENCY_HEADER\)/)
    // `[,)]` rather than a closing paren: the key must be READ and PASSED in its
      // place, which is the invariant. Pinning the exact argument COUNT made this
      // fail when the trace id was added alongside it — a true assertion breaking
      // on an unrelated change is a test that eventually gets edited to shut it up,
      // which is how a real lock quietly stops locking.
      expect(mcp).toMatch(/forwardTool\(env, tool, input, cookie, idempotencyKey[,)]/)

    const door = readFileSync(join(root, "shared", "workers", "http.ts"), "utf8")
    expect(
      /if \(opts\.idempotencyKey\) headers\["Idempotency-Key"\] = opts\.idempotencyKey/.test(door),
      "the shared forward seam must actually SET the header, not just accept it"
    ).toBe(true)
  })

  it("the team record carries the version guard too", () => {
    // Native binding rather than the REST door, so the outcome is meta.changes
    // instead of RETURNING — same guarantee, different dialect.
    const teams = readFileSync(join(root, "workers", "tenancy", "src", "lib", "teams.ts"), "utf8")
    const fn = teams.slice(teams.indexOf("export async function updateTeamDetails"))
    expect(fn).toMatch(/expectedVersion \? " AND COALESCE\(updated_at, created_at\) = \?" : ""/)
    expect(
      /assertNotConflicted\(res\.meta\.changes, expectedVersion\)/.test(fn),
      "the predicate's outcome must be acted on, or two admins renaming at once still overwrite each other"
    ).toBe(true)
  })
})
