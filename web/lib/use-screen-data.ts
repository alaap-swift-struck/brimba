"use client"

// useScreenData — the deep-link host's READ layer, lifted out of the component so
// the host reads as "fetch, then render" instead of a 70-line wall of queries.
//
// Every read is cache-first + null-keyed (a query whose key is null never fires),
// so a screen only fetches the modules it actually shows. The keys double as the
// live-sync + tab-count cache keys the rest of the app patches, so they must match
// the prefixes in pages.ts (LAW R8) and app-shell's realtime registry — don't
// rename one without the others. Roles / invites / dropdown values load across the
// whole team area (they back list + breadcrumb + a tab-count badge); members /
// learning / help / team-meta load only on their own module.

import * as React from "react"

import { tenancy } from "@/lib/api"
import { cursorKey, helpKey, listFetch, totalKey } from "@/lib/live-resources"
import { primeCache, useCached, useCachedValue } from "@/lib/store"

/** What the host needs to drive the reads: the resolved team, whether reads are
 * enabled (on-team + signed-in), the active module and the record id in view. */
export type ScreenDataInput = {
  teamId: string | null
  enabled: boolean
  module: string | null
  recordId: string | null
  /** which ticket set the help screen is showing — a SERVER scope (R14/R16). */
  helpScope?: "mine" | "all"
}

export function useScreenData({ teamId, enabled, module, recordId, helpScope = "all" }: ScreenDataInput) {
  const membersQ = useCached(
    enabled && module === "members" ? `members:${teamId}` : null,
    () => tenancy.members().then((r) => r.members)
  )
  // Roles back the roles list, the breadcrumb label, the change-role picker and
  // the invite form's role options — load them for the whole team area. The
  // listFetch fetchers ALSO prime each collection's exact `total:` sidecar (R16).
  const rolesQ = useCached(enabled ? `member_roles:${teamId}` : null, () =>
    listFetch.roles(teamId as string)
  )
  // Invites back the invites list AND the section-tab count badge, so load them
  // across the team area (cache-first + live, so the count stays honest).
  const invitesQ = useCached(enabled ? `invites:${teamId}` : null, () =>
    listFetch.invites(teamId as string)
  )
  const metaQ = useCached(enabled && module === "team" ? `team-meta:${teamId}` : null, () =>
    tenancy.teamMeta()
  )
  // Learning backs its list, the breadcrumb label and the article detail; load it
  // for the whole learning area (cache-first + row-level live, decision below).
  const learningQ = useCached(enabled && module === "learning" ? `learning:${teamId}` : null, () =>
    listFetch.learning(teamId as string)
  )
  // Help backs its list, the breadcrumb label and the ticket thread. R14: the
  // list is a PAGE, so My/All is a SERVER scope with its own cache — filtering a
  // loaded page client-side would disagree with the exact badge above it (R16).
  // The All cache is still the one the live registry patches row-by-row.
  const helpQ = useCached(enabled && module === "help" ? helpKey(teamId as string, "all") : null, () =>
    listFetch.help(teamId as string)
  )
  const helpMineQ = useCached(
    enabled && module === "help" && helpScope === "mine" ? helpKey(teamId as string, "mine") : null,
    () => listFetch.helpMine(teamId as string)
  )
  // The team's dropdown values — feed the help/learning forms' Type/Category pickers
  // AND the Dropdown-values tab's count badge, so load them across the team area
  // (cache-first + live, like roles/invites, so the count stays honest).
  const formSelectableQ = useCached(
    enabled ? `selectable:${teamId}` : null,
    () => listFetch.selectable(teamId as string)
  )
  // R16: the exact server totals the badges show (primed by the fetchers above;
  // bumped ±1 by add/remove pings; re-primed on reconnect). NEVER rows.length.
  const totals = {
    member_roles: useCachedValue<number>(enabled ? totalKey("member_roles", teamId as string) : null),
    invites: useCachedValue<number>(enabled ? totalKey("invites", teamId as string) : null),
    selectable: useCachedValue<number>(enabled ? totalKey("selectable", teamId as string) : null),
    learning: useCachedValue<number>(enabled ? totalKey("learning", teamId as string) : null),
    help: useCachedValue<number>(enabled ? totalKey("help", teamId as string) : null),
    helpMine: useCachedValue<number>(enabled ? totalKey("help-mine", teamId as string) : null),
  }
  const selectableValues = formSelectableQ.data ?? []
  // The list now includes DEACTIVATED values (so the manager can reactivate them),
  // so every form PICKER filters to `active` — a retired value never appears as a
  // pickable option (but old rows that referenced it still read truthfully).
  const activeSelectable = selectableValues.filter((v) => v.active)
  const helpTypeOptions = activeSelectable.filter((v) => v.type === "Help type").map((v) => v.value)
  const learningCategoryOptions = activeSelectable
    .filter((v) => v.type === "Learning category")
    .map((v) => v.value)
  const contentTypeOptions = activeSelectable.filter((v) => v.type === "File type").map((v) => v.value)

  // Activity is one read path over three scopes (team / a member / an invite) — the
  // scope is derived from what's in view, and its cache key mirrors the scope so a
  // live ping refreshes the right feed.
  const activityScope: "team" | "user" | "invite" | null =
    module === "team"
      ? "team"
      : module === "members" && recordId
        ? "user"
        : module === "invites" && recordId
          ? "invite"
          : null
  const activityKey =
    !enabled || !activityScope
      ? null
      : activityScope === "team"
        ? `activity:team:${teamId}`
        : `activity:${activityScope}:${recordId}`
  // R14: the feed is PAGED — page one lands here and parks its next cursor in the
  // sidecar <LoadMore> reads; R16: its exact (permission-filtered) total rides along.
  const activityQ = useCached(activityKey, () =>
    tenancy
      .activity(activityScope ?? "team", activityScope === "team" ? undefined : (recordId ?? undefined))
      .then((r) => {
        primeCache(cursorKey(activityKey as string), r.nextCursor)
        primeCache(`total:${activityKey}`, r.total)
        return r.activity
      })
  )
  // The invite-detail audit (inviter snapshot + acceptance) — only when viewing
  // one invite. Cache-first + live (a revoke/accept ping refreshes its invite row).
  const inviteAuditQ = useCached(
    enabled && module === "invites" && recordId ? `invite-audit:${recordId}` : null,
    () => tenancy.inviteAudit(recordId as string)
  )

  return {
    membersQ,
    rolesQ,
    invitesQ,
    metaQ,
    learningQ,
    helpQ,
    helpMineQ,
    totals,
    formSelectableQ,
    selectableValues,
    helpTypeOptions,
    learningCategoryOptions,
    contentTypeOptions,
    activityScope,
    activityKey,
    activityQ,
    inviteAuditQ,
  }
}
