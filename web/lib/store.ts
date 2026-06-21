"use client"

// A tiny cache-first data layer. It does two jobs that, together, make the app
// feel instant AND stay live:
//   • useCached(key, fetcher) returns the cached value IMMEDIATELY when we have
//     it (and refetches quietly in the background — "stale-while-revalidate"),
//     so screens after the first paint with no spinner.
//   • invalidate(key) drops an entry and tells anyone showing it to refetch —
//     this is what a live "X changed" ping calls, so data updates on its own.
// No dependency, ~one Map + a subscriber set. Reusable across every screen.

import * as React from "react"

const cache = new Map<string, unknown>()
const subscribers = new Map<string, Set<() => void>>()

function notify(key: string) {
  subscribers.get(key)?.forEach((fn) => fn())
}

/** Drop a cached entry and tell anyone showing it to refetch (live refresh). */
export function invalidate(key: string): void {
  cache.delete(key)
  notify(key)
}

/** Seed/replace a cached entry — e.g. after a mutation returns fresh data, so
 * the screen updates instantly without a round-trip. */
export function primeCache(key: string, value: unknown): void {
  cache.set(key, value)
  notify(key)
}

/** ROW-LEVEL live patch: a "row X in this collection changed" ping lands → fetch
 * just that one row (through the permission-checked endpoint) and update ONLY it
 * in the cached list — never refetch the whole collection. The single-row read
 * passes the SAME server filter as the list, so a row that no longer belongs
 * (e.g. a deactivated member) comes back null and is dropped. If the collection
 * isn't loaded (nothing on screen to patch) we do nothing; a fetch hiccup falls
 * back to a coarse invalidate so we never sit on stale data. */
export async function patchRow(
  key: string,
  idField: string,
  id: string,
  fetchOne: () => Promise<Record<string, unknown> | null>
): Promise<void> {
  const cur = cache.get(key) as Record<string, unknown>[] | undefined
  if (cur === undefined) return // not loaded — nothing visible to patch
  try {
    const row = await fetchOne()
    const latest = cache.get(key) as Record<string, unknown>[] | undefined
    if (latest === undefined) return
    let next: Record<string, unknown>[]
    if (row == null) {
      next = latest.filter((r) => r[idField] !== id) // gone / no longer belongs
    } else {
      const idx = latest.findIndex((r) => r[idField] === id)
      next = idx >= 0 ? latest.map((r, i) => (i === idx ? row : r)) : [row, ...latest]
    }
    cache.set(key, next)
    notify(key)
  } catch (e) {
    console.error("patchRow failed; invalidating", key, e)
    invalidate(key)
  }
}

export function useCached<T>(
  key: string | null,
  fetcher: () => Promise<T>
): { data: T | undefined; loading: boolean; error: unknown; refresh: () => void } {
  const [data, setData] = React.useState<T | undefined>(
    key ? (cache.get(key) as T | undefined) : undefined
  )
  const [loading, setLoading] = React.useState<boolean>(key ? !cache.has(key) : false)
  const [error, setError] = React.useState<unknown>(null)

  const fetcherRef = React.useRef(fetcher)
  fetcherRef.current = fetcher
  const aliveRef = React.useRef(true)

  const load = React.useCallback(async () => {
    if (!key) return
    try {
      const value = await fetcherRef.current()
      cache.set(key, value)
      if (!aliveRef.current) return
      setData(value)
      setError(null)
    } catch (e) {
      if (aliveRef.current) setError(e)
    } finally {
      if (aliveRef.current) setLoading(false)
    }
  }, [key])

  React.useEffect(() => {
    aliveRef.current = true
    if (!key) return
    if (cache.has(key)) {
      // Cached → show instantly, revalidate quietly.
      setData(cache.get(key) as T)
      setLoading(false)
    } else {
      setData(undefined)
      setLoading(true)
    }
    void load()

    const subs = subscribers.get(key) ?? new Set<() => void>()
    subs.add(load)
    subscribers.set(key, subs)
    return () => {
      aliveRef.current = false
      subs.delete(load)
    }
  }, [key, load])

  const refresh = React.useCallback(() => void load(), [load])
  return { data, loading, error, refresh }
}
