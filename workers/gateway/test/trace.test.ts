// "IT SAID NO" AND "IT SAID NOTHING" ARE NOT THE SAME ANSWER.
//
// This is the behavioural half of R11's internal hop. The source scan in
// `web/test/rules.test.ts` proves no worker calls a service binding directly; it
// cannot prove what a caller DOES with the answer, because that needs the meaning
// of the code and not its shape. This file covers exactly that gap.
//
// The fault it exists to prevent was live in the base until 2026-08-18:
//
//     const res = await env.AUTH.fetch("https://auth/api/auth/me", …)
//     if (!res.ok) return null          // ← and a THROW took the same branch
//
// A 401 there means auth looked and says this person is not signed in. An auth
// that does not answer meant the same thing to the code — so an auth outage
// silently signed every working user out, destroyed whatever they were typing,
// and sent them to a login screen that could not help them either. Being told
// "you are logged out" when you are not is a worse failure than being told
// "we are broken", because only one of them is a lie.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
  callService,
  proxyService,
  requestIdFrom,
  withTrace,
  REQUEST_ID_HEADER,
  SERVICE_TIMEOUT_MS,
} from "../../../shared/workers/trace"
import { whoAmI, GuardError, type GatingEnv } from "../../../shared/workers/gating"

/** A binding that answers with whatever you give it. */
const answers = (status: number, body: unknown = {}) => ({
  fetch: async () => new Response(JSON.stringify(body), { status }),
})
/** A binding that is DOWN — the throw a dead or undeployed worker produces. */
const dead = {
  fetch: async () => {
    throw new TypeError("no such service")
  },
}
/** A binding that never answers, so the timeout is the only thing that ends it. */
const hangs = {
  fetch: (_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))
    }),
}

const req = (headers: Record<string, string> = {}) => new Request("https://app/x", { headers })

describe("the request id", () => {
  it("honours a sane inbound id so a client or proxy can supply its own", () => {
    expect(requestIdFrom(req({ [REQUEST_ID_HEADER]: "abc-123_XYZ" }))).toBe("abc-123_XYZ")
  })

  it("mints its own rather than trusting a hostile one", () => {
    // The id is attacker-supplied at the public door and ends up in log lines, so
    // a newline or a megabyte of text must not travel with it.
    // No newline case here: the runtime refuses to CONSTRUCT such a header at all
    // ("invalid header value"), so log injection via this route cannot reach us —
    // a real defence, not one this seam has to provide. The rest can arrive.
    for (const bad of ["", "  ", "short", "has space", "y".repeat(200), "<script>"]) {
      const id = requestIdFrom(req({ [REQUEST_ID_HEADER]: bad }))
      expect(id, `${JSON.stringify(bad)} must not be accepted verbatim`).not.toBe(bad)
      expect(id).toMatch(/^[0-9A-Z]{26}$/) // a freshly minted ULID
    }
  })

  it("mints one when nothing came in", () => {
    expect(requestIdFrom(req())).toMatch(/^[0-9A-Z]{26}$/)
  })

  it("gives two requests different ids", () => {
    expect(requestIdFrom(req())).not.toBe(requestIdFrom(req()))
  })

  it("REPLACES a client-supplied id on the forwarded request, never appends to it", () => {
    // The array form of the Headers constructor COMBINES same-named headers
    // instead of replacing them, so `new Headers([...request.headers, [H, id]])`
    // produced "theirs, ours". That value fails the shape check above, so every
    // downstream worker minted its own id and correlation broke silently — in
    // exactly the case honouring an inbound id exists for. Caught pre-deploy
    // 2026-08-18; the fix is `.set()`.
    const incoming = new Request("https://app/x", { headers: { [REQUEST_ID_HEADER]: "client-sent-this" } })
    const headers = new Headers(incoming.headers)
    headers.set(REQUEST_ID_HEADER, "MINTED01234567890123456789")
    expect(headers.get(REQUEST_ID_HEADER)).toBe("MINTED01234567890123456789")
    // And the result must survive the round trip the downstream worker performs.
    expect(requestIdFrom(new Request("https://app/y", { headers }))).toBe("MINTED01234567890123456789")
  })

  it("the gateway uses .set() rather than the combining array form", () => {
    // A behaviour test cannot reach the gateway's module-level handler, so this
    // pins the one line that decides it. Named explicitly because the wrong form
    // LOOKS correct and fails only when a client sends the header.
    const src = readFileSync(join(__dirname, "..", "src", "index.ts"), "utf8")
    expect(src, "the gateway must build tracedHeaders then .set() the id").toMatch(
      /tracedHeaders\.set\(REQUEST_ID_HEADER, req\)/
    )
    expect(
      /new Headers\(\[\.\.\.request\.headers/.test(src),
      "the combining array form appends instead of replacing — it broke inbound ids"
    ).toBe(false)
  })

  it("the gateway STRIPS a caller-supplied origin header", () => {
    // The origin column is trusted by the audit trail. If a browser could set it,
    // anyone could stamp their own edit as "job" or "agent" and the provenance
    // would be worthless. Internal callers set it worker-to-worker via
    // forwardToDoor, which never passes through the gateway — so deleting it on
    // the way in costs the real paths nothing.
    const src = readFileSync(join(__dirname, "..", "src", "index.ts"), "utf8")
    expect(src, "the public door must delete the origin header from inbound requests").toMatch(
      /tracedHeaders\.delete\(ORIGIN_HEADER\)/
    )
  })

  it("merges into outbound headers, and leaves them alone when there is no id", () => {
    expect(withTrace({ Cookie: "c" }, "ID1")).toEqual({ Cookie: "c", [REQUEST_ID_HEADER]: "ID1" })
    expect(withTrace({ Cookie: "c" })).toEqual({ Cookie: "c" })
  })
})

describe("callService tells a refusal from a silence", () => {
  it("returns the response when the dependency ANSWERED — including a no", () => {
    // A 401/403/500 is an ANSWER. It belongs to the caller to interpret, and
    // folding it into null would throw away the reason.
    return Promise.all(
      [200, 401, 403, 404, 500].map(async (status) => {
        const res = await callService(answers(status), "https://x/", {}, { worker: "t", place: "p" })
        expect(res, `${status} is an answer`).not.toBeNull()
        expect(res!.status).toBe(status)
      })
    )
  })

  it("returns NULL when the dependency did not answer at all", async () => {
    expect(await callService(dead, "https://x/", {}, { worker: "t", place: "p" })).toBeNull()
  })

  it("returns NULL rather than hanging when the dependency never replies", async () => {
    const started = Date.now()
    const res = await callService(hangs, "https://x/", {}, { worker: "t", place: "p", timeoutMs: 40 })
    expect(res, "a hung dependency must end as no-answer, not as a held-open request").toBeNull()
    expect(Date.now() - started, "and it must end at the timeout, not later").toBeLessThan(2_000)
  })

  it("carries the request id to the other side", async () => {
    let seen: string | null = null
    const spy = {
      fetch: async (_u: string, init?: RequestInit) => {
        seen = (init?.headers as Record<string, string>)?.[REQUEST_ID_HEADER] ?? null
        return new Response("{}")
      },
    }
    await callService(spy, "https://x/", { headers: { Cookie: "c" } }, { req: "TRACE1", worker: "t", place: "p" })
    expect(seen, "without this, the two sides' logs have nothing in common").toBe("TRACE1")
  })

  it("bounds every call by default, so forgetting the option cannot mean forever", () => {
    expect(SERVICE_TIMEOUT_MS).toBeGreaterThan(0)
    expect(SERVICE_TIMEOUT_MS).toBeLessThanOrEqual(15_000)
  })
})

describe("whoAmI — the fault this was built for", () => {
  const env = (auth: { fetch: (u: string, i?: RequestInit) => Promise<Response> }) =>
    ({ AUTH: auth, DB: {}, CF_ACCOUNT_ID: "acct" }) as unknown as GatingEnv

  it("returns null when auth says this person is NOT signed in", async () => {
    // The honest 401 path. The caller turns this into "please sign in", correctly.
    expect(await whoAmI(req(), env(answers(401)))).toBeNull()
  })

  it("returns the user when auth says they are", async () => {
    const user = { id: "u1", email: "a@b.c" }
    expect(await whoAmI(req(), env(answers(200, { user })))).toEqual(user)
  })

  it("THROWS 503 when auth did not answer — it must never claim you are signed out", async () => {
    await expect(whoAmI(req(), env(dead))).rejects.toThrow(GuardError)
    await whoAmI(req(), env(dead)).catch((e: GuardError) => {
      expect(e.status, "an outage is 503, not 401 — 401 sends a working user to a login screen").toBe(503)
      expect(e.message, "and it must say nothing was lost, or people re-do work they never lost").toMatch(/nothing was changed/i)
    })
  })

  it("throws rather than hangs when auth is merely slow", async () => {
    // Deliberately exercising the REAL SERVICE_TIMEOUT_MS rather than a short
    // injected one — whoAmI takes no override, so the production bound is the only
    // thing that can end this call, and proving the real number works is the point.
    // Hence the generous vitest budget: the test is slow because the bound is 5s.
    const started = Date.now()
    await expect(whoAmI(req(), env(hangs))).rejects.toThrow(GuardError)
    expect(Date.now() - started).toBeLessThan(SERVICE_TIMEOUT_MS + 2_000)
  }, SERVICE_TIMEOUT_MS + 4_000)
})

describe("proxyService keeps the front door honest", () => {
  it("passes a real response straight through, whatever its status", async () => {
    for (const status of [200, 404, 500]) {
      const res = await proxyService(
        { fetch: async () => new Response("body", { status }) },
        req(),
        { worker: "w", place: "p" }
      )
      expect(res.status).toBe(status)
    }
  })

  it("turns a dead worker into a 503 that says so, not a bare platform 500", async () => {
    const res = await proxyService({ fetch: async () => { throw new TypeError("down") } }, req(), {
      req: "TRACE9",
      worker: "content",
      place: "GET /api/content/x",
    })
    expect(res.status, "503 is retryable and true; an unhandled rejection is a 500 with no body").toBe(503)
    const body = (await res.json()) as { error: string; message: string }
    expect(body.error).toBe("service_unavailable")
    expect(body.message, "a person reads this — it must not mention workers or bindings").toMatch(/try again/i)
    expect(res.headers.get(REQUEST_ID_HEADER), "the id goes back to the client so a report can name it").toBe("TRACE9")
  })

  it("does NOT bound the proxy, because this path carries the agent's streamed reply", async () => {
    // A timeout here would cut a long, working answer off mid-sentence. The guard
    // belongs on the short internal hops; this one gets the guard and no bound.
    const slowButWorking = {
      fetch: () => new Promise<Response>((resolve) => setTimeout(() => resolve(new Response("ok")), 60)),
    }
    const res = await proxyService(slowButWorking, req(), { worker: "data-ops", place: "stream" })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe("ok")
  })
})
