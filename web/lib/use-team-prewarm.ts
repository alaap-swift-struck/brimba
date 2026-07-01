"use client"

// Kills the first-tap-per-module blank. On entering /t the in-memory cache Map
// starts empty, so the very first tap into a team tab shows a skeleton for a full
// round-trip. This hook background-primes ONLY the cheap, always-needed team-wide
// caches the moment the team shell mounts (or the team changes), so those taps
// paint from cache instead.
//
// It seeds through primeCacheIfCold, which fires each fetch in parallel, guards on
// `cache.has` (so it NEVER overwrites a warm or live-patched entry), and swallows
// any error. These are the EXACT keys + fetchers the team-area hooks use
// (deep-link-screen's roles/invites/selectable + perms' my-perms), so a prewarmed
// key is byte-for-byte what useCached would have fetched. It does NOT prewarm
// learning/help (module-scoped — may never be visited) or members (loaded only on
// the members tab, not team-wide). Pure seeding: no cache-first or live-sync change.

import * as React from "react"

import { tenancy } from "@/lib/api"
import { primeCacheIfCold } from "@/lib/store"

export function useTeamPrewarm(teamId: string | null): void {
  React.useEffect(() => {
    if (!teamId) return
    // Reads with no dependency between them — fire them all in parallel. Each is
    // cold-guarded and error-swallowed inside primeCacheIfCold, so a prewarm can
    // never surface an error or clobber a live entry.
    primeCacheIfCold(`member_roles:${teamId}`, () => tenancy.roles().then((r) => r.roles))
    primeCacheIfCold(`invites:${teamId}`, () => tenancy.invites().then((r) => r.invites))
    primeCacheIfCold(`selectable:${teamId}`, () => tenancy.selectable().then((r) => r.values))
    primeCacheIfCold(`my-perms:${teamId}`, () => tenancy.myPermissions().then((r) => r.permissions))
  }, [teamId])
}
