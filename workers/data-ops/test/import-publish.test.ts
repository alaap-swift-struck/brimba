// R1 FOR THE IMPORT HISTORY — the half the publish-seam check could not see.
//
// `postBatchConfirm` was already a "mutation" that published, so the seam test was
// green: it broadcasts one coarse ping per imported MODULE (`learning`,
// `member_roles`…). What it never broadcast was the batch row itself, and the
// batch row is its own screen — `import-screen.tsx` subscribes
// `import-batches:<teamId>` for the "Past imports" list. So the run was invisible
// to every teammate, and to the runner's other devices, until somebody reloaded;
// two admins importing in parallel each saw only their own.
//
// A per-route "does it publish AT ALL" check can never catch that, because the
// answer was yes. This one names the resource, and it CALLS the handler rather
// than reading it: the ping asserted here is the real one, off the real
// `publishChange`, through the binding the worker would use in production.
//
// It also proves the DISPOSITION (R1's small print): the last ping is held open,
// and something must still be holding it when the handler answers. A bare
// `publishChange(...)` would let the response go first and the platform would
// cancel the in-flight fetch — the ping would never arrive, and the screen would
// be exactly as stale as before.
//
// WHAT DOES THE HOLDING CHANGED on 2026-08-25. It used to be the handler itself,
// which meant every importer waited on a Durable Object hop before seeing their
// own import land. It is now the RUNTIME, via `ctx.waitUntil` — the isolate is
// kept alive until the ping settles, so delivery is unchanged and the wait is
// nobody's. The test below asks the question that distinguishes all three
// dispositions rather than the one that only distinguished two: the response goes
// FIRST (it must not block), and the ping is nonetheless HELD (it must not be
// dropped). Only the fire-and-forget shape fails both halves.

import { describe, expect, it, vi } from "vitest"

const GUARD = { teamId: "team-1", userId: "user-1", databaseId: "db-1" }
const ACTOR = { id: "user-1", email: "importer@example.com", name: "Importer" }

// The gate and the batch engine are stubbed — this is about what the ROUTE
// broadcasts after a successful run, not about D1 or permissions (both have their
// own suites). `publishChange` is deliberately NOT stubbed.
vi.mock("../../../shared/workers/gating", () => ({
  GuardError: class GuardError extends Error {},
  hasRight: async () => true,
  requireRight: async () => {},
  teamContext: async () => ({ actor: ACTOR, cfg: {}, guard: GUARD }),
}))

vi.mock("../src/lib/import-batch", () => ({
  addBatchFile: vi.fn(),
  confirmBatch: vi.fn(async () => ({
    view: {},
    report: { perTarget: [], created: 3, skipped: 0, failed: 0, rejections: [] },
    modules: ["learning"],
  })),
  createBatch: vi.fn(),
  getBatchView: vi.fn(async () => ({ plan: { order: ["learning"], steps: [] } })),
  listBatchSummaries: vi.fn(),
  planBatch: vi.fn(),
  planModules: vi.fn(() => ["learning"]),
}))

import { postBatchConfirm } from "../src/routes/import"

type Ping = { channel: string; event: { resource: string; id?: string; op?: string } }

/** A REALTIME binding that records every ping. `hold` names a resource whose
 * fetch is parked until it is released, so "did the handler wait for it?" is a
 * question this test can actually ask. */
function realtimeSpy(hold?: string) {
  const pings: Ping[] = []
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const env = {
    REALTIME: {
      fetch: async (_url: string, init?: { body?: string }) => {
        const ping = JSON.parse(init?.body ?? "{}") as Ping
        pings.push(ping)
        if (hold && ping.event.resource === hold) await held
        return new Response("{}", { status: 200 })
      },
    },
  }
  return { env, pings, release }
}

/** The route `ctx`, recording what the handler hands to `waitUntil`. That list IS
 * the guarantee: the runtime keeps the isolate alive until every promise in it
 * settles, so a ping that is in there arrives whether or not the response has
 * already gone. A publish that reaches neither `await` nor here is cancelled. */
function ctxSpy() {
  const held: Promise<unknown>[] = []
  const ctx = { waitUntil: (p: Promise<unknown>) => held.push(p), passThroughOnException: () => {} }
  return { ctx: ctx as never, held }
}

function confirmRequest(batchId = "batch-9") {
  return new Request("https://data-ops/api/data-ops/import/batch/confirm", {
    method: "POST",
    body: JSON.stringify({ batchId }),
  })
}

describe("a finished import broadcasts the batch row, not only the tables it wrote", () => {
  it("pings data_import_batches on the team channel, carrying the batch id", async () => {
    const { env, pings } = realtimeSpy()
    const { ctx, held } = ctxSpy()
    const res = await postBatchConfirm(confirmRequest(), env as never, ctx)
    await Promise.all(held) // the pings now leave after the response — let them land

    expect(res.status).toBe(200)
    const batch = pings.find((p) => p.event.resource === "data_import_batches")
    expect(
      batch,
      `nothing published "data_import_batches", so the Past imports list stays stale for everyone but the runner — published: ${pings
        .map((p) => p.event.resource)
        .join(", ")}`
    ).toBeTruthy()
    expect(batch!.channel, "the import history is team-visible, so it rides the team channel").toBe(
      "team:team-1"
    )
    expect(batch!.event.id, "the ping must name the batch that changed").toBe("batch-9")
  })

  it("still publishes the imported module (the existing ping is not traded away)", async () => {
    const { env, pings } = realtimeSpy()
    const { ctx, held } = ctxSpy()
    await postBatchConfirm(confirmRequest(), env as never, ctx)
    await Promise.all(held)
    expect(pings.map((p) => p.event.resource)).toContain("learning")
  })

  it("HOLDS the batch ping past the response — and does not block on it", async () => {
    // The failure R1's disposition rule exists for: with a bare `publishChange(…)`
    // the handler returns, the isolate finishes, and the platform cancels the
    // in-flight fetch. A check that only asks "is there a publish call" reads all
    // three dispositions the same, so this asks the two questions that separate
    // them — held, and not waited on.
    const { env, pings, release } = realtimeSpy("data_import_batches")
    const { ctx, held } = ctxSpy()
    let settled = false
    const inFlight = postBatchConfirm(confirmRequest(), env as never, ctx).then((r) => {
      settled = true
      return r
    })

    // Let every microtask that CAN run, run. The publish is parked on the held
    // fetch, and the response should have gone anyway.
    for (let i = 0; i < 20; i++) await Promise.resolve()
    expect(
      pings.some((p) => p.event.resource === "data_import_batches"),
      "the publish must have been made by now"
    ).toBe(true)
    expect(
      settled,
      "the importer waited on a Durable Object hop to be told about their own import"
    ).toBe(true)

    // AND the ping is not orphaned: the runtime was handed it, so the isolate is
    // held open until it lands. This is the half a fire-and-forget call fails —
    // and it is the reason the batch ping is the one parked. Everything in `held`
    // is still pending only if the parked ping is IN there; a bare
    // `publishChange(…)` leaves `held` holding just the module pings, which have
    // already resolved, so the whole set settles while the live layer is silent.
    let allHeldSettled = false
    void Promise.all(held).then(() => {
      allHeldSettled = true
    })
    for (let i = 0; i < 20; i++) await Promise.resolve()
    expect(
      allHeldSettled,
      "nothing handed the batch ping to ctx.waitUntil — the platform would cancel it the moment the isolate finished, and Past imports would stay stale"
    ).toBe(false)

    release()
    await Promise.all(held)
    expect(allHeldSettled).toBe(true)
    expect((await inFlight).status).toBe(200)
  })
})
