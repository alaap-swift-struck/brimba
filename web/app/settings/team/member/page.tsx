"use client"

// Member detail — a deep-linkable per-user record screen, opened by tapping a
// row in the Members list (/settings/team/member?id=<userId>). Static export
// can't prerender unknown ids, so the id is read CLIENT-side from the URL. It
// loads the active team's members (finds the one by userId) + that member's
// activity, and renders with the library RecordDetail + DescriptionList +
// ActivityFeed. Actions (none yet) gate by rights via usePermissions.

import * as React from "react"

import { Badge } from "@swift-struck/ui/registry/primitives/badge/badge"
import { Skeleton } from "@swift-struck/ui/registry/primitives/skeleton/skeleton"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@swift-struck/ui/registry/primitives/tabs/tabs"
import {
  RecordDetail,
  defaultRecordDetailConfig,
} from "@swift-struck/ui/registry/collections/record-detail/record-detail"
import {
  DescriptionList,
  defaultDescriptionListConfig,
} from "@swift-struck/ui/registry/collections/description-list/description-list"
import {
  ActivityFeed,
  defaultActivityFeedConfig,
} from "@swift-struck/ui/registry/collections/activity-feed/activity-feed"
import { ShieldCheck } from "lucide-react"

import { AppShell, ShellLoading } from "@/components/app-shell"
import { tenancy } from "@/lib/api"
import { formatDate, formatDateTime } from "@/lib/format"
import { usePermissions } from "@/lib/perms"
import { useCached } from "@/lib/store"
import { useActiveTeam } from "@/lib/use-active-team"
import type { TeamMember } from "@shared/types"

function fullName(m: TeamMember) {
  return [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email
}
function initials(m: TeamMember) {
  return (
    `${m.firstName?.[0] ?? ""}${m.lastName?.[0] ?? ""}`.toUpperCase() ||
    m.email[0]?.toUpperCase() ||
    "?"
  )
}

export default function MemberDetailPage() {
  const active = useActiveTeam()
  const teamId = active.ctx?.team?.id ?? null

  // Static export → read the member id from the URL on the client.
  const [memberId, setMemberId] = React.useState<string | null>(null)
  React.useEffect(() => {
    setMemberId(new URLSearchParams(window.location.search).get("id"))
  }, [])

  const membersQ = useCached(teamId ? `members:${teamId}` : null, () =>
    tenancy.members().then((r) => r.members)
  )
  const member = (membersQ.data ?? []).find((m) => m.userId === memberId) ?? null

  const activityQ = useCached(
    memberId ? `activity:user:${memberId}` : null,
    () => tenancy.activity("user", memberId as string).then((r) => r.activity)
  )

  // Rights mirror the server (no actions yet, but gated here for when they land).
  usePermissions(teamId)

  if (active.loading || !active.ctx) return <ShellLoading />
  const team = active.ctx.team

  return (
    <AppShell
      active={active}
      breadcrumbs={[
        { label: "Settings", href: "/settings" },
        { label: team?.name ?? "Team", href: "/settings/team?tab=members" },
        { label: member ? fullName(member) : "Member" },
      ]}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {membersQ.error ? (
          <p className="text-destructive text-sm">Couldn&apos;t load this member.</p>
        ) : membersQ.data === undefined ? (
          <Skeleton variant="list" lines={4} />
        ) : !member ? (
          <p className="text-muted-foreground text-sm">
            That member isn&apos;t on this team.
          </p>
        ) : (
          <RecordDetail
            config={defaultRecordDetailConfig}
            title={
              <span className="flex items-center gap-2">
                {fullName(member)}
                {member.isYou && (
                  <Badge variant="outline" className="text-[10px]">
                    You
                  </Badge>
                )}
              </span>
            }
            subtitle={member.email}
            avatarSrc={member.imageUrl ?? undefined}
            avatarFallback={initials(member)}
            actions={
              <Badge variant="secondary" className="gap-1">
                {member.isAdmin && <ShieldCheck className="size-3" />}
                {member.roleTitle}
              </Badge>
            }
          >
            <Tabs defaultValue="overview">
              <TabsList variant="line">
                <TabsTrigger value="overview" variant="line">
                  Overview
                </TabsTrigger>
                <TabsTrigger value="activity" variant="line">
                  Activity
                </TabsTrigger>
              </TabsList>
              <TabsContent value="overview">
                <DescriptionList
                  config={defaultDescriptionListConfig}
                  items={[
                    { label: "Role", value: member.roleTitle },
                    { label: "Joined", value: formatDate(member.joinedAt) },
                    { label: "Email", value: member.email },
                  ]}
                />
              </TabsContent>
              <TabsContent value="activity">
                {activityQ.error ? (
                  <p className="text-destructive text-sm">
                    Couldn&apos;t load activity.
                  </p>
                ) : activityQ.data === undefined ? (
                  <Skeleton variant="list" lines={4} />
                ) : (
                  <ActivityFeed
                    config={{
                      ...defaultActivityFeedConfig,
                      // Server already returns newest-first; the display
                      // timestamp is a localized string, so don't re-sort by it.
                      newestFirst: false,
                      emptyText: "No activity for this member yet.",
                    }}
                    items={activityQ.data.map((a) => ({
                      id: a.id,
                      description: a.description,
                      actor: a.actorName ?? undefined,
                      timestamp: formatDateTime(a.createdAt),
                    }))}
                  />
                )}
              </TabsContent>
            </Tabs>
          </RecordDetail>
        )}
      </div>
    </AppShell>
  )
}
