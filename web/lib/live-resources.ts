"use client"

// The LIVE-LISTENER registry (R15): every resource string any worker publishes
// must REACH a listener here — a row-level entry (TEAM_RESOURCES), a coarse
// invalidation (SIMPLE_INVALIDATIONS), or a reasoned DEAF_EXEMPT entry in the
// rules registry. Publishing to nobody is the silent half of the stale-screen
// bug, so the check derives the publisher set by scanning publishChange calls
// and fails the build on any resource no listener claims. Lives in lib (not the
// shell component) so the check can import it as data.
//
// The list fetchers here ALSO prime the `total:` sidecar each door now returns
// (R16): a badge shows the server COUNT(*), never rows.length, so whoever pulls
// a list primes its total in the same round-trip.

import { content as contentApi, tenancy } from "@/lib/api"
import { patchRow, primeCache, readCache } from "@/lib/store"

/** The sidecar cache key holding a collection's exact server total (R16). */
export function totalKey(prefix: string, teamId: string): string {
  return `total:${prefix}:${teamId}`
}

/** The sidecar holding a PAGED collection's next opaque cursor (R14), keyed off
 * the list's own cache key. `null` in the sidecar means "that was the last page";
 * `undefined` means nothing has loaded yet. */
export function cursorKey(listKey: string): string {
  return `cursor:${listKey}`
}

/** After a CREATE: put the new row into the loaded list and record the
 * collection's exact new total (R21). A create door hands back the ROW, never the
 * collection — this is the ONE seam that turns that row into a live screen
 * update, and it does it through `patchRow`, exactly as an "add" ping would. So
 * the person who created the row and everyone else see the same thing, and an
 * unloaded list is correctly a no-op.
 *
 * `append` puts it at the END instead of the head — for an oldest-first thread. */
/**
 * LAW R23's client half: fold the ONE row a mutation handed back into the list
 * already on screen.
 *
 * This is the same move a live ping makes (CACHING rule 3 — patch the changed
 * row, never refetch the collection). The mutation's own response used to
 * contradict that rule: it shipped the whole list back, so the acting client
 * replaced everything it was showing while every OTHER client patched one row.
 * Two different update paths for the same event, and the expensive one belonged
 * to the person who was actually waiting.
 *
 * A NULL row is meaningful, not missing: it means the record no longer belongs
 * in this list — removed from the team, deactivated out of the active view — so
 * the row is DROPPED. That is why the id is passed separately; without it there
 * would be nothing left to identify what to remove.
 */
export async function applyUpdated<T extends Record<string, unknown>>(opts: {
  listKey: string
  id: string
  row: T | null | undefined
  total?: number
  totalCacheKey?: string
  idField?: string
}): Promise<void> {
  const { listKey, id, row, total, totalCacheKey, idField = "id" } = opts
  await patchRow(listKey, idField, id, async () => row ?? null)
  if (totalCacheKey && typeof total === "number") primeCache(totalCacheKey, total)
}

export async function applyCreated<T extends Record<string, unknown>>(opts: {
  listKey: string
  created: T | null | undefined
  total?: number
  totalCacheKey?: string
  idField?: string
  append?: boolean
}): Promise<void> {
  const { listKey, created, total, totalCacheKey, idField = "id", append } = opts
  if (created) {
    if (append) {
      const cur = readCache<T[]>(listKey)
      if (cur && !cur.some((r) => r[idField] === created[idField]))
        primeCache(listKey, [...cur, created])
    } else {
      await patchRow(listKey, idField, String(created[idField]), async () => created)
    }
  }
  if (totalCacheKey && typeof total === "number") primeCache(totalCacheKey, total)
}

/** Fetch the NEXT page of a paged collection and APPEND it to the loaded prefix —
 * never a refetch of what's already on screen. Returns false when there was
 * nothing more to load (so the caller can stop asking). The cursor is opaque: it
 * only ever travels cache → door → cache. */
export async function loadMore<T>(
  listKey: string,
  fetchPage: (cursor: string) => Promise<{ rows: T[]; nextCursor: string | null }>
): Promise<boolean> {
  const cursor = readCache<string | null>(cursorKey(listKey))
  if (!cursor) return false
  const next = await fetchPage(cursor)
  primeCache(listKey, [...(readCache<T[]>(listKey) ?? []), ...next.rows])
  primeCache(cursorKey(listKey), next.nextCursor)
  return true
}

/** List fetchers that prime their collection's `total:` sidecar as they load —
 * shared by the screen reads (use-screen-data) and reconnect catch-up below, so
 * a total can never go stale while its list is fresh. */
export const listFetch = {
  roles: (teamId: string) =>
    tenancy.roles().then((r) => {
      primeCache(totalKey("member_roles", teamId), r.total)
      return r.roles
    }),
  invites: (teamId: string) =>
    tenancy.invites().then((r) => {
      primeCache(totalKey("invites", teamId), r.total)
      return r.invites
    }),
  selectable: (teamId: string) =>
    tenancy.selectable().then((r) => {
      primeCache(totalKey("selectable", teamId), r.total)
      return r.values
    }),
  learning: (teamId: string) =>
    contentApi.learning().then((r) => {
      primeCache(totalKey("learning", teamId), r.total)
      return r.learning
    }),
  // R14: help is PAGED — the fetchers below load page ONE and park the next
  // cursor in its sidecar; <LoadMore> appends from there. A fresh load (or a
  // reconnect catch-up) resets to page one, which is what a reconnect should do.
  help: (teamId: string) =>
    contentApi.help("all").then((r) => {
      primeCache(totalKey("help", teamId), r.total)
      primeCache(totalKey("help-mine", teamId), r.mineTotal)
      primeCache(cursorKey(helpKey(teamId, "all")), r.nextCursor)
      return r.tickets
    }),
  helpMine: (teamId: string) =>
    contentApi.help("mine").then((r) => {
      primeCache(totalKey("help", teamId), r.total)
      primeCache(totalKey("help-mine", teamId), r.mineTotal)
      primeCache(cursorKey(helpKey(teamId, "mine")), r.nextCursor)
      return r.tickets
    }),
}

/** The ticket list's cache key. My/All is a SERVER scope, not a client filter:
 * once a list is paged, filtering the loaded page by raiser would show "my
 * tickets in the newest 50" under a badge counting all of them (R16). */
export function helpKey(teamId: string, scope: "mine" | "all"): string {
  return scope === "mine" ? `help-mine:${teamId}` : `help:${teamId}`
}

/** Row-level live registry: a "<resource> row <id> changed" ping → re-pull JUST
 * that row and patch it into the cached list (never refetch the whole list);
 * then refresh the small dependent aggregations/feeds coarsely. Adding a module
 * = ONE entry here; the shell's handler stays generic. */
export const TEAM_RESOURCES: Record<
  string,
  {
    key: (teamId: string) => string
    idField: string
    fetchOne: (id: string) => Promise<Record<string, unknown> | null>
    /** re-pull the WHOLE list — used by reconnect catch-up to diff-patch it. */
    fetchList: (teamId: string) => Promise<Record<string, unknown>[]>
    /** small dependent caches to coarse-invalidate (aggregations / feeds). */
    deps?: (teamId: string, id: string) => string[]
    /** refresh the active-team context (e.g. the section member count). */
    refreshCtx?: boolean
  }
> = {
  members: {
    key: (t) => `members:${t}`,
    idField: "userId",
    fetchOne: (id) => tenancy.member(id),
    fetchList: () => tenancy.members().then((r) => r.members),
    deps: (t, id) => [`member_roles:${t}`, `activity:user:${id}`],
    refreshCtx: true,
  },
  member_roles: {
    key: (t) => `member_roles:${t}`,
    idField: "id",
    fetchOne: (id) => tenancy.role(id),
    fetchList: (t) => listFetch.roles(t),
    // `activity:record:member_roles:` was missing: a role's row and its access
    // rights refreshed live, but the Activity tab RIGHT BESIDE THEM did not — so
    // two admins editing one role each saw only their own history until they
    // navigated away and back. R2 gives every record an Activity tab; R15 is what
    // makes it true a second time.
    deps: (t, id) => [`my-perms:${t}`, `role-perms:${id}`, `activity:record:member_roles:${id}`],
  },
  invites: {
    key: (t) => `invites:${t}`,
    idField: "id",
    fetchOne: (id) => tenancy.invite(id),
    fetchList: (t) => listFetch.invites(t),
    // The invite detail also shows the invite_logs audit + that invite's activity;
    // refresh both when the invite row changes (revoke/accept) so the detail stays live.
    deps: (_t, id) => [`invite-audit:${id}`, `activity:invite:${id}`],
  },
  // Dropdown values — row-level live (was a DEAF publisher before R15: the worker
  // pinged `selectable_data` and nothing listened, so a teammate's edit left the
  // manager stale until a reload).
  selectable_data: {
    key: (t) => `selectable:${t}`,
    idField: "id",
    fetchOne: (id) => tenancy.selectableOne(id),
    fetchList: (t) => listFetch.selectable(t),
  },
  // Learning content — row-level live. An edit / (de)activate elsewhere patches
  // just that article in the cached list; the row read passes the team filter so a
  // genuinely-gone item drops out. (Done toggles are personal, not broadcast.)
  learning: {
    key: (t) => `learning:${t}`,
    idField: "id",
    fetchOne: (id) => contentApi.learningOne(id),
    fetchList: (t) => listFetch.learning(t),
    // This entry had no `deps` at all, which cost two live screens:
    //
    // `learning-one:` — the article detail reads the LIST cache when it holds the
    // record and this single-row key otherwise, which is every deep link and every
    // fresh tab. `patchRow` above only touches the list, so on that path the ping
    // landed on a key nobody was reading and the screen sat still.
    //
    // `activity:record:learning:` — the Activity tab beside it. Help has always
    // refreshed its record feed on a ping and learning never did, so "who changed
    // this, and when" went stale under a teammate's edit. An article is the one
    // record a whole team reads at once, so that is the version of this bug most
    // people would actually meet.
    deps: (_t, id) => [`learning-one:${id}`, `activity:record:learning:${id}`],
  },
  // Help tickets — row-level live. A status change / new reply (postHelpReply
  // pings `help` too) patches just that ticket in the cached "all" set.
  help: {
    key: (t) => `help:${t}`,
    idField: "id",
    fetchOne: (id) => contentApi.helpOne(id),
    fetchList: (t) => listFetch.help(t),
    // A status change / edit / reply / stakeholder-add on a ticket also refreshes
    // its Activity tab, its Stakeholders tab AND ITS CONVERSATION. The My list is a
    // SERVER-scoped page, so it can't be row-patched from here — drop it and it
    // reloads page one.
    //
    // `help-thread:` was missing until 2026-08-25, and a `DEAF_EXEMPT` entry
    // explained the absence by claiming the parent ping "refreshes the open
    // ticket's deps" — which is what this array IS, and it did not contain the
    // thread. Two people replying to one ticket each saw only their own replies
    // until they navigated away and back, and the reply-count badge was stale with
    // it. An exemption that describes a mechanism has to name a mechanism that
    // exists. (Realtime review, 2026-08-25.)
    //
    // `help-one:` is the same shape of gap one layer down: the ticket detail
    // reads the loaded list when it holds the ticket and this single-row key
    // otherwise — a deep link, a fresh tab, or (since R14 paged this list) any
    // ticket past the loaded page, which is an ordinary case now rather than a
    // rare one. `patchRow` only reaches the list, so without this the ping
    // arrived and the open ticket did not move.
    deps: (t, id) => [
      `activity:record:help:${id}`,
      `help-stakeholders:${id}`,
      `help-mine:${t}`,
      `help-thread:${id}`,
      `total:help-thread:${id}`,
      `help-one:${id}`,
    ],
  },
}

/** Coarse listeners for resources with no row-shaped cache: the ping just drops
 * these keys (cache-first refetch on next read). Part of the R15 listener set. */
export const SIMPLE_INVALIDATIONS: Record<string, (teamId: string) => string[]> = {
  // Team name/logo — the shell also refreshes the active context (see app-shell).
  team: (t) => [`team-meta:${t}`],
  // Import history. A batch has no row-shaped cache — the import screen reads the
  // whole summary list under one key — so a ping just drops it and the next read
  // refetches. TEAM-wide is right: `listBatchSummaries` is deliberately team
  // visible (who imported what, into which tables, with the totals), unlike the
  // working batch, which stays creator-scoped.
  //
  // NOTE: nothing publishes `data_import_batches` yet, so this listener is ready
  // and idle. The worker half is one line beside the publishes already in
  // workers/data-ops/src/routes/import.ts — until it lands, an import's progress
  // is invisible to everyone (the runner included) until someone refreshes.
  data_import_batches: (t) => [`import-batches:${t}`],
}
