import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { invalidate, patchRow, primeCache, reconcile, useCached } from "@/lib/store"

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
