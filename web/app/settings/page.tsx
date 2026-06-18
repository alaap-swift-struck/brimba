"use client"

// Settings — your Account (profile) and your Teams. Tapping a team makes it
// active and opens its detail (members, roles, invites live there). Flat design.

import * as React from "react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@swift-struck/ui/registry/primitives/avatar/avatar"
import { Badge } from "@swift-struck/ui/registry/primitives/badge/badge"
import { Button } from "@swift-struck/ui/registry/primitives/button/button"
import { Skeleton } from "@swift-struck/ui/registry/primitives/skeleton/skeleton"
import {
  ActivityFeed,
  defaultActivityFeedConfig,
} from "@swift-struck/ui/registry/collections/activity-feed/activity-feed"
import { useRouter } from "next/navigation"
import { ChevronRight, Mail } from "lucide-react"

import { AppShell, ShellLoading } from "@/components/app-shell"
import { EmailChangeDialog } from "@/components/email-change-dialog"
import { InvitationsPanel, useReceivedInvites } from "@/components/invitations"
import { ProfileDialog } from "@/components/profile-dialog"
import { auth } from "@/lib/api"
import { formatDateTime } from "@/lib/format"
import { useCached } from "@/lib/store"
import { useActiveTeam } from "@/lib/use-active-team"

export default function SettingsPage() {
  const active = useActiveTeam()
  const router = useRouter()
  const [editing, setEditing] = React.useState(false)
  const [changingEmail, setChangingEmail] = React.useState(false)
  const { loading, ctx, user } = active
  const pendingInvites = useReceivedInvites().data ?? []
  const accountActivityQ = useCached("account-activity", () =>
    auth.activity().then((r) => r.activity)
  )

  async function openTeam(teamId: string) {
    if (teamId !== ctx?.team?.id) await active.switchTeam(teamId)
    router.push("/settings/team")
  }

  if (loading || !ctx) return <ShellLoading />

  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "You"

  return (
    <AppShell active={active} breadcrumbs={[{ label: "Settings" }]}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        {/* Invitations you've received — only shown when you have some, so a
         * missed invite email is always recoverable here. */}
        {pendingInvites.length > 0 && (
          <section className="animate-rise flex flex-col gap-3">
            <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Invitations
            </h2>
            <InvitationsPanel active={active} />
          </section>
        )}

        {/* Account */}
        <section className="animate-rise flex flex-col gap-3">
          <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Account
          </h2>
          <div className="divide-border/60 flex flex-col divide-y overflow-hidden rounded-xl border">
            <div className="flex items-center gap-3 px-2 py-3">
              <Avatar className="size-9">
                {user?.imageUrl && <AvatarImage src={user.imageUrl} alt={name} />}
                <AvatarFallback>
                  {`${user?.firstName?.[0] ?? ""}${user?.lastName?.[0] ?? ""}`.toUpperCase() || "?"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{name}</div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                Edit profile
              </Button>
            </div>
            <div className="flex items-center gap-3 px-2 py-3">
              <div className="text-muted-foreground flex size-9 shrink-0 items-center justify-center">
                <Mail className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-muted-foreground text-xs">Email</div>
                <div className="truncate text-sm">{user?.email}</div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setChangingEmail(true)}>
                Change email
              </Button>
            </div>
          </div>
        </section>

        {/* Account activity — your own identity history (name / photo / email
         * changes), not tied to any team. From the library ActivityFeed. */}
        <section className="animate-rise flex flex-col gap-3">
          <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Account activity
          </h2>
          {accountActivityQ.error ? (
            <p className="text-destructive text-sm">Couldn&apos;t load your activity.</p>
          ) : accountActivityQ.data === undefined ? (
            <Skeleton variant="list" lines={3} />
          ) : (
            <ActivityFeed
              config={{
                ...defaultActivityFeedConfig,
                newestFirst: false, // server already returns newest-first
                emptyText: "No account activity yet.",
              }}
              items={accountActivityQ.data.map((a) => ({
                id: a.id,
                description: a.description,
                timestamp: formatDateTime(a.createdAt),
              }))}
            />
          )}
        </section>

        {/* Teams */}
        <section className="animate-rise flex flex-col gap-3">
          <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Teams
          </h2>
          <div className="divide-border/60 flex flex-col divide-y overflow-hidden rounded-xl border">
            {ctx.teams.map((team) => {
              const current = team.id === ctx.team?.id
              return (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => void openTeam(team.id)}
                  className="hover:bg-muted/40 flex w-full items-center gap-3 px-2 py-3 text-left transition-colors"
                >
                  <Avatar className="size-9">
                    {team.logoUrl && <AvatarImage src={team.logoUrl} alt={team.name} />}
                    <AvatarFallback className="text-xs">
                      {team.name[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 font-medium">
                      <span className="truncate">{team.name}</span>
                      {current && (
                        <Badge variant="secondary" className="text-[10px]">
                          Active
                        </Badge>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                </button>
              )
            })}
          </div>
        </section>
      </div>

      <ProfileDialog
        open={editing}
        onOpenChange={setEditing}
        user={user}
        onSaved={active.refresh}
      />
      <EmailChangeDialog
        open={changingEmail}
        onOpenChange={setChangingEmail}
        currentEmail={user?.email ?? ""}
        onSaved={active.refresh}
      />
    </AppShell>
  )
}
