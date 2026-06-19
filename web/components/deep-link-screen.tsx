"use client"

// The deep-link resolver. Backs the whole /t/* tree from one static shell:
// reads /t/<teamId>/<module>/<id>/… from the URL (client-side — static export
// can't prerender ids), switches to that team if the link came from elsewhere,
// fetches the data + the caller's rights through the normal permission-checked
// endpoints, shapes it for the recipe, and renders the library ScreenRenderer.
// The engine emits navigate/close/tab intents which we map back to the URL.
//
// Milestone 1 wires the `members` module's detail screen. More modules + the
// list level + mutating actions follow (SCREEN-ENGINE-PLAN §10).

import * as React from "react"
import { useRouter } from "next/navigation"

import { Skeleton } from "@swift-struck/ui/registry/primitives/skeleton/skeleton"
import {
  ScreenRenderer,
  type ScreenData,
  type ScreenIntent,
} from "@swift-struck/ui/registry/collections/screen-renderer/screen-renderer"
import { type ScreenRights } from "@swift-struck/ui/lib/recipe"

import { AppShell, ShellLoading } from "@/components/app-shell"
import { tenancy } from "@/lib/api"
import { formatDate, formatDateTime } from "@/lib/format"
import { usePermissions } from "@/lib/perms"
import { useCached } from "@/lib/store"
import { useActiveTeam } from "@/lib/use-active-team"
import { resolveRecipe } from "@/lib/screens"
import type { TeamMember } from "@shared/types"

function fullName(m: TeamMember) {
  return [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email
}

export function DeepLinkScreen() {
  const active = useActiveTeam()
  const router = useRouter()

  // Static export → read the path + query on the client.
  const [loc, setLoc] = React.useState<{ teamId: string; module: string; id: string } | null>(null)
  const [noAccess, setNoAccess] = React.useState(false)
  React.useEffect(() => {
    const seg = window.location.pathname.split("/").filter(Boolean) // ["t",team,module,id]
    setLoc({ teamId: seg[1] ?? "", module: seg[2] ?? "", id: seg[3] ?? "" })
  }, [])

  const teamId = loc?.teamId ?? null
  const module = loc?.module ?? null
  const recordId = loc?.id ?? null

  // If the link points at a team we're not currently in, switch (server validates
  // membership; a non-member switch fails → no access).
  React.useEffect(() => {
    if (!teamId || !active.ctx?.team) return
    if (active.ctx.team.id !== teamId) {
      active.switchTeam(teamId).catch(() => setNoAccess(true))
    }
  }, [teamId, active])

  const onTeam = active.ctx?.team?.id === teamId
  const membersQ = useCached(
    teamId && onTeam && module === "members" ? `members:${teamId}` : null,
    () => tenancy.members().then((r) => r.members)
  )
  const activityQ = useCached(
    recordId && onTeam && module === "members" ? `activity:user:${recordId}` : null,
    () => tenancy.activity("user", recordId as string).then((r) => r.activity)
  )
  // The team's screen-recipe overrides (config store). The recipe is resolved
  // override-over-base; cache-first, defensive (no/bad override → base).
  const overridesQ = useCached(
    teamId && onTeam ? `screens:${teamId}` : null,
    () => tenancy.screenOverrides().then((r) => r.screens)
  )
  const { can } = usePermissions(onTeam ? teamId : null)

  if (active.loading || !active.ctx || !loc) return <ShellLoading />

  const teamName = active.ctx.team?.name ?? "Team"
  const member = (membersQ.data ?? []).find((m) => m.userId === recordId) ?? null

  // Shape the TeamMember into the flat record the recipe's columns reference, and
  // the activity feed into the engine's item shape. (The engine never sees app
  // types — the host does the shaping.)
  const record = member
    ? {
        id: member.userId,
        name: fullName(member),
        email: member.email,
        role: member.roleTitle,
        joined: formatDate(member.joinedAt),
        image: member.imageUrl ?? "",
      }
    : undefined
  const data: ScreenData = {
    record,
    sets: {
      activity: (activityQ.data ?? []).map((a) => ({
        id: a.id,
        description: a.description,
        actor: a.actorName ?? undefined,
        timestamp: formatDateTime(a.createdAt),
      })) as unknown as Record<string, unknown>[],
    },
  }
  const rights: ScreenRights = {
    team_members: {
      read: can("team_members", "read"),
      create: can("team_members", "create"),
      edit: can("team_members", "edit"),
      delete: can("team_members", "delete"),
    },
  }

  function onIntent(intent: ScreenIntent) {
    if (intent.kind === "close") router.back()
    else if (intent.kind === "open") router.push(`/t/${teamId}/${intent.module}/${intent.id}`)
    // tab intent: TabsView manages its own state; URL-tab sync lands in a later
    // milestone (keeps M1 free of re-render churn on every tab click).
  }

  // Override-over-base (config store). Base exists for members.detail, so this
  // is non-null in practice; the guard keeps it safe if a key is ever missing.
  const recipe = resolveRecipe("members.detail", overridesQ.data)

  const crumbs = [
    { label: "Settings", href: "/settings" },
    { label: teamName, href: "/settings/team?tab=members" },
    { label: member ? fullName(member) : "Member" },
  ]

  return (
    <AppShell active={active} breadcrumbs={crumbs}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {noAccess || membersQ.error ? (
          <p className="text-muted-foreground text-sm">
            You don&apos;t have access to this, or it doesn&apos;t exist.
          </p>
        ) : module !== "members" || !recordId ? (
          <p className="text-muted-foreground text-sm">That screen doesn&apos;t exist.</p>
        ) : !onTeam || membersQ.data === undefined ? (
          <Skeleton variant="list" lines={4} />
        ) : !member ? (
          <p className="text-muted-foreground text-sm">That member isn&apos;t on this team.</p>
        ) : !recipe ? (
          <p className="text-muted-foreground text-sm">That screen isn&apos;t available.</p>
        ) : (
          <ScreenRenderer
            recipe={recipe}
            data={data}
            rights={rights}
            onAction={() => {}}
            onIntent={onIntent}
          />
        )}
      </div>
    </AppShell>
  )
}
