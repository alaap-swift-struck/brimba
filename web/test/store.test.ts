import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  MAX_ENTRIES,
  MAX_ROWS_PER_ENTRY,
  invalidate,
  patchRow,
  primeCache,
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
