import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import {
  MAX_AGE_MS,
  MAX_ENTRIES,
  MAX_ROWS_PER_ENTRY,
  REVALIDATE_AFTER_MS,
  invalidate,
  patchRow,
  primeCache,
  primeCacheIfCold,
  readCache as peek,
  reconcile,
  useCached,
  useCachedValue,
} from "@/lib/store"

type Row = Record<string, unknown>

// The cache is a module singleton; give each test its own key so nothing bleeds.
let n = 0
const freshKey = () => `k-${++n}`

/** Seed a collection into the cache the way the app does — mount useCached,
 * let its initial stale-while-revalidate load settle, then UNMOUNT so there are
 * no live subscribers. With nobody subscribed, patchRow/reconcile's notify()
 * won't trigger a background refetch that would clobber what we just wrote — so
 * we can assert exactly what those functions put in the cache. Returns the rows
 * now in the cache (object identities preserved by the seed load). */
async function seedCollection(key: string, seed: Row[]): Promise<Row[]> {
  const hook = renderHook(() => useCached<Row[]>(key, async () => seed))
  await waitFor(() => expect(hook.result.current.data).toEqual(seed))
  const inCache = hook.result.current.data!
  hook.unmount()
  return inCache
}

/** Read what's currently in the cache for a key WITHOUT triggering a refetch
 * that could overwrite it: useCached seeds its state synchronously from the
 * cache on first render, so the very first `result.current.data` is the cached
 * value (read before the effect's revalidation resolves). */
function readCache(key: string): Row[] | undefined {
  // Fetcher won't have run yet at the synchronous read below.
  const { result } = renderHook(() => useCached<Row[]>(key, async () => []))
  return result.current.data
}

describe("primeCache + useCached + invalidate", () => {
  it("primeCache makes data appear immediately (no spinner)", () => {
    const key = freshKey()
    const seed = [{ id: "1" }]
    primeCache(key, seed)
    // Fetcher returns the same seed so the quiet revalidation is a no-op.
    const { result } = renderHook(() => useCached<Row[]>(key, async () => seed))
    expect(result.current.data).toEqual([{ id: "1" }])
    expect(result.current.loading).toBe(false)
  })

  it("invalidate drops the entry and triggers a refetch", async () => {
    const key = freshKey()
    let served: Row[] = [{ id: "old" }]
    const { result } = renderHook(() => useCached<Row[]>(key, async () => served))
    await waitFor(() => expect(result.current.data).toEqual([{ id: "old" }]))

    served = [{ id: "new" }]
    await act(async () => {
      invalidate(key)
    })
    await waitFor(() => expect(result.current.data).toEqual([{ id: "new" }]))
  })
})

// IN-FLIGHT DE-DUPLICATION. `cache.has(key)` is still FALSE for every caller
// while the first fetch is on the wire, so before this every guard in the store
// was blind for the whole duration of a request: six components wanting
// `my-perms:<teamId>` sent six identical GETs, nine of the twenty-four a cold
// help ticket makes (round-trip review, 2026-08-25).
describe("one question is asked ONCE (in-flight de-duplication)", () => {
  /** A fetcher whose every call is held open, so a request can be observed
   * WHILE it is on the wire — which is the entire window this feature exists
   * for. Returns the recorded calls: `calls.length` is requests sent. */
  function heldFetcher<T>() {
    const calls: Array<{ resolve: (v: T) => void; reject: (e: unknown) => void }> = []
    const fetch = () =>
      new Promise<T>((resolve, reject) => {
        calls.push({ resolve, reject })
      })
    return { calls, fetch }
  }

  it("several components mounting on the same key send ONE request", async () => {
    const key = freshKey()
    let fetches = 0
    const fetcher = async () => {
      fetches++
      return [{ id: "a" }]
    }
    // Six components in ONE commit, exactly like the six `my-perms` callers.
    const { result } = renderHook(() => [
      useCached<Row[]>(key, fetcher),
      useCached<Row[]>(key, fetcher),
      useCached<Row[]>(key, fetcher),
      useCached<Row[]>(key, fetcher),
      useCached<Row[]>(key, fetcher),
      useCached<Row[]>(key, fetcher),
    ])

    await waitFor(() => expect(result.current[0].data).toBeDefined())
    expect(fetches, "six callers, one request").toBe(1)
    // …and every one of them is served, not just the caller that won the race.
    for (const q of result.current) expect(q.data).toEqual([{ id: "a" }])
  })

  it("a caller arriving mid-flight joins the request instead of opening its own", async () => {
    const key = freshKey()
    const { calls, fetch } = heldFetcher<Row[]>()

    const first = renderHook(() => useCached<Row[]>(key, fetch))
    expect(calls).toHaveLength(1) // on the wire, nothing cached yet

    const second = renderHook(() => useCached<Row[]>(key, fetch))
    expect(calls, "the second caller must await the first answer").toHaveLength(1)

    await act(async () => {
      calls[0].resolve([{ id: "shared" }])
    })
    expect(first.result.current.data).toEqual([{ id: "shared" }])
    expect(second.result.current.data).toEqual([{ id: "shared" }])
  })

  it("a PREWARM joins a screen's read rather than replacing its fetcher", async () => {
    // The prewarm runs from a child effect and the screens that need these keys
    // read from a parent one, so first-come would hand the key to the prewarm —
    // whose fetchers do NOT prime the `total:` sidecars the badges render (R16).
    // A prewarm must therefore ask LAST: join the richer request, never own it.
    const key = freshKey()
    let prewarmFetches = 0
    let screenFetches = 0

    primeCacheIfCold(key, async () => {
      prewarmFetches++
      return [{ id: "from-prewarm" }]
    })
    const { result } = renderHook(() =>
      useCached<Row[]>(key, async () => {
        screenFetches++
        return [{ id: "from-screen" }]
      })
    )

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(prewarmFetches, "the prewarm must not open a second request").toBe(0)
    expect(screenFetches).toBe(1)
    expect(result.current.data, "the screen's own fetcher is the one that ran").toEqual([
      { id: "from-screen" },
    ])
  })

  it("still fetches when nobody else is asking (a prewarm still warms a cold key)", async () => {
    const key = freshKey()
    primeCacheIfCold(key, async () => [{ id: "seeded" }])
    await waitFor(() => expect(peek(key)).toEqual([{ id: "seeded" }]))
  })
})

// TRAP 1. An `invalidate` is a live ping saying "what you hold is out of date".
// If it left the in-flight entry alone, the answer already on the wire — which
// PREDATES the change that caused the ping — would be joined by later callers
// and, worse, would land on top of the row-level patch the ping produced.
describe("invalidate drops the request on the wire, not just the entry", () => {
  it("a caller after the ping asks again instead of joining the stale answer", async () => {
    const key = freshKey()
    const calls: Array<(v: Row[]) => void> = []
    const fetch = () => new Promise<Row[]>((resolve) => calls.push(resolve))

    const first = renderHook(() => useCached<Row[]>(key, fetch))
    expect(calls).toHaveLength(1)
    first.unmount() // nobody subscribed, so the refetch below is the NEW caller's

    invalidate(key) // a live ping
    renderHook(() => useCached<Row[]>(key, fetch))

    expect(calls, "the discarded request must not be joined").toHaveLength(2)
  })

  it("a response already on the wire cannot overwrite the row a live ping patched in", async () => {
    const key = freshKey()
    const calls: Array<(v: Row[]) => void> = []
    const hook = renderHook(
      () => useCached<Row[]>(key, () => new Promise<Row[]>((resolve) => calls.push(resolve)))
    )
    expect(calls).toHaveLength(1) // the list read is on the wire

    // The live ping lands: its dependent keys are invalidated and the changed
    // row is patched into the cache (CACHING rule 3).
    await act(async () => {
      invalidate(key)
      primeCache(key, [{ id: "a", v: 99 }])
    })

    // …and only NOW does the request that was already on the wire come back.
    await act(async () => {
      calls[0]([{ id: "a", v: 1 }])
    })

    expect(peek(key), "the stale answer must be discarded, not written").toEqual([
      { id: "a", v: 99 },
    ])
    expect(hook.result.current.data).toEqual([{ id: "a", v: 99 }])
  })

  it("a row patch is not undone by the list read that was already on the wire", async () => {
    const key = freshKey()
    await seedCollection(key, [{ id: "a", v: 1 }])
    const calls: Array<(v: Row[]) => void> = []
    const hook = renderHook(
      () => useCached<Row[]>(key, () => new Promise<Row[]>((resolve) => calls.push(resolve)))
    )
    // The seed landed a moment ago, so the freshness window means the MOUNT does
    // not re-ask. What this test needs is a list read IN FLIGHT when the patch
    // lands — not the particular thing that opened it.
    act(() => {
      hook.result.current.refresh()
    })
    expect(calls, "the list read is on the wire").toHaveLength(1)

    await act(async () => {
      await patchRow(key, "id", "a", async () => ({ id: "a", v: 99 }))
    })
    await act(async () => {
      calls[0]([{ id: "a", v: 1 }]) // the pre-ping list finally answers
    })

    expect(peek(key)).toEqual([{ id: "a", v: 99 }])
    expect(hook.result.current.data).toEqual([{ id: "a", v: 99 }])
  })
})

// THE FRESHNESS WINDOW. Mounting used to revalidate UNCONDITIONALLY, so opening a
// record and pressing back re-read the collection you had been looking at a second
// earlier — the same answer, bought twice, on every hop. The window is deliberately
// a FEW SECONDS: live pings are what keep this cache honest (CACHING rule 3), so it
// may only cover a hop too quick for a ping to have been missed inside it.
describe("a mount does not re-ask for something that just arrived", () => {
  /** Drive `Date.now` for the age-dependent cases. Asserting that the FETCHER RAN
   * is synchronous (renderHook flushes the effect), so the clock is restored
   * before anything has to await — no faked clock is ever left under `waitFor`. */
  function atTime(ms: number) {
    return vi.spyOn(Date, "now").mockReturnValue(ms)
  }

  it("skips the revalidation when the entry was written moments ago", async () => {
    const key = freshKey()
    let fetches = 0
    const fetcher = async () => {
      fetches++
      return [{ id: "a" }]
    }

    const first = renderHook(() => useCached<Row[]>(key, fetcher))
    await waitFor(() => expect(first.result.current.data).toBeDefined())
    expect(fetches).toBe(1)
    first.unmount()

    // Straight back to the screen you just left.
    const second = renderHook(() => useCached<Row[]>(key, fetcher))
    expect(second.result.current.data, "painted from cache, instantly").toEqual([{ id: "a" }])
    expect(fetches, "inside the window the hop costs nothing").toBe(1)
  })

  it("asks again once the window has passed", async () => {
    const key = freshKey()
    let fetches = 0
    const fetcher = async () => {
      fetches++
      return [{ id: "a" }]
    }
    const first = renderHook(() => useCached<Row[]>(key, fetcher))
    await waitFor(() => expect(first.result.current.data).toBeDefined())
    first.unmount()

    const clock = atTime(Date.now() + REVALIDATE_AFTER_MS + 1)
    const second = renderHook(() => useCached<Row[]>(key, fetcher))
    expect(fetches, "past the window, a mount revalidates as it always did").toBe(2)
    clock.mockRestore()
    await waitFor(() => expect(second.result.current.data).toEqual([{ id: "a" }]))
  })

  it("re-reads a long-lived entry that live patches kept looking fresh", async () => {
    // The case MAX_AGE_MS exists for. A tab open all day rides live pings, and
    // every patch re-stamps the entry as "just written" — so the short window on
    // its own would mean the collection is never read whole again, and anything
    // missed outside a reconnect would sit there unnoticed for hours.
    const key = freshKey()
    let fetches = 0
    const fetcher = async () => {
      fetches++
      return [{ id: "a", v: 1 }]
    }
    const first = renderHook(() => useCached<Row[]>(key, fetcher))
    await waitFor(() => expect(first.result.current.data).toBeDefined())
    first.unmount()
    expect(fetches).toBe(1)

    // Hours later a ping patches one row in, so the entry is "written" right now.
    const clock = atTime(Date.now() + MAX_AGE_MS + 1_000)
    await patchRow(key, "id", "a", async () => ({ id: "a", v: 2 }))
    const second = renderHook(() => useCached<Row[]>(key, fetcher))
    expect(fetches, "a patch cannot keep an entry young for ever").toBe(2)
    clock.mockRestore()
    await waitFor(() => expect(second.result.current.data).toBeDefined())
  })

  it("a PREWARM paints but never stands in for the screen's own read", async () => {
    // The prewarm's fetchers are deliberately thinner than the screens' — they do
    // not prime the `total:` sidecars the count badges render (R16). If a seed
    // counted as a read, entering a team and tapping a section inside the window
    // would show the rows and a blank badge.
    const key = freshKey()
    primeCacheIfCold(key, async () => [{ id: "seeded" }])
    await waitFor(() => expect(peek(key)).toEqual([{ id: "seeded" }]))

    let screenFetches = 0
    const { result } = renderHook(() =>
      useCached<Row[]>(key, async () => {
        screenFetches++
        return [{ id: "real" }]
      })
    )
    expect(result.current.data, "painted from the seed — no skeleton").toEqual([{ id: "seeded" }])
    expect(screenFetches, "…and the screen's own, richer read still runs").toBe(1)
    await waitFor(() => expect(result.current.data).toEqual([{ id: "real" }]))
  })

  it("an explicit refresh() always asks, window or not", async () => {
    const key = freshKey()
    let fetches = 0
    const fetcher = async () => {
      fetches++
      return [{ id: "a" }]
    }
    const { result } = renderHook(() => useCached<Row[]>(key, fetcher))
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(fetches).toBe(1)

    await act(async () => {
      result.current.refresh()
    })
    expect(fetches, "the window is for mounts; asking on purpose still asks").toBe(2)
  })
})

// TRAP 2. A failed request must LEAVE the map. If it stayed, every later caller
// would join a promise that is already rejected, so one network blip would make
// the key permanently unfetchable for the rest of the session.
describe("a rejected request never poisons its key", () => {
  it("the next caller asks again, and succeeds", async () => {
    const key = freshKey()
    let attempts = 0
    const failing = renderHook(() =>
      useCached<Row[]>(key, async () => {
        attempts++
        throw new Error("network blip")
      })
    )
    await waitFor(() => expect(failing.result.current.error).toBeTruthy())
    failing.unmount()

    const retry = renderHook(() =>
      useCached<Row[]>(key, async () => {
        attempts++
        return [{ id: "recovered" }]
      })
    )
    await waitFor(() => expect(retry.result.current.data).toEqual([{ id: "recovered" }]))
    expect(attempts, "the failure was cleared, so the retry was a real request").toBe(2)
  })

  it("every joined caller sees the failure — none is left waiting for ever", async () => {
    const key = freshKey()
    const calls: Array<(e: unknown) => void> = []
    const fetch = () => new Promise<Row[]>((_resolve, reject) => calls.push(reject))

    const first = renderHook(() => useCached<Row[]>(key, fetch))
    const second = renderHook(() => useCached<Row[]>(key, fetch))
    expect(calls).toHaveLength(1)

    await act(async () => {
      calls[0](new Error("network blip"))
    })

    expect(first.result.current.error).toBeTruthy()
    expect(second.result.current.error, "the joiner is told too").toBeTruthy()
    expect(first.result.current.loading).toBe(false)
    expect(second.result.current.loading).toBe(false)
  })
})

describe("patchRow", () => {
  it("updates an existing row in place", async () => {
    const key = freshKey()
    await seedCollection(key, [
      { id: "a", v: 1 },
      { id: "b", v: 1 },
    ])

    await patchRow(key, "id", "b", async () => ({ id: "b", v: 99 }))

    expect(readCache(key)).toEqual([
      { id: "a", v: 1 },
      { id: "b", v: 99 },
    ])
  })

  it("PREPENDS a row whose id isn't present", async () => {
    const key = freshKey()
    await seedCollection(key, [{ id: "a", v: 1 }])

    await patchRow(key, "id", "z", async () => ({ id: "z", v: 7 }))

    expect(readCache(key)).toEqual([
      { id: "z", v: 7 },
      { id: "a", v: 1 },
    ])
  })

  it("DROPS the row when fetchOne returns null", async () => {
    const key = freshKey()
    await seedCollection(key, [
      { id: "a", v: 1 },
      { id: "b", v: 1 },
    ])

    await patchRow(key, "id", "a", async () => null)

    expect(readCache(key)).toEqual([{ id: "b", v: 1 }])
  })

  it("is a no-op when the key was never loaded (fetchOne never called)", async () => {
    const key = freshKey()
    let called = false
    await patchRow(key, "id", "a", async () => {
      called = true
      return { id: "a" }
    })
    expect(called).toBe(false)

    // And the cache is still empty → a fresh hook has to load (starts loading).
    const { result } = renderHook(() => useCached<Row[]>(key, async () => [{ id: "loaded" }]))
    expect(result.current.loading).toBe(true)
  })

  it("falls back to invalidate when fetchOne throws (entry dropped → refetch)", async () => {
    const key = freshKey()
    let served: Row[] = [{ id: "a", v: 1 }]
    const { result } = renderHook(() => useCached<Row[]>(key, async () => served))
    await waitFor(() => expect(result.current.data).toEqual([{ id: "a", v: 1 }]))

    served = [{ id: "a", v: 2 }] // what a refetch would now serve
    await act(async () => {
      await patchRow(key, "id", "a", async () => {
        throw new Error("boom")
      })
    })
    // invalidate dropped the entry and notified → the hook refetched fresh data.
    await waitFor(() => expect(result.current.data).toEqual([{ id: "a", v: 2 }]))
  })
})

describe("reconcile", () => {
  it("applies add + edit + drop in the fetchList's order", async () => {
    const key = freshKey()
    await seedCollection(key, [
      { id: "a", v: 1 },
      { id: "b", v: 1 },
      { id: "c", v: 1 }, // will be removed
    ])

    await reconcile(key, "id", async () => [
      { id: "b", v: 2 }, // edited
      { id: "d", v: 1 }, // brand-new
      { id: "a", v: 1 }, // unchanged (order differs from the original)
    ])

    expect(readCache(key)).toEqual([
      { id: "b", v: 2 },
      { id: "d", v: 1 },
      { id: "a", v: 1 },
    ])
  })

  it("keeps object identity (===) for an unchanged row", async () => {
    const key = freshKey()
    const before = await seedCollection(key, [
      { id: "a", v: 1 },
      { id: "b", v: 1 },
    ])
    const a = before[0]
    const b = before[1]

    // reconcile returns its OWN fresh objects; an unchanged row should keep the
    // old identity (shallow-equal reuse), a changed one should be replaced.
    await reconcile(key, "id", async () => [
      { id: "a", v: 1 }, // same field values → reuse the old object
      { id: "b", v: 2 }, // changed → new object
    ])

    const next = readCache(key)!
    expect(next[0]).toBe(a) // identity reused
    expect(next[1]).not.toBe(b) // changed row replaced
    expect(next[1]).toEqual({ id: "b", v: 2 })
  })

  it("is a no-op when the collection isn't loaded", async () => {
    const key = freshKey()
    let called = false
    await reconcile(key, "id", async () => {
      called = true
      return []
    })
    expect(called).toBe(false)
  })
})

// THE CEILING. These deliberately OVERFLOW the shared module cache, so every
// test here (and every test after it) seeds its own key rather than relying on
// anything an earlier test left behind. Every number is derived from
// MAX_ENTRIES, so raising the ceiling can never leave a test asserting an old one.
describe("the cache is bounded (LRU)", () => {
  const overflow = () => {
    for (let i = 0; i < MAX_ENTRIES + 50; i++) primeCache(`flood-${i}`, [{ id: String(i) }])
  }

  it("drops the OLDEST entries once the ceiling is passed, and keeps the newest", () => {
    const oldest = freshKey()
    primeCache(oldest, [{ id: "old" }])
    expect(peek(oldest)).toBeDefined()

    overflow()

    expect(peek(oldest), "an unsubscribed entry older than the ceiling must be dropped").toBeUndefined()
    expect(peek(`flood-${MAX_ENTRIES + 49}`), "the newest write must survive").toBeDefined()
  })

  it("a WRITE moves an entry to the young end, so a hot key outlives a cold one", () => {
    const hot = freshKey()
    const cold = freshKey()
    primeCache(hot, [{ id: "hot" }])
    primeCache(cold, [{ id: "cold" }])
    primeCache(hot, [{ id: "hot", again: true }]) // touched → youngest

    overflow()

    expect(peek(cold), "the untouched entry is the older one — it goes first").toBeUndefined()
    // `hot` was re-written after `cold`, so of the two it is the survivor for
    // longer; with a full flood both eventually go, which is the point of a cap.
    expect(peek(hot) ?? peek(cold)).toBeUndefined()
  })

  it("bounds the ROWS inside one entry — a paged list appends into the same key", () => {
    // The entry count alone does not bound memory. A growing collection pages
    // into ONE key (CACHING §12), so an afternoon of Load more grows a single
    // entry without ever adding a second.
    const key = freshKey()
    const rows = Array.from({ length: MAX_ROWS_PER_ENTRY + 500 }, (_, i) => ({ id: String(i) }))
    primeCache(key, rows)

    const held = peek<{ id: string }[]>(key)!
    expect(held.length, "trimmed to the ceiling").toBe(MAX_ROWS_PER_ENTRY)
    expect(held[0].id, "the NEWEST rows are kept — paged lists are newest-first").toBe("0")
    expect(held[held.length - 1].id).toBe(String(MAX_ROWS_PER_ENTRY - 1))
  })

  it("leaves a normal-sized collection completely alone", () => {
    const key = freshKey()
    const rows = Array.from({ length: 50 }, (_, i) => ({ id: String(i) }))
    primeCache(key, rows)
    expect(peek<{ id: string }[]>(key)).toHaveLength(50)
  })

  it("NEVER evicts an entry a mounted screen is showing", async () => {
    const key = freshKey()
    const { result } = renderHook(() => useCached<Row[]>(key, async () => [{ id: "on-screen" }]))
    await waitFor(() => expect(result.current.data).toEqual([{ id: "on-screen" }]))

    await act(async () => {
      overflow()
    })

    expect(peek(key), "a subscribed key must survive any amount of pressure").toEqual([
      { id: "on-screen" },
    ])
    expect(result.current.data, "and the mounted screen must not blank").toEqual([{ id: "on-screen" }])
  })

  it("NEVER evicts a paged list's cursor sidecar while the list is mounted", async () => {
    const key = freshKey()
    const cursor = `cursor:${key}`
    const { result } = renderHook(() => useCached<Row[]>(key, async () => [{ id: "page-one" }]))
    await waitFor(() => expect(result.current.data).toBeDefined())
    primeCache(cursor, "opaque-cursor-for-page-two")

    await act(async () => {
      overflow()
    })

    // Load more reads this imperatively (never subscribes); dropping it while the
    // list is up would silently make page two unreachable.
    expect(peek(cursor)).toBe("opaque-cursor-for-page-two")
  })

  it("keeps a subscribed sidecar (a count badge) too", async () => {
    const total = `total:${freshKey()}`
    primeCache(total, 42)
    const { result } = renderHook(() => useCachedValue<number>(total))
    expect(result.current).toBe(42)

    await act(async () => {
      overflow()
    })

    expect(peek(total)).toBe(42)
  })

  it("forgets a key's subscriber set when the last subscriber leaves", async () => {
    // The subscriber map is the other map that could grow for ever: an empty Set
    // left behind per key is a leak with a different name.
    const key = freshKey()
    const hook = renderHook(() => useCached<Row[]>(key, async () => [{ id: "a" }]))
    await waitFor(() => expect(hook.result.current.data).toBeDefined())
    hook.unmount()

    // With nobody subscribed the entry is now an ordinary eviction candidate.
    overflow()
    expect(peek(key)).toBeUndefined()
  })
})

describe("live subscriber — a row patch is NOT clobbered by a refetch (regression)", () => {
  it("a MOUNTED list re-renders from the patched row, without re-running its list fetcher", async () => {
    const key = freshKey()
    let listFetches = 0
    const seed = [
      { id: "a", v: 1 },
      { id: "b", v: 1 },
    ]
    const { result } = renderHook(() =>
      useCached<Row[]>(key, async () => {
        listFetches++
        return seed.map((r) => ({ ...r })) // fresh objects each GET, like the real API
      })
    )
    // revalidate-on-mount ran exactly once
    await waitFor(() => expect(result.current.data).toEqual(seed))
    expect(listFetches).toBe(1)

    // a live ping patches ONE row while the list is on screen
    await act(async () => {
      await patchRow(key, "id", "b", async () => ({ id: "b", v: 99 }))
    })

    // the mounted hook shows the patched row …
    expect(result.current.data).toEqual([
      { id: "a", v: 1 },
      { id: "b", v: 99 },
    ])
    // … and the patch did NOT trigger a full-list refetch (the defeated-optimization
    // bug the adversarial review found: notify() must re-render from cache, not refetch).
    expect(listFetches).toBe(1)
  })
})
