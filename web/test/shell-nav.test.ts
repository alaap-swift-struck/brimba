// The one-shell routing invariants (source-scans). The whole post-auth app resolves in
// ONE deep-link shell, so ALL in-app navigation is soft History-API — an in-app
// `router.push` is the static-export hard reload that tears the SPA (and a running agent)
// down (EDGE-CASES §1). These lock the invariants that keep it that way.

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { ACCOUNT_MODULES, TOP_LEVEL_MODULES } from "@/components/deep-link/route"

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB = join(HERE, "..")
const read = (p: string) => readFileSync(join(WEB, p), "utf8")

describe("the one shell — no reload on in-app navigation", () => {
  it("every account module is also a TOP_LEVEL_MODULE (else go() would hard-reload it)", () => {
    // If an account module isn't in TOP_LEVEL_MODULES, isInAppPath is false for it, so
    // go('/that') falls into the router.push branch — the reload that kills the agent.
    for (const m of ACCOUNT_MODULES) expect(TOP_LEVEL_MODULES, `"${m}" must be a TOP_LEVEL_MODULE`).toContain(m)
  })

  it("every account module has a render branch in the shell (no blank screen)", () => {
    const src = read("components/deep-link-screen.tsx")
    for (const m of ACCOUNT_MODULES)
      expect(src, `deep-link-screen must render a screen for module "${m}"`).toContain(`module === "${m}"`)
  })

  it("in-app nav goes through softNavigate/go(), never a router.push into the app", () => {
    // A router.push to an in-app path is the hard reload we removed. The deep nav
    // components + the account screens must use softNavigate instead. (router.replace to
    // a pre-auth route like /login on sign-out is fine — that's leaving the app.)
    const files = [
      "components/profile-menu.tsx",
      "components/team-switcher.tsx",
      "components/invitations.tsx",
      "components/screens/home-screen.tsx",
      "components/screens/settings-screen.tsx",
      "components/app-shell.tsx",
    ]
    for (const f of files) {
      const src = read(f)
      expect(/router\.push\(/.test(src), `${f} must not router.push (use softNavigate for in-app nav)`).toBe(false)
    }
  })

  it("softNavigate is the one bus, backed by the host's registered go()", () => {
    const nav = read("lib/nav.ts")
    expect(nav).toContain("export function softNavigate")
    expect(nav).toContain("export function registerHostGo")
    // The shell registers its go() so softNavigate resolves to a soft History-API move.
    expect(read("components/deep-link-screen.tsx")).toContain("registerHostGo(go)")
  })
})
