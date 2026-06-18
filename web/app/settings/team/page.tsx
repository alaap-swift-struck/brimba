"use client"

// Team detail — the active team's header + tabs (Members · Member roles ·
// Invites). The Members/Roles screens live here now (as panels). Tabs you lack
// read access to are hidden; deep-linking to one falls back to an allowed tab
// (or Home if you can see none) — page-level visibility, enforced server-side too.

import * as React from "react"
import { useRouter } from "next/navigation"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@swift-struck/ui/registry/primitives/avatar/avatar"
import { Badge } from "@swift-struck/ui/registry/primitives/badge/badge"
import { Button } from "@swift-struck/ui/registry/primitives/button/button"
import { Skeleton } from "@swift-struck/ui/registry/primitives/skeleton/skeleton"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@swift-struck/ui/registry/primitives/tabs/tabs"
import { Pencil } from "lucide-react"

import { AppShell, ShellLoading } from "@/components/app-shell"
import { ErrorBoundary } from "@/components/error-boundary"
import { MembersPanel } from "@/components/members-panel"
import { RolesPanel } from "@/components/roles-panel"
import { InvitesPanel } from "@/components/invites-panel"
import { TeamOverviewPanel, TeamActivityPanel } from "@/components/team-meta-panels"
import { TeamEditDialog } from "@/components/team-edit-dialog"
import { tenancy } from "@/lib/api"
import { useCached } from "@/lib/store"
import { useActiveTeam } from "@/lib/use-active-team"
import { TEAM_TABS, type TeamTab } from "@/lib/pages"

type TabKey = TeamTab["key"]

function readTabFromUrl(): TabKey {
  if (typeof window === "undefined") return "members"
  const t = new URLSearchParams(window.location.search).get("tab")
  return t === "roles" || t === "invites" || t === "overview" || t === "activity"
    ? (t as TabKey)
    : "members"
}

export default function TeamDetailPage() {
  const active = useActiveTeam()
  const router = useRouter()
  const teamId = active.ctx?.team?.id ?? null

  const [tab, setTab] = React.useState<TabKey>("members")
  const [editingTeam, setEditingTeam] = React.useState(false)
  React.useEffect(() => setTab(readTabFromUrl()), [])

  function selectTab(k: TabKey) {
    setTab(k)
    window.history.replaceState(null, "", `/settings/team?tab=${k}`)
  }

  // Your own rights → which tabs you may see (server enforces per request too).
  const permsQ = useCached(teamId ? `my-perms:${teamId}` : null, () =>
    tenancy.myPermissions().then((r) => r.permissions)
  )
  const perms = permsQ.data
  const visibleTabs = React.useMemo(
    () => (perms ? TEAM_TABS.filter((t) => perms[t.module]?.read) : []),
    [perms]
  )

  // Keep the selected tab valid; bounce to Home if you can see none.
  React.useEffect(() => {
    if (!perms) return
    if (visibleTabs.length === 0) {
      router.replace("/")
      return
    }
    if (!visibleTabs.some((t) => t.key === tab)) setTab(visibleTabs[0].key)
  }, [perms, visibleTabs, tab, router])

  if (active.loading || !active.ctx) return <ShellLoading />
  const team = active.ctx.team

  return (
    <AppShell
      active={active}
      breadcrumbs={[
        { label: "Settings", href: "/settings" },
        { label: team?.name ?? "Team", href: "/settings/team" },
      ]}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {/* Team header */}
        <div className="animate-rise flex items-center gap-4">
          <Avatar className="size-14">
            {team?.logoUrl && <AvatarImage src={team.logoUrl} alt={team.name} />}
            <AvatarFallback className="text-xl">
              {team?.name?.[0]?.toUpperCase() ?? "?"}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{team?.name}</h1>
            <div className="text-muted-foreground mt-1 flex items-center gap-2 text-sm">
              {active.ctx.role && <Badge variant="secondary">{active.ctx.role.title}</Badge>}
              <span>
                {active.ctx.memberCount} member{active.ctx.memberCount === 1 ? "" : "s"}
              </span>
            </div>
          </div>
          {perms?.teams?.edit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditingTeam(true)}
              className="shrink-0 gap-1.5"
            >
              <Pencil className="size-3.5" />
              Edit team
            </Button>
          )}
        </div>

        {/* Tabs */}
        {!perms ? (
          <Skeleton variant="list" lines={4} />
        ) : (
          <Tabs
            value={tab}
            onValueChange={(v) => selectTab(v as TabKey)}
            className="animate-rise"
          >
            <TabsList variant="line">
              {visibleTabs.map((t) => (
                <TabsTrigger
                  key={t.key}
                  value={t.key}
                  variant="line"
                  badge={t.soon ? "Soon" : undefined}
                  badgeVariant="outline"
                >
                  {t.title}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="overview">
              <ErrorBoundary label="Overview">
                <TeamOverviewPanel active={active} />
              </ErrorBoundary>
            </TabsContent>
            <TabsContent value="members">
              <ErrorBoundary label="Members">
                <MembersPanel active={active} />
              </ErrorBoundary>
            </TabsContent>
            <TabsContent value="roles">
              <ErrorBoundary label="Member roles">
                <RolesPanel active={active} />
              </ErrorBoundary>
            </TabsContent>
            <TabsContent value="invites">
              <ErrorBoundary label="Invites">
                <InvitesPanel active={active} />
              </ErrorBoundary>
            </TabsContent>
            <TabsContent value="activity">
              <ErrorBoundary label="Activity">
                <TeamActivityPanel active={active} />
              </ErrorBoundary>
            </TabsContent>
          </Tabs>
        )}
      </div>

      <TeamEditDialog
        open={editingTeam}
        onOpenChange={setEditingTeam}
        team={active.ctx.team}
        onSaved={active.refresh}
      />
    </AppShell>
  )
}
