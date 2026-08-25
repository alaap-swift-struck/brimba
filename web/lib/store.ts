"use client"

// A tiny cache-first data layer. It does two jobs that, together, make the app
// feel instant AND stay live:
//   • useCached(key, fetcher) returns the cached value IMMEDIATELY when we have
//     it (and refetches quietly in the background — "stale-while-revalidate"),
//     so screens after the first paint with no spinner.
//   • invalidate(key) drops an entry and tells anyone showing it to refetch —
//     this is what a live "X changed" ping calls, so data updates on its own.
//   • and it asks each question ONCE: callers that want the same key while it is
//     already on the wire share that one request (see `inflight`), so six
//     components wanting the same permissions cost one GET, not six.
// No dependency, ~one Map + a subscriber set. Reusable across every screen.

import * as React from "react"

// THE CEILING. Without one, the cache only ever grows: every record detail you
// open, every collection you visit and every sidecar they prime is a key of its
// own, and nothing removes a key except an explicit invalidate. A long session
// therefore holds every screen it has ever shown.
//
// In plain terms: this is "roughly 500 screens' worth of data". You would have to
// open around five hundred different records or lists in one sitting before the
// oldest one is dropped — and dropping it costs a refetch the next time you open
// it, nothing more. Anything currently ON SCREEN is never dropped (see
// `evictable`), so eviction can never blank a mounted screen.
export const MAX_ENTRIES = 500

// AND A CEILING ON THE ROWS INSIDE ONE ENTRY. The entry count alone does not
// bound memory: a paged collection APPENDS every page into the SAME key
// (CACHING §12), so one power user pressing Load more all afternoon grows a
// single entry without ever adding a second one. 500 entries is a real bound;
// 500 entries where one holds 200,000 tickets is not.
//
// In plain terms: "about forty pages deep". Past that, the OLDEST rows are
// dropped from the front — you keep everything you have scrolled back to
// recently, and the rows you passed hours ago are re-fetched if you go looking.
// Newest-first lists (the ones that page) are exactly the case where the far end
// is the least likely to be wanted again.
export const MAX_ROWS_PER_ENTRY = 2000

// A SHORT FRESHNESS WINDOW. Mounting used to revalidate UNCONDITIONALLY, so
// opening a record and pressing back re-read the whole collection you had been
// looking at a second earlier — the same answer, bought twice, on every hop.
//
// It is deliberately A FEW SECONDS. Live pings are what keep this cache honest
// (CACHING rule 3), and a longer window would quietly promote the cache itself to
// the freshness mechanism — which is the realtime layer's job, and would trade a
// saved round-trip for a stale screen. Five seconds only suppresses the refetch
// for a hop quick enough that no ping could plausibly have been missed inside it.
export const REVALIDATE_AFTER_MS = 5_000

// …AND A CEILING ON THAT TRUST. "Recently written" includes a row PATCHED in by a
// live ping, so a tab left open all day can ride single-row patches for hours and
// never re-read the collection as a whole — and anything that went missing
// outside a reconnect catch-up would sit there unnoticed. Past this age the next
// mount does a FULL read however recently a row was patched in.
//
// Generous ON PURPOSE: hours, not minutes. Make it small and it undoes cache-first
// for every ordinary session; it exists for the long-running tab, not the usual one.
export const MAX_AGE_MS = 4 * 60 * 60 * 1000

// "Used" means WRITTEN — fetched, primed or patched — not read. Every read in
// this app comes from a MOUNTED component, and a mounted component's key is
// already unevictable, so ordering by reads would buy nothing and would mean
// mutating the Map inside React's render-phase snapshot reads. Recency of the
// last WRITE is the honest signal for an unmounted key: it says when that data
// last arrived. (JS Maps keep insertion order, so the Map IS the LRU queue:
// delete+set moves a key to the young end, and eviction takes from the old end.)
const cache = new Map<string, unknown>()
const subscribers = new Map<string, Set<() => void>>()

/** WHEN each entry last changed, which is two different questions:
 *  • `written` — the last write of ANY kind (a fetch, a prime, a row patch).
 *    Answers "is this so fresh that a mount need not ask again" (REVALIDATE_AFTER_MS).
 *  • `fetched` — the last time the WHOLE entry came from the server. Answers "has
 *    this been kept alive on row patches so long that it deserves a real re-read"
 *    (MAX_AGE_MS). One stamp could not answer both: patches keep `written` young
 *    for ever, which is exactly the case the max age exists for.
 *
 * Kept in LOCKSTEP with `cache` — every key dropped there is dropped here too, or
 * this map becomes the unbounded growth the ceiling above exists to prevent. */
const stamps = new Map<string, { written: number; fetched: number }>()

/** What a shared request hands back. `current` is the important half: it says
 * whether this answer is still the one the cache wants. Anything that learns
 * something NEWER than what is on the wire (an `invalidate` from a live ping, a
 * row-level `patchRow`, a reconnect `reconcile`) drops the in-flight entry, and
 * a response that comes back afterwards sees `current: false` and is DISCARDED
 * rather than written — which is what stops a list that was already on the wire
 * painting over the row a live ping just patched in (CACHING rule 3). */
type Answer<T> = { value: T; current: boolean }

// IN-FLIGHT REQUESTS, keyed EXACTLY as the cache is — because this map answers
// the same question one step earlier. `cache.has(key)` says "do I already have
// this answer"; `inflight.has(key)` says "am I already ASKING". Every guard in
// this file used to be blind for the whole duration of a request, so a screen
// that mounts six components all wanting `my-perms:<teamId>` sent six identical
// GETs — nine of the twenty-four requests a cold help ticket makes were a
// question already on the wire (round-trip review, 2026-08-25).
//
// Entries are removed the moment a request settles, in BOTH outcomes, so this
// map only ever holds what is genuinely on the wire — it cannot grow.
const inflight = new Map<string, Promise<Answer<unknown>>>()

/** Ask a key's question ONCE. A caller arriving while the same key is already on
 * the wire awaits that request instead of opening a second one — one fetch, one
 * answer, however many components want it.
 *
 * The entry is cleared on REJECTION too. It has to be: leave a failed request
 * behind and the key is joined forever after by every later caller, so one
 * network blip would make it permanently unfetchable for the rest of the
 * session. A failure is simply "nobody is asking any more" — the next caller
 * asks again. */
/** De-duplicate any keyed read, for callers OUTSIDE the cache.
 *
 * `useActiveTeam` mounts twice — `agent-host` and `deep-link-screen` — and read
 * the session through `auth.me()` / `tenancy.active()` directly, so it was the one
 * caller in-flight de-duplication did not cover. Two extra requests on every cold
 * load, and enough to make `/home` fail the hop budget's own rule (10 requests for
 * 8 answers) while the budget said it passed. (round_trip round 4.)
 *
 * It shares the same map as the cache path, so a read here and a `useCached` on
 * the same key still join rather than race. */
export function dedupe<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  return sharedFetch(key, fetcher).then((a) => a.value)
}

function sharedFetch<T>(key: string, fetcher: () => Promise<T>): Promise<Answer<T>> {
  const joined = inflight.get(key)
  if (joined) return joined as Promise<Answer<T>>

  // Identity, not a flag: the map entry IS the claim on the key, so "am I still
  // the current request?" is `is the entry still mine`. A newer request that
  // replaced us must not have ITS entry deleted by our late response.
  const run: Promise<Answer<T>> = fetcher().then(
    (value) => {
      const current = inflight.get(key) === run
      if (current) inflight.delete(key)
      return { value, current }
    },
    (err) => {
      if (inflight.get(key) === run) inflight.delete(key)
      throw err
    }
  )
  inflight.set(key, run)
  return run
}

/** May this entry be dropped? Only when nothing on screen depends on it. */
function evictable(key: string): boolean {
  if (subscribers.get(key)?.size) return false // a mounted screen is showing it
  // A paged list's cursor sidecar (`cursor:<listKey>`) is read imperatively by
  // Load more (readCache), never subscribed — so it rides on its LIST's
  // subscription. Drop it while the list is up and page two silently vanishes.
  if (key.startsWith("cursor:") && subscribers.get(key.slice("cursor:".length))?.size) return false
  return true
}

/** Write an entry and keep the cache under its ceiling. The write itself always
 * succeeds: if every older entry is pinned (an unusually busy screen), we go
 * OVER the ceiling rather than blank something a user is looking at — a soft
 * ceiling that is always right beats a hard one that is sometimes wrong. */
function cacheSet(key: string, value: unknown, full = false): void {
  const now = Date.now()
  // `full` = this value is the WHOLE entry, straight from the server (a list read
  // or a reconnect catch-up), so it resets the max-age clock. A row patch or a
  // primed mutation result is a write but NOT a full read, and leaves it running.
  stamps.set(key, { written: now, fetched: full ? now : (stamps.get(key)?.fetched ?? now) })
  cache.delete(key) // re-insert at the young end (this is the "touch")
  // Trim a runaway collection from its OLD end. Paged lists are newest-first and
  // append downwards, so the rows past the ceiling are the ones scrolled furthest
  // back — the cheapest to lose and the least likely to be asked for again. The
  // cursor sidecar is untouched, so Load more still continues from where it was.
  cache.set(
    key,
    Array.isArray(value) && value.length > MAX_ROWS_PER_ENTRY ? value.slice(0, MAX_ROWS_PER_ENTRY) : value
  )
  if (cache.size <= MAX_ENTRIES) return
  for (const k of cache.keys()) {
    if (cache.size <= MAX_ENTRIES) break
    if (evictable(k)) {
      cache.delete(k) // silent: no notify, so nothing refetches
      stamps.delete(k) // lockstep — an entry's stamp must never outlive the entry
    }
  }
}

/** Should a MOUNT re-read this key? Yes when we hold nothing at all, when the last
 * write is older than the short window, or when the entry has been kept alive on
 * row patches past the max age without a full read. */
function staleOnMount(key: string): boolean {
  if (!cache.has(key)) return true
  const s = stamps.get(key)
  if (!s) return true
  const now = Date.now()
  return now - s.written >= REVALIDATE_AFTER_MS || now - s.fetched >= MAX_AGE_MS
}

function notify(key: string) {
  subscribers.get(key)?.forEach((fn) => fn())
}

/** A PREWARM IS A PAINT, NOT A READ. Seeding fills a cold key so the first tap
 * shows content instead of a skeleton — but the prewarm's fetchers are
 * deliberately THINNER than the screens' own: they do not prime the `total:`
 * sidecars the count badges render (R16). Leaving the entry UNSTAMPED is what
 * keeps the two honest — the screen still does its own, richer read on mount,
 * because the freshness window must never let a seed stand in for one. Without
 * this, entering a team and tapping a section inside the window showed the rows
 * and a blank badge. */
function seedCache(key: string, value: unknown): void {
  cacheSet(key, value)
  stamps.delete(key)
  notify(key)
}

/** Subscribe to a key's changes; returns the unsubscribe. The ONE place
 * subscriptions are registered, so "is anything showing this?" — the question
 * eviction turns on — has a single answer. */
function subscribeKey(key: string, fn: () => void): () => void {
  let subs = subscribers.get(key)
  if (!subs) subscribers.set(key, (subs = new Set()))
  subs.add(fn)
  return () => {
    subs.delete(fn)
    if (!subs.size) subscribers.delete(key) // else THIS map grows without bound
  }
}

/** Drop a cached entry and tell anyone showing it to refetch (live refresh). */
export function invalidate(key: string): void {
  cache.delete(key)
  // …and its freshness stamps, so a re-populated key can never inherit the age of
  // the entry a live ping just threw away.
  stamps.delete(key)
  // AND the request on the wire, which is now stale by the same argument that
  // just dropped the entry. Two failures this prevents, both real: a caller
  // arriving after the ping would otherwise JOIN an answer that predates the
  // change, and — the one that bites — that answer would land after the
  // row-level patch the ping caused and overwrite it. The live layer patches
  // single rows into these very caches on every ping (CACHING rule 3), so the
  // window is not theoretical.
  inflight.delete(key)
  notify(key)
}

/** Drop every LOADED entry whose key starts with `prefix`, and tell whoever is
 * showing them to refetch.
 *
 * The reconnect catch-up's reach into keys whose ids it does not know. `invalidate`
 * takes one exact key, and the shell knows the LISTS (`help:<teamId>`) but not
 * which RECORD someone is looking at — so a person deep-linked to one ticket
 * through a dropped socket was caught up on nothing at all: `reconcile` no-ops on a
 * collection that was never loaded, and their `help-one:<id>` was not a key anyone
 * could name. The screen sat still under a dot reading "Live".
 *
 * It walks the KEYS THE CACHE HOLDS, so a prefix nothing has loaded is free and
 * silent — no entry to drop, no subscriber to notify — and it drops each one
 * through `invalidate`, so the freshness stamps and the request on the wire are
 * cleared by the same code that clears them everywhere else. A second, private
 * copy of "what invalidate means" is exactly how a stale-read path gets back in
 * through the side door.
 *
 * Note this INVALIDATES rather than refetches: the next read is fresh, and a
 * screen nobody is looking at pays nothing. Re-pulling every record a long
 * session had ever opened would turn one blip into a stampede. */
export function invalidatePrefix(prefix: string): void {
  // Snapshot the keys: `invalidate` deletes from the very Map this iterates.
  for (const key of [...cache.keys()]) if (key.startsWith(prefix)) invalidate(key)
}

/** Seed/replace a cached entry — e.g. after a mutation returns fresh data, so
 * the screen updates instantly without a round-trip. */
export function primeCache(key: string, value: unknown): void {
  cacheSet(key, value)
  notify(key)
}

/** Peek at a cached value without subscribing (e.g. the live handler bumping a
 * primed `total:` sidecar by ±1 on an add/remove ping). */
export function readCache<T>(key: string): T | undefined {
  return cache.get(key) as T | undefined
}

/** Subscribe to a cached value WITHOUT a fetcher — for sidecar keys someone else
 * primes (R16: the `total:<resource>:<teamId>` totals a list fetcher primes from
 * the door's COUNT(*)). Returns undefined until primed; re-renders on every
 * prime/invalidate of the key. Never fetches — the data has one owner. */
export function useCachedValue<T>(key: string | null): T | undefined {
  const subscribe = React.useCallback(
    (fn: () => void) => (key ? subscribeKey(key, fn) : () => {}),
    [key]
  )
  return React.useSyncExternalStore(
    subscribe,
    () => (key ? (cache.get(key) as T | undefined) : undefined),
    () => undefined
  )
}

/** Background-PRIME a key ONLY if it's cold (nothing cached yet) — used to warm
 * always-needed team caches on team entry so the first tap paints from cache
 * instead of a skeleton. It NEVER overwrites a warm or live-patched entry (the
 * `has` guard) and NEVER surfaces an error (a prewarm failure is swallowed — the
 * screen's own useCached will fetch normally). Pure seeding: no cache-first paint
 * or row-level live-sync behaviour changes, it just fills a cold key earlier. */
export function primeCacheIfCold<T>(key: string, fetcher: () => Promise<T>): void {
  if (cache.has(key)) return
  // A PREWARM ASKS LAST, on purpose. It runs from a child effect (the team
  // shell) while the screens that actually need these keys ask from a parent
  // one, and effects commit child-first — so without this yield the prewarm
  // would win the de-duplication race and the real reader would join IT. That
  // is not a wash, because the two fetchers are NOT identical: the team-area
  // readers also prime each collection's exact `total:` sidecar (R16) and the
  // prewarm's do not, so the count badges would quietly go blank on team entry.
  // One microtask puts the prewarm behind every read in the same commit, so it
  // joins the richer request for free instead of replacing it with a poorer one.
  queueMicrotask(() => {
    if (cache.has(key)) return // a real read already landed — nothing to seed
    void sharedFetch(key, fetcher)
      .then(({ value, current }) => {
        // Re-check: a real fetch (useCached) or live patch may have landed while we
        // were in flight — don't clobber it with our (now possibly stale) result.
        if (current && !cache.has(key)) seedCache(key, value)
      })
      .catch(() => {
        /* a prewarm miss is silent — the screen fetches on mount as usual */
      })
  })
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
    cacheSet(key, next)
    // This row is newer than any list already on the wire, so drop that request:
    // its answer must not land on top of the patch (see `Answer.current`).
    inflight.delete(key)
    notify(key)
  } catch (e) {
    console.error("patchRow failed; invalidating", key, e)
    invalidate(key)
  }
}

function shallowEqualRow(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ak = Object.keys(a)
  if (ak.length !== Object.keys(b).length) return false
  for (const k of ak) if (a[k] !== b[k]) return false
  return true
}

/** RECONNECT catch-up (decision #10): after a dropped link, re-pull a whole
 * collection and PATCH the cached array by id rather than replacing it — update
 * the rows that actually changed, ADD ones that appeared while we were offline,
 * DROP ones that vanished, all in the server's order. Unchanged rows keep their
 * object identity, so React re-renders only what truly changed (no full-list
 * flush). No-op if the collection isn't loaded (nothing on screen to catch up);
 * a fetch hiccup falls back to a coarse invalidate so we never sit on stale data. */
export async function reconcile(
  key: string,
  idField: string,
  fetchList: () => Promise<Record<string, unknown>[]>
): Promise<void> {
  if (cache.get(key) === undefined) return // not loaded — nothing visible to catch up
  try {
    const rows = await fetchList()
    const prev = cache.get(key) as Record<string, unknown>[] | undefined
    if (prev === undefined) return
    const prevById = new Map(prev.map((r) => [r[idField], r]))
    const next = rows.map((row) => {
      const old = prevById.get(row[idField])
      return old && shallowEqualRow(old, row) ? old : row // reuse identity if unchanged
    })
    cacheSet(key, next, true) // a catch-up IS a full read — it resets the max age
    inflight.delete(key) // same reason as patchRow: we just fetched newer than the wire
    notify(key)
  } catch (e) {
    console.error("reconcile failed; invalidating", key, e)
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
      // ONE request per key, however many components mount wanting it: a caller
      // arriving while this key is already on the wire awaits that answer.
      const { value, current } = await sharedFetch(key, () => fetcherRef.current())
      // NOT current = something newer landed while we were on the wire (a live
      // ping's invalidate / row patch / reconnect catch-up). Our answer predates
      // it, so writing it would undo the update — and an `invalidate` has already
      // told every subscriber, this one included, to load again, so the key is
      // never left unsettled by dropping it here.
      if (!current) return
      cacheSet(key, value, true) // a real read of the whole entry — reset the max age
      if (!aliveRef.current) return
      setData(value)
      setError(null)
    } catch (e) {
      if (aliveRef.current) setError(e)
    } finally {
      if (aliveRef.current) setLoading(false)
    }
  }, [key])

  // What a live ping (`notify`) does to a MOUNTED subscriber. If the cache still
  // holds the key, the new value was written by `patchRow` / `reconcile` /
  // `primeCache` — so just re-render from it, NO refetch. This is what makes the
  // row-level patch actually stick: without it, every patch would be immediately
  // clobbered by a full-list GET (the subscriber refetching), defeating the whole
  // "patch the one row, never refetch the collection" goal. Only a cache MISS
  // (an `invalidate` cleared the key) falls through to a real refetch.
  const sync = React.useCallback(() => {
    if (!key) return
    if (cache.has(key)) {
      if (aliveRef.current) {
        setData(cache.get(key) as T)
        setLoading(false)
      }
    } else {
      void load()
    }
  }, [key, load])

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
    // Revalidate on mount (first load / navigation / team switch) — but NOT for an
    // entry written moments ago. A tap into a record and a press of back used to
    // re-read the collection every time, and `refresh()` is still there for a
    // caller that genuinely wants to ask again regardless.
    if (staleOnMount(key)) void load()

    const unsubscribe = subscribeKey(key, sync)
    return () => {
      aliveRef.current = false
      unsubscribe()
    }
  }, [key, load, sync])

  const refresh = React.useCallback(() => void load(), [load])
  return { data, loading, error, refresh }
}
