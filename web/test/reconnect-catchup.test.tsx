// A DEEP-LINKED RECORD IS CAUGHT UP AFTER A DROPPED SOCKET (CACHING rule 6).
//
// The reconnect handler reconciled the LISTS, and `reconcile` is a no-op on a list
// that was never loaded — which is every deep link. So a person sitting on one
// ticket (`help-one:<id>`) or one article (`learning-one:<id>`) through a network
// blip was caught up on nothing at all: the record, its conversation and its
// Activity tab kept whatever they had, indefinitely, under a connection dot that
// had gone cheerfully back to "Live". The shell could not fix it by naming the key,
// because the shell does not know which record is open — and the store had no way
// to reach a key by anything but its exact name.
//
// This drives the REAL SHELL: it renders `AppShell`, takes the `onReconnect` the
// component hands to `useRealtime`, and calls it. Asserting on `invalidatePrefix`
// directly would prove the store works and say nothing about whether anyone calls
// it — which was the entire bug.

import { act, cleanup, render, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TEAM_RESOURCES } from "@/lib/live-resources"
import { primeCache, readCache, useCached } from "@/lib/store"

/** The callbacks the shell hands the live layer. Captured, not stubbed away: this
 * is the only seam between "a socket came back" and the catch-up under test. */
const live: { onReconnect?: () => void; onUserReconnect?: () => void } = {}

vi.mock("@/lib/realtime", () => ({
  useRealtime: (_teamId: string | null, _onEvent: unknown, onReconnect?: () => void) => {
    live.onReconnect = onReconnect
    return "live"
  },
  useUserRealtime: (_userId: string | null, _onEvent: unknown, onReconnect?: () => void) => {
    live.onUserReconnect = onReconnect
    return "live"
  },
}))

// Everything below is scenery for this test: navigation, the permission gate, the
// cache prewarm and the three menus. None of them takes part in a catch-up, and
// each would otherwise open real requests in jsdom.
vi.mock("next/navigation", () => ({ usePathname: () => "/help" }))
vi.mock("@/lib/perms", () => ({ usePermissions: () => ({ can: () => true, loading: false }) }))
vi.mock("@/lib/use-team-prewarm", () => ({ useTeamPrewarm: () => {} }))
vi.mock("@/components/team-switcher", () => ({ TeamSwitcher: () => null }))
vi.mock("@/components/profile-menu", () => ({ ProfileMenu: () => null }))
vi.mock("@/components/create-team-dialog", () => ({ CreateTeamDialog: () => null }))

import { AppShell } from "@/components/app-shell"

const TEAM = "team-1"

// This workspace runs vitest WITHOUT globals, so testing-library's automatic
// cleanup never registers. Without this, a previous test's record screen is still
// MOUNTED and subscribed — so it refetches the key the next test just watched a
// reconnect drop, and an assertion that the key is gone fails for a reason that
// has nothing to do with the shell. (Seen, not guessed: it is how the first run
// of the last case in this file went red.) Every test also uses its own record
// id, so nothing rides on cleanup order either.
afterEach(cleanup)

const active = {
  loading: false,
  user: { id: "user-1", name: "A", email: "a@example.com" },
  ctx: { team: { id: TEAM, name: "Team" } },
  switchTeam: async () => {},
  createTeam: async () => {},
  refresh: async () => {},
} as never

function mountShell() {
  render(<AppShell active={active}>{null}</AppShell>)
  expect(live.onReconnect, "the shell must give the live layer a catch-up handler").toBeTypeOf(
    "function"
  )
}

/** A dropped socket that comes back. */
async function reconnect() {
  await act(async () => {
    live.onReconnect!()
  })
}

/** Mount a screen reading ONE key, exactly as a record detail does on a deep
 * link, and wait for its first read to land. `reads()` counts the questions that
 * screen has actually asked the server. */
async function openRecordScreen(key: string, value: unknown) {
  let fetches = 0
  const hook = renderHook(() =>
    useCached(key, async () => {
      fetches++
      return value
    })
  )
  await waitFor(() => expect(hook.result.current.data).toBeDefined())
  return { hook, reads: () => fetches }
}

beforeEach(() => {
  live.onReconnect = undefined
  live.onUserReconnect = undefined
})

describe("reconnect catches up the record someone is deep-linked to", () => {
  it("re-reads an open ticket whose collection was never loaded", async () => {
    const key = `help-one:ticket-a`
    const open = await openRecordScreen(key, { id: "ticket-a", status: "open" })
    expect(readCache(key), "the deep link holds the record and no list").toBeTruthy()
    expect(readCache(`help:${TEAM}`), "…the list is genuinely not loaded").toBeUndefined()
    expect(open.reads()).toBe(1)

    mountShell()
    await reconnect()

    // The record was re-read: the screen asked its own question again, which is
    // what "catch up, don't sit on it" means. Before this, the count stayed at 1
    // for as long as the person stayed on the page.
    await waitFor(() => expect(open.reads(), "the open record was never re-read").toBe(2))
    // EXACTLY once. One re-read per open screen is the catch-up; more than one is
    // the stampede the invalidate-don't-refetch choice exists to avoid.
    expect(open.reads()).toBe(2)
  })

  it("re-reads an open ARTICLE too — the rule is the registry's, not one screen's", async () => {
    const open = await openRecordScreen(`learning-one:article-b`, { id: "article-b", title: "Hi" })
    mountShell()
    await reconnect()
    await waitFor(() => expect(open.reads()).toBe(2))
  })

  it("catches up the tabs BESIDE the record, not only the record", async () => {
    // The same blind spot one layer out: a deep-linked ticket's conversation and
    // its Activity tab are keyed by the record id too, so `reconcile` could not
    // reach any of them either.
    const thread = await openRecordScreen(`help-thread:ticket-c`, [{ id: "m1" }])
    const feed = await openRecordScreen(`activity:record:help:ticket-c`, [{ id: "a1" }])
    mountShell()
    await reconnect()
    await waitFor(() => expect(thread.reads()).toBe(2))
    await waitFor(() => expect(feed.reads()).toBe(2))
  })

  it("drops an OFF-SCREEN record without re-pulling it", async () => {
    // The other half of "invalidate, don't refetch": a record opened earlier and
    // navigated away from is still in the cache. A reconnect must make it stale —
    // so the next visit is fresh — and must not spend a request on a screen
    // nobody is looking at.
    const key = `help-one:ticket-d`
    const open = await openRecordScreen(key, { id: "ticket-d" })
    open.hook.unmount()
    expect(readCache(key), "still cached after navigating away").toBeTruthy()

    mountShell()
    await reconnect()

    expect(readCache(key), "an off-screen record must be dropped, not left stale").toBeUndefined()
    expect(open.reads(), "…and nothing re-pulls it — the next reader will").toBe(1)
  })

  it("leaves unrelated caches alone", async () => {
    // The prefixes are the registry's record deps, not "everything with a colon".
    primeCache("team-meta:team-1", { name: "Team" })
    primeCache("import-batches:team-1", [{ id: "b1" }])
    mountShell()
    await reconnect()
    expect(readCache("team-meta:team-1")).toBeTruthy()
    expect(readCache("import-batches:team-1")).toBeTruthy()
  })
})

describe("the catch-up is derived from the live registry, not a hand-kept list", () => {
  it("covers every record-scoped dep every resource declares", async () => {
    // The check that keeps this true for a module written next year. Every dep
    // that carries a ROW id is a key `reconcile` cannot reach, so every one of
    // them must be dropped by a reconnect — no per-module memory required.
    const ROW = "row-e"
    const deps = new Set<string>()
    for (const r of Object.values(TEAM_RESOURCES))
      for (const dep of r.deps?.(TEAM, ROW) ?? []) if (dep.includes(ROW)) deps.add(dep)
    expect(deps.size, "no record-scoped deps found — this check has gone blind").toBeGreaterThan(4)

    // Seeded, never mounted, so what survives survived the reconnect rather than
    // being pulled back in by a subscriber.
    for (const key of deps) primeCache(key, { seeded: true })
    mountShell()
    await reconnect()

    const survivors = [...deps].filter((k) => readCache(k) !== undefined)
    expect(
      survivors,
      `a reconnect left these record caches untouched, so a deep link stays stale: ${survivors.join(", ")}`
    ).toEqual([])
  })
})
