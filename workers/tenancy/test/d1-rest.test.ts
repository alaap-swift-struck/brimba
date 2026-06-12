// The data door's failure behavior: retries on server blips, fails fast on
// our own mistakes (4xx), surfaces clean errors.
import { afterEach, describe, expect, it, vi } from "vitest"

import { d1Query } from "../../../shared/workers/d1-rest"

const CFG = { accountId: "acct", apiToken: "tok" }

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status })
}

afterEach(() => vi.unstubAllGlobals())

describe("d1 REST door", () => {
  it("retries a 500 and succeeds on the next attempt", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, {}))
      .mockResolvedValueOnce(
        jsonResponse(200, { success: true, errors: [], result: [{ results: [{ ok: 1 }] }] })
      )
    vi.stubGlobal("fetch", fetchMock)

    const rows = await d1Query(CFG, "db1", "SELECT 1")
    expect(rows).toEqual([{ ok: 1 }])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("does NOT retry a 4xx (our request is wrong) and reports the message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(400, {
        success: false,
        errors: [{ code: 7500, message: "no such table: nope" }],
        result: null,
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(d1Query(CFG, "db1", "SELECT * FROM nope")).rejects.toThrow(
      "no such table"
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("gives up after exhausting retries on persistent 5xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(503, {}))
    vi.stubGlobal("fetch", fetchMock)

    await expect(d1Query(CFG, "db1", "SELECT 1")).rejects.toThrow("503")
    expect(fetchMock).toHaveBeenCalledTimes(3) // 1 try + 2 retries
  })
})
