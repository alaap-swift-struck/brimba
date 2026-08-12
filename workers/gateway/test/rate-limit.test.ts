// THE ONLY THING THAT BOUNDS *RATE*.
//
// Everything else in this base is bounded in SIZE — a list has a hard cap
// (R14), an import has a row ceiling, an upload has a byte cap, the agent has a
// credit quota. None of that stops a caller issuing requests as fast as the
// network allows, and the agent quota is not a general answer: a role WITHOUT
// the agent right could hammer the read doors all day and meet nothing.
//
// Two properties decide whether this works, and both are the kind that fail
// silently: the key must be one the CALLER CANNOT CHOOSE (or resetting your own
// counter is a header away), and the whole thing must FAIL OPEN (or the feature
// meant to keep the app up becomes the thing that takes it down).

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { callerKey, isHeavyPath, rateLimit, tooManyRequests } from "../../../shared/workers/rate-limit"

const root = join(__dirname, "..", "..", "..")
const gateway = readFileSync(join(__dirname, "..", "src", "index.ts"), "utf8")
const gating = readFileSync(join(root, "shared", "workers", "gating.ts"), "utf8")

const req = (init?: { cookie?: string; ip?: string; url?: string }) =>
  new Request(init?.url ?? "https://app.example/api/content/learning", {
    headers: {
      ...(init?.cookie ? { Cookie: init.cookie } : {}),
      ...(init?.ip ? { "CF-Connecting-IP": init.ip } : {}),
    },
  })

const limiter = (success: boolean) => ({ limit: async () => ({ success }) })

describe("the key", () => {
  it("is the session when there is one", () => {
    expect(callerKey(req({ cookie: "brimba_session=abc123" }))).toBe("s:abc123")
  })

  it("falls back to the address Cloudflare itself observed", () => {
    // A sign-in door has no session yet, and is exactly the door that gets
    // guessed at — so the unauthenticated case must still be keyed, not exempt.
    expect(callerKey(req({ ip: "203.0.113.7" }))).toBe("ip:203.0.113.7")
  })

  it("cannot be chosen by the caller", () => {
    // X-Forwarded-For is client-settable; CF-Connecting-IP is set by
    // Cloudflare's edge. Keying on the former would let anyone reset their own
    // counter every request by changing one header.
    // Read the CODE, not the prose about it. The seam's own comment explains
    // why X-Forwarded-For is unsafe, and a naive substring search reads that
    // explanation as the offence it warns against — a check that cannot tell a
    // comment from a statement will eventually fail on the right answer.
    const src = readFileSync(join(root, "shared", "workers", "rate-limit.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
    expect(src).toContain("CF-Connecting-IP")
    expect(
      /X-Forwarded-For/i.test(src),
      "a client-settable header must never be the rate-limit key"
    ).toBe(false)
  })

  it("bounds the key so a huge cookie cannot become a huge key", () => {
    expect(callerKey(req({ cookie: `brimba_session=${"x".repeat(5000)}` })).length).toBeLessThan(80)
  })
})

describe("the ceiling", () => {
  it("lets a request through when the limiter says yes", async () => {
    expect(await rateLimit(req(), { USER_LIMITER: limiter(true) })).toBeNull()
  })

  it("refuses with a 429 and a Retry-After when the limiter says no", async () => {
    const res = await rateLimit(req(), { USER_LIMITER: limiter(false) })
    expect(res?.status).toBe(429)
    expect(res?.headers.get("Retry-After")).toBeTruthy()
  })

  it("FAILS OPEN when the limiter is absent", async () => {
    // A fork that has not enabled the binding, `wrangler dev`, and every test
    // run all land here. The app must work identically, minus the ceiling.
    expect(await rateLimit(req(), {})).toBeNull()
  })

  it("FAILS OPEN when the limiter throws", async () => {
    const broken = { limit: async () => { throw new Error("limiter down") } }
    expect(
      await rateLimit(req(), { USER_LIMITER: broken }),
      "a wobbling rate limiter must not become an outage — that inverts its purpose"
    ).toBeNull()
  })

  it("speaks plainly — a limit met by accident must not read as an incident", async () => {
    const body = await tooManyRequests().json() as { message: string }
    expect(body.message).toMatch(/try again/i)
    expect(body.message).not.toMatch(/blocked|denied|violation|abuse|forbidden/i)
  })
})

describe("where the two ceilings sit", () => {
  it("puts the per-caller ceiling ABOVE the gateway's routing table", () => {
    // Above it, so a new route cannot be added outside the ceiling by
    // forgetting to opt in — the same reason the publish and gating seams sit
    // where they do.
    const limitAt = gateway.indexOf("const limited = await rateLimit(request, env)")
    const firstRoute = gateway.indexOf('if (pathname.startsWith("/api/auth/"))')
    expect(limitAt, "the gateway must rate-limit").toBeGreaterThan(-1)
    expect(limitAt, "the ceiling must come BEFORE the first route, not after").toBeLessThan(firstRoute)
  })

  it("covers the API and the machine surface, not cached assets", () => {
    const guard = gateway.slice(gateway.indexOf("if (pathname.startsWith(\"/api/\")"))
    expect(guard.slice(0, 120)).toContain('pathname === "/mcp"')
  })

  it("puts the per-TEAM ceiling where the team is actually known", () => {
    // It cannot live at the gateway: a team-scoped call carries no team in its
    // URL (it comes from the session), so the public door would need a session
    // lookup of its own on every request. teamContext already has the id.
    const fn = gating.slice(gating.indexOf("export async function teamContext"))
    expect(fn).toMatch(/await limitTeam\(env, guard\.teamId\)/)
    expect(
      fn.indexOf("limitTeam") > fn.indexOf("requireMember"),
      "the team must be resolved before it can be charged"
    ).toBe(true)
  })

  it("keeps the team ceiling fail-open too", () => {
    const fn = gating.slice(gating.indexOf("async function limitTeam"))
    expect(fn).toMatch(/if \(!limiter\) return/)
    expect(
      /catch \(e\)[\s\S]{0,200}console\.error/.test(fn),
      "a limiter failure must be logged and allowed, never thrown at the user"
    ).toBe(true)
  })
})

describe("the bindings are actually declared", () => {
  // A limiter the runtime never receives is code that reads as protection and
  // is not. The seam fails open by design, so this is the ONLY thing standing
  // between "protected" and "silently unprotected".
  const parse = (w: string) =>
    JSON.parse(
      readFileSync(join(root, "workers", w, "wrangler.jsonc"), "utf8").replace(/^\s*\/\/.*$/gm, "")
    ) as { ratelimits?: { name: string; simple: { period: number } }[]; env: Record<string, { ratelimits?: { name: string }[] }> }

  it("gives the gateway a per-caller limiter in BOTH environments", () => {
    const cfg = parse("gateway")
    expect(cfg.ratelimits?.map((r) => r.name)).toContain("USER_LIMITER")
    expect(cfg.env.staging.ratelimits?.map((r) => r.name)).toContain("USER_LIMITER")
  })

  it("gives every team-data worker a per-team limiter in BOTH environments", () => {
    for (const w of ["tenancy", "content", "data-ops"]) {
      const cfg = parse(w)
      expect(cfg.ratelimits?.map((r) => r.name), `${w} production`).toContain("TEAM_LIMITER")
      expect(cfg.env.staging.ratelimits?.map((r) => r.name), `${w} staging`).toContain("TEAM_LIMITER")
    }
  })

  it("uses a period the platform actually accepts", () => {
    // Cloudflare allows 10 or 60 seconds and nothing else. A 30 here is not a
    // slightly-wrong limit, it is a deploy that fails.
    for (const w of ["gateway", "tenancy", "content", "data-ops"]) {
      for (const r of parse(w).ratelimits ?? []) {
        expect([10, 60], `${w}: period ${r.simple.period}`).toContain(r.simple.period)
      }
    }
  })
})

// THE EXPENSIVE DOORS get a ceiling of their own.
//
// One ceiling treats a cheap list read and an AI turn as the same event, which
// is the wrong shape: 600 list reads a minute is ordinary use, 600 agent turns
// is a bill. These paths fan out into model calls, multi-table writes or a
// full-table read, so they carry a second ceiling ON TOP of the per-caller one.
describe("the expensive doors", () => {
  it("recognises what actually costs something", () => {
    expect(isHeavyPath("/api/data-ops/agent")).toBe(true)
    expect(isHeavyPath("/api/data-ops/agent/confirm")).toBe(true)
    expect(isHeavyPath("/api/data-ops/import/plan")).toBe(true)
    expect(isHeavyPath("/api/content/learning/upload")).toBe(true)
    expect(isHeavyPath("/api/content/learning/export"), "an export reads the table").toBe(true)
  })

  it("leaves ordinary reads on the ordinary ceiling", () => {
    expect(isHeavyPath("/api/tenancy/members")).toBe(false)
    expect(isHeavyPath("/api/content/learning")).toBe(false)
    expect(isHeavyPath("/api/auth/me")).toBe(false)
  })

  it("charges a heavy call against BOTH ceilings, not instead of one", () => {
    const src = readFileSync(join(root, "shared", "workers", "rate-limit.ts"), "utf8")
    const fn = src.slice(src.indexOf("export async function rateLimit"))
    expect(fn.indexOf("USER_LIMITER"), "the ordinary ceiling still applies").toBeGreaterThan(-1)
    expect(
      fn.indexOf("HEAVY_LIMITER") > fn.indexOf("USER_LIMITER"),
      "the heavy ceiling is an ADDITION — a caller must pass both, not one or the other"
    ).toBe(true)
  })

  it("is tighter than the ordinary one, or it does nothing", () => {
    const cfg = JSON.parse(
      readFileSync(join(root, "workers", "gateway", "wrangler.jsonc"), "utf8").replace(/^\s*\/\/.*$/gm, "")
    ) as { ratelimits: { name: string; simple: { limit: number } }[] }
    const ordinary = cfg.ratelimits.find((r) => r.name === "USER_LIMITER")!.simple.limit
    const heavy = cfg.ratelimits.find((r) => r.name === "HEAVY_LIMITER")!.simple.limit
    expect(heavy, `heavy ${heavy} must be below ordinary ${ordinary}`).toBeLessThan(ordinary)
  })

  it("is not a substitute for the AI credit quota", () => {
    // The quota bounds SPEND over a day; this bounds RATE over a minute. A retry
    // loop can exhaust a day's quota in seconds, which is what this stops.
    const src = readFileSync(join(root, "shared", "workers", "rate-limit.ts"), "utf8")
    expect(src).toMatch(/not a substitute for it/)
  })
})
