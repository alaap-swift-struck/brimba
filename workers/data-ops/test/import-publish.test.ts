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
// It also proves the DISPOSITION (R1's small print): the last ping is held open
// and the handler must still be waiting on it. A bare `publishChange(...)` would
// let the response go first and the platform would cancel the fetch — the ping
// would never arrive, and the screen would be exactly as stale as before.

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

function confirmRequest(batchId = "batch-9") {
  return new Request("https://data-ops/api/data-ops/import/batch/confirm", {
    method: "POST",
    body: JSON.stringify({ batchId }),
  })
}

describe("a finished import broadcasts the batch row, not only the tables it wrote", () => {
  it("pings data_import_batches on the team channel, carrying the batch id", async () => {
    const { env, pings } = realtimeSpy()
    const res = await postBatchConfirm(confirmRequest(), env as never)

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
    await postBatchConfirm(confirmRequest(), env as never)
    expect(pings.map((p) => p.event.resource)).toContain("learning")
  })

  it("WAITS for the batch ping — a fire-and-forget publish never arrives", async () => {
    // The failure R1's disposition rule exists for: with a bare `publishChange(…)`
    // the handler returns, the isolate finishes, and the platform cancels the
    // in-flight fetch. The check that only asks "is there a publish call" reads
    // both versions the same.
    const { env, pings, release } = realtimeSpy("data_import_batches")
    let settled = false
    const inFlight = postBatchConfirm(confirmRequest(), env as never).then((r) => {
      settled = true
      return r
    })

    // Let every microtask that CAN run, run. The handler is now parked on the held
    // ping — unless it never waited for it.
    for (let i = 0; i < 20; i++) await Promise.resolve()
    expect(
      pings.some((p) => p.event.resource === "data_import_batches"),
      "the publish must have been made by now"
    ).toBe(true)
    expect(
      settled,
      "the handler answered before its own ping had left — that publish would be cancelled"
    ).toBe(false)

    release()
    expect((await inFlight).status).toBe(200)
  })
})
