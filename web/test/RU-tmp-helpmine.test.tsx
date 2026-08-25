// TEMPORARY probe (review round 5): does the My-tickets registration actually get
// REACHED by the real shell's reconnect, or is it merely present? Deleted after.

import { act, cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const live: { onReconnect?: () => void } = {}

vi.mock("@/lib/realtime", () => ({
  useRealtime: (_teamId: string | null, _onEvent: unknown, onReconnect?: () => void) => {
    live.onReconnect = onReconnect
    return "live"
  },
  useUserRealtime: () => "live",
}))
vi.mock("next/navigation", () => ({ usePathname: () => "/help" }))
vi.mock("@/lib/perms", () => ({ usePermissions: () => ({ can: () => true, loading: false }) }))
vi.mock("@/lib/use-team-prewarm", () => ({ useTeamPrewarm: () => {} }))
vi.mock("@/components/team-switcher", () => ({ TeamSwitcher: () => null }))
vi.mock("@/components/profile-menu", () => ({ ProfileMenu: () => null }))
vi.mock("@/components/create-team-dialog", () => ({ CreateTeamDialog: () => null }))

import { AppShell } from "@/components/app-shell"
import { content } from "@/lib/api"
import { helpKey, totalKey } from "@/lib/live-resources"
import { primeCache, readCache } from "@/lib/store"

const TEAM = "team-1"
afterEach(cleanup)

const active = {
  loading: false,
  user: { id: "user-1", name: "A", email: "a@example.com" },
  ctx: { team: { id: TEAM, name: "Team" } },
  switchTeam: async () => {},
  createTeam: async () => {},
  refresh: async () => {},
} as never

describe("the My-tickets list is caught up by a reconnect", () => {
  it("re-pulls help-mine and diff-patches it", async () => {
    const key = helpKey(TEAM, "mine")
    primeCache(key, [{ id: "t1", subject: "stale" }])
    const spy = vi.spyOn(content, "help").mockResolvedValue({
      tickets: [{ id: "t1", subject: "fresh" }],
      total: 9,
      mineTotal: 4,
      nextCursor: null,
    } as never)

    render(<AppShell active={active}>{null}</AppShell>)
    expect(live.onReconnect).toBeTypeOf("function")
    await act(async () => {
      live.onReconnect!()
    })

    await waitFor(() =>
      expect(readCache<{ subject: string }[]>(key)?.[0].subject, "help-mine was never re-pulled").toBe(
        "fresh"
      )
    )
    expect(spy).toHaveBeenCalledWith("mine")
    // …and the R16 badge sidecar is re-primed by the same fetcher.
    expect(readCache<number>(totalKey("help-mine", TEAM))).toBe(4)
  })
})
