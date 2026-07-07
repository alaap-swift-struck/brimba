// Staging smoke test — the REAL login → onboarding → team journey, run
// against the live staging URL after every deploy. Fails loudly (non-zero
// exit) so a broken deploy never goes unnoticed.
//
// Uses one fixed smoke account: the first run exercises the full team
// factory; later runs prove idempotency (and don't litter team databases).

const BASE = process.env.SMOKE_BASE ?? "https://brimba-staging.swift-struck.workers.dev"
// Resend's test inbox: real send path, always "delivered", never bounces —
// so running the smoke repeatedly doesn't hurt the sending domain's reputation.
const EMAIL = "delivered@resend.dev"

let failures = 0
const ok = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${cond ? "" : ` — ${detail}`}`)
  if (!cond) failures++
}

const api = async (path, opts = {}, cookie = "") => {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...opts.headers,
    },
  })
  let body = null
  try {
    body = await res.json()
  } catch {}
  return { res, body }
}

// 1 · Both workers answer through the front door.
{
  const a = await api("/api/auth/health")
  const t = await api("/api/tenancy/health")
  const r = await api("/api/realtime/health")
  const m = await api("/api/mcp/health")
  ok("auth health", a.body?.ok === true)
  ok("tenancy health", t.body?.ok === true)
  ok("realtime health", r.body?.ok === true)
  ok("mcp health", m.body?.ok === true)
}

// 2 · Login: request a code (staging echoes it until Resend is wired).
const start = await api("/api/auth/email/start", {
  method: "POST",
  body: JSON.stringify({ email: EMAIL }),
})
ok("code issued", start.res.ok, JSON.stringify(start.body))
const code = start.body?.devCode
if (!code) {
  console.log("note: no devCode in response (Resend live?) — smoke stops at login")
  process.exit(failures ? 1 : 0)
}

// 3 · Verify the code → session cookie.
const verify = await fetch(`${BASE}/api/auth/email/verify`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, code }),
})
const cookie = (verify.headers.get("set-cookie") ?? "").split(";")[0]
ok("login verified + cookie set", verify.ok && cookie.startsWith("brimba_session="))

// 4 · Onboarding profile (idempotent).
const profile = await api(
  "/api/auth/profile",
  { method: "POST", body: JSON.stringify({ firstName: "Smoke", lastName: "Test" }) },
  cookie
)
ok("profile saved", profile.body?.user?.onboardingComplete === true)

// 5 · Bootstrap: first run births a team database; later runs return it.
const boot = await api("/api/tenancy/bootstrap", { method: "POST" }, cookie)
const team = boot.body?.teams?.[0]
ok("team exists + database ready", team?.dbStatus === "ready", JSON.stringify(boot.body))
ok("current team set", typeof boot.body?.currentTeamId === "string")

// 6 · Active context (Phase A): current team + your role, read from the team DB.
const ctx = await api("/api/tenancy/active", {}, cookie)
ok("active context has the current team", ctx.body?.team?.dbStatus === "ready", JSON.stringify(ctx.body))
ok("active context has your role (Admin)", ctx.body?.role?.title === "Admin", JSON.stringify(ctx.body?.role))

// 7 · Session round-trip + logout leaves the world clean.
const me = await api("/api/auth/me", {}, cookie)
ok("me() returns the smoke user", me.body?.user?.email === EMAIL)
await api("/api/auth/logout", { method: "POST" }, cookie)
const after = await api("/api/auth/me", {}, cookie)
ok("logout kills the session", after.res.status === 401)

console.log(failures ? `\nSMOKE FAILED (${failures})` : "\nSMOKE PASSED")
process.exit(failures ? 1 : 0)
