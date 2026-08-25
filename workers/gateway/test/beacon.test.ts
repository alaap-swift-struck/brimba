// THE CLIENT ERROR BEACON — and who is allowed to write into the incident stream.
//
// `POST /api/log/client` is how a crash on a person's phone reaches the same
// `error_logs` table the workers write to. It is deliberately unauthenticated at
// the network level (a browser mid-crash still has to be able to report), so the
// door verifies the session with auth before it records anything — a `Cookie:`
// header is attacker-controlled, and `Cookie: brimba_session=x` was once enough
// to write a row into the GLOBAL core database from an anonymous request.
//
// That check was added, and the `console.error` above it was left where it was.
// So the row is gated and THE LOG LINE IS NOT. Cloudflare's observability, the
// live tail, and every alert built on them read that stream, and anyone at all
// can put 4 KB of chosen text into it per request, unsigned, unattributed, and
// indistinguishable from a real crash — the same "client_error" prefix a genuine
// one carries. The door's own comment says "Only forwarded once the session is
// VERIFIED", and one of the two things it forwards did not wait.
//
// Forging an incident is cheaper than causing one. These tests hold the console
// line to the same gate as the row.

import { beforeEach, describe, expect, it, vi } from "vitest"

const worker = (await import("../src/index")).default

/** An AUTH binding that answers `/api/auth/me` however the test needs, and
 * records what it was asked — so a test can prove the recording hop was never
 * even attempted. */
function authThatSays(signedIn: boolean) {
  const calls: string[] = []
  return {
    calls,
    binding: {
      fetch: async (url: string) => {
        calls.push(url)
        if (url.endsWith("/api/auth/me"))
          return new Response(JSON.stringify(signedIn ? { user: { id: "U" } } : {}), {
            status: signedIn ? 200 : 401,
          })
        return new Response(null, { status: 204 })
      },
    },
  }
}

const beacon = (body: unknown, cookie?: string) =>
  new Request("https://app/api/log/client", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })

let errors: string[] = []
beforeEach(() => {
  errors = []
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args.map(String).join(" "))
  })
})

/** Every line the beacon path put into the incident stream. `traceError` writes
 * structured JSON through the same console, so filter to the beacon's own. */
const beaconLines = () => errors.filter((l) => l.includes("client_error"))

describe("an anonymous caller cannot write into the incident stream", () => {
  it("logs NOTHING for a request with no cookie at all", async () => {
    const auth = authThatSays(false)
    const res = await worker.fetch(
      beacon({ message: "FORGED: database credentials rotated, see http://evil.example" }),
      { AUTH: auth.binding } as never
    )
    expect(res.status, "the beacon always answers 204 — it must not tell a prober anything").toBe(204)
    expect(
      beaconLines(),
      "an unsigned-in caller put a line of their own text into the log stream the on-call reads"
    ).toEqual([])
  })

  it("logs NOTHING for a forged session cookie auth refuses", async () => {
    const auth = authThatSays(false)
    await worker.fetch(beacon({ message: "FORGED" }, "brimba_session=made-up"), {
      AUTH: auth.binding,
    } as never)
    expect(
      beaconLines(),
      "a cookie header is attacker-controlled — auth said no, so nothing about this request may be recorded anywhere"
    ).toEqual([])
  })

  it("never even asks auth about a request carrying no session cookie", async () => {
    // The cheap check first: no cookie means no service hop, so a flood costs
    // the gateway one string comparison rather than one auth round-trip each.
    const auth = authThatSays(false)
    await worker.fetch(beacon({ message: "FORGED" }), { AUTH: auth.binding } as never)
    expect(auth.calls).toEqual([])
  })
})

describe("a signed-in caller's beacon still works", () => {
  it("logs the line AND forwards the row once auth confirms the session", async () => {
    const auth = authThatSays(true)
    const res = await worker.fetch(
      beacon({ message: "real crash", where: "render", url: "https://app/x" }, "brimba_session=good"),
      { AUTH: auth.binding, INTERNAL_KEY: "k" } as never
    )
    expect(res.status).toBe(204)
    expect(
      beaconLines().length,
      "the console line is not being removed — it is being moved behind the same gate as the row"
    ).toBe(1)
    expect(beaconLines()[0]).toContain("real crash")
    expect(
      auth.calls.some((u) => u.endsWith("/internal/log-error")),
      "a verified beacon must still reach the error store"
    ).toBe(true)
  })

  it("still caps what one verified beacon can put in the stream", async () => {
    const auth = authThatSays(true)
    await worker.fetch(beacon("x".repeat(50_000), "brimba_session=good"), {
      AUTH: auth.binding,
    } as never)
    const line = beaconLines()[0] ?? ""
    expect(line.length, "the 4 KB cap is what stops one caller filling the stream").toBeLessThan(4_200)
  })
})
