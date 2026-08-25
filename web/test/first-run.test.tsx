// THE COLD PATH — the one screen a brand-new team is guaranteed to meet.
//
// Every other test in this workspace runs against populated fixtures, so the
// LEAST-tested screen in the app was the first one anybody sees: a team of one
// with nothing in it. This test renders the real `HomeScreen` against the real
// `store` and the real `live-resources`, with only the network door (`@/lib/api`)
// swapped out — so what is asserted here is the shipped behaviour of the
// "Start here" block, not a re-description of it.
//
// The four states, in the order a person meets them:
//   1. alone + no articles         → the block IS there
//   2. someone else joined         → it is not, and it never asks the question
//   3. the first article arrives   → it goes, live, with no refresh
//   4. the count never comes back  → it FAILS OPEN, a beat later
//
// (4) is the one with a trap in it. `undefined` from the count cache means two
// different things — still in flight, or never coming — and the component
// deliberately waits ~1.5s before it decides. Answering instantly would flash
// "Start here" at every solo owner who already HAS articles; never answering
// leaves a new owner with no guidance at all and nothing saying so. So the test
// has to drive the timer rather than assume the answer is synchronous: it
// asserts BOTH halves — still hidden at 1.4s, shown at 1.5s.

import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import type { ActiveContext } from "@shared/types"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { HomeScreen } from "@/components/screens/home-screen"
import { totalKey } from "@/lib/live-resources"
import { primeCache } from "@/lib/store"
import type { ActiveTeam } from "@/lib/use-active-team"

// The ONE seam swapped: the network door. Everything between it and the DOM —
// listFetch, the `total:` sidecar, the cache subscription, the effects — is the
// real code, so a break anywhere along that path shows up here.
const net = vi.hoisted(() => ({ learning: vi.fn() }))
vi.mock("@/lib/api", () => ({
  auth: {},
  tenancy: {},
  content: { learning: net.learning },
}))

// This workspace runs vitest WITHOUT globals, so testing-library's automatic
// cleanup never registers — without this the previous test's "Start here" is
// still in the document and "it does not render" passes on a stale node.
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

beforeEach(() => {
  net.learning.mockReset()
})

/** The signed-in context a brand-new owner actually arrives with. `teamId` is
 *  unique per test on purpose: the store's cache is module-level and outlives a
 *  single test, so distinct ids keep each case honestly cold. */
function soloOwner(teamId: string, memberCount = 1): ActiveTeam {
  const ctx: ActiveContext = {
    team: { id: teamId, name: "Northwind", logoUrl: null, roleId: "role_admin", dbStatus: "ready" },
    role: { id: "role_admin", title: "Admin" },
    memberCount,
    teams: [],
  }
  return {
    loading: false,
    user: null,
    ctx,
    switchTeam: async () => {},
    createTeam: async () => {},
    refresh: async () => {},
  }
}

const startHere = () => screen.queryByRole("heading", { name: "Start here" })
/** The screen rendered at all — so "the block is absent" can never pass because
 *  the component blew up or returned null. */
const teamHeading = () => screen.queryByRole("heading", { name: "Northwind" })

describe("first run — the Start here block", () => {
  it("renders for a team of one with no articles", async () => {
    net.learning.mockResolvedValue({ learning: [], total: 0 })
    render(<HomeScreen active={soloOwner("team_alone")} />)

    await waitFor(() => {
      expect(startHere(), "a solo owner with nothing must be told where to start").toBeTruthy()
    })
    // …and it is the guidance, not just a heading: all three ways in are offered.
    expect(screen.getByText("Add your first article")).toBeTruthy()
    expect(screen.getByText("Import a spreadsheet")).toBeTruthy()
    expect(screen.getByText("Invite your team")).toBeTruthy()
  })

  it("does not render once a second person is on the team — and costs no request", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    net.learning.mockResolvedValue({ learning: [], total: 0 })
    render(<HomeScreen active={soloOwner("team_two", 2)} />)

    // Well past the fail-open beat: a team of two must never reach it.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(teamHeading(), "the screen itself must have rendered").toBeTruthy()
    expect(screen.getByText("2 members")).toBeTruthy()
    expect(startHere(), "an established team must never see the first-run block").toBeNull()
    // The comment on the block claims it costs nothing on an established team.
    // Only a team of ONE is allowed to ask the second question.
    expect(
      net.learning,
      "a team of two must not spend a request answering a question only a solo owner asks"
    ).not.toHaveBeenCalled()
  })

  it("disappears the moment the first article exists, with no refresh", async () => {
    const teamId = "team_first_article"
    net.learning.mockResolvedValue({ learning: [], total: 0 })
    render(<HomeScreen active={soloOwner(teamId)} />)

    await waitFor(() => expect(startHere()).toBeTruthy())

    // Exactly what a create ping does: bump the `total:` sidecar (R16). No
    // re-render by hand, no remount — the live cache subscription carries it.
    act(() => {
      primeCache(totalKey("learning", teamId), 1)
    })

    expect(startHere(), "one article means they have started — the block must go").toBeNull()
    expect(teamHeading(), "…and the rest of Home must still be there").toBeTruthy()
  })

  it("fails open when the count never resolves — but not before the beat", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    // A swallowed cache failure: primeCacheIfCold catches this silently, so the
    // `total:` sidecar is never primed and the count stays `undefined` forever.
    net.learning.mockRejectedValue(new Error("offline"))
    render(<HomeScreen active={soloOwner("team_no_count")} />)

    // The failure has already landed here (the rejection flushes in these
    // microtasks) and the block is STILL hidden — that is the deliberate wait,
    // and it is what stops a solo owner who already has articles seeing a flash
    // of "Start here" on every single load.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1400)
    })
    expect(
      startHere(),
      "the block must not appear before the beat, or every solo owner with articles gets a flash of it"
    ).toBeNull()
    expect(teamHeading(), "the screen itself must have rendered").toBeTruthy()

    // …and a beat later it gives up waiting and shows the guidance anyway.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(
      startHere(),
      "a new team whose count never came back must still get guidance, not an empty screen"
    ).toBeTruthy()
    expect(screen.getByText("Add your first article")).toBeTruthy()
  })
})
