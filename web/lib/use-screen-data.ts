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

import { content as contentApi, tenancy } from "@/lib/api"
import { useCached } from "@/lib/store"

/** What the host needs to drive the reads: the resolved team, whether reads are
 * enabled (on-team + signed-in), the active module and the record id in view. */
export type ScreenDataInput = {
  teamId: string | null
  enabled: boolean
  module: string | null
  recordId: string | null
}

export function useScreenData({ teamId, enabled, module, recordId }: ScreenDataInput) {
  // Per-team screen-recipe overrides (config store) — load across the team area.
  const overridesQ = useCached(enabled ? `screens:${teamId}` : null, () =>
    tenancy.screenOverrides().then((r) => r.screens)
  )
  const membersQ = useCached(
    enabled && module === "members" ? `members:${teamId}` : null,
    () => tenancy.members().then((r) => r.members)
  )
  // Roles back the roles list, the breadcrumb label, the change-role picker and
  // the invite form's role options — load them for the whole team area.
  const rolesQ = useCached(enabled ? `member_roles:${teamId}` : null, () =>
    tenancy.roles().then((r) => r.roles)
  )
  // Invites back the invites list AND the section-tab count badge, so load them
  // across the team area (cache-first + live, so the count stays honest).
  const invitesQ = useCached(enabled ? `invites:${teamId}` : null, () =>
    tenancy.invites().then((r) => r.invites)
  )
  const metaQ = useCached(enabled && module === "team" ? `team-meta:${teamId}` : null, () =>
    tenancy.teamMeta()
  )
  // Learning backs its list, the breadcrumb label and the article detail; load it
  // for the whole learning area (cache-first + row-level live, decision below).
  const learningQ = useCached(enabled && module === "learning" ? `learning:${teamId}` : null, () =>
    contentApi.learning().then((r) => r.learning)
  )
  // Help backs its list (All set), the breadcrumb label and the ticket thread.
  // ONE cache holds the whole team's tickets (the live registry patches it
  // row-by-row); the My/All toggle filters that set client-side by raiser.
  const helpQ = useCached(enabled && module === "help" ? `help:${teamId}` : null, () =>
    contentApi.help("all").then((r) => r.tickets)
  )
  // The team's dropdown values — feed the help/learning forms' Type/Category pickers
  // AND the Dropdown-values tab's count badge, so load them across the team area
  // (cache-first + live, like roles/invites, so the count stays honest).
  const formSelectableQ = useCached(
    enabled ? `selectable:${teamId}` : null,
    () => tenancy.selectable().then((r) => r.values)
  )
  const selectableValues = formSelectableQ.data ?? []
  const helpTypeOptions = selectableValues.filter((v) => v.type === "Help type").map((v) => v.value)
  const learningCategoryOptions = selectableValues
    .filter((v) => v.type === "Learning category")
    .map((v) => v.value)
  const contentTypeOptions = selectableValues.filter((v) => v.type === "File type").map((v) => v.value)

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
  const activityQ = useCached(activityKey, () =>
    tenancy
      .activity(activityScope ?? "team", activityScope === "team" ? undefined : (recordId ?? undefined))
      .then((r) => r.activity)
  )
  // The invite-detail audit (inviter snapshot + acceptance) — only when viewing
  // one invite. Cache-first + live (a revoke/accept ping refreshes its invite row).
  const inviteAuditQ = useCached(
    enabled && module === "invites" && recordId ? `invite-audit:${recordId}` : null,
    () => tenancy.inviteAudit(recordId as string)
  )

  return {
    overridesQ,
    membersQ,
    rolesQ,
    invitesQ,
    metaQ,
    learningQ,
    helpQ,
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
