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
import { Pencil } from "lucide-react"

import { AppShell, ShellLoading } from "@/components/app-shell"
import { MembersPanel } from "@/components/members-panel"
import { RolesPanel } from "@/components/roles-panel"
import { tenancy } from "@/lib/api"
import { useCached } from "@/lib/store"
import { useActiveTeam } from "@/lib/use-active-team"
import { TEAM_TABS, type TeamTab } from "@/lib/pages"

type TabKey = TeamTab["key"]

function readTabFromUrl(): TabKey {
  if (typeof window === "undefined") return "members"
  const t = new URLSearchParams(window.location.search).get("tab")
  return t === "roles" || t === "invites" ? t : "members"
}

export default function TeamDetailPage() {
  const active = useActiveTeam()
  const router = useRouter()
  const teamId = active.ctx?.team?.id ?? null

  const [tab, setTab] = React.useState<TabKey>("members")
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
          <Button variant="outline" size="sm" disabled className="shrink-0 gap-1.5">
            <Pencil className="size-3.5" />
            Edit team
            <Badge variant="outline" className="text-[10px]">Soon</Badge>
          </Button>
        </div>

        {/* Tabs */}
        {!perms ? (
          <Skeleton variant="list" lines={4} />
        ) : (
          <>
            <div className="border-b">
              <div className="-mb-px flex gap-1">
                {visibleTabs.map((t) => {
                  const isActive = t.key === tab
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => selectTab(t.key)}
                      aria-current={isActive ? "page" : undefined}
                      className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? "border-primary text-foreground"
                          : "text-muted-foreground hover:text-foreground border-transparent"
                      }`}
                    >
                      {t.title}
                      {t.soon && (
                        <Badge variant="outline" className="text-[10px]">Soon</Badge>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="animate-rise">
              {tab === "members" && <MembersPanel active={active} />}
              {tab === "roles" && <RolesPanel active={active} />}
              {tab === "invites" && (
                <p className="text-muted-foreground py-8 text-center text-sm">
                  Invites are coming in the next build.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
