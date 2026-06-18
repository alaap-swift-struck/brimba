"use client"

// Member detail — the per-user record screen, opened from the Members list.
// Overview (identity + role + when they joined) and Activity (everything that
// happened to this member, scope=user). Reuses MetadataOverview + ActivityFeed,
// so it's the same pattern every record screen uses. Cache-first activity.

import * as React from "react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@swift-struck/ui/registry/primitives/avatar/avatar"
import { Badge } from "@swift-struck/ui/registry/primitives/badge/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@swift-struck/ui/registry/primitives/dialog/dialog"

import type { TeamMember } from "@shared/types"
import { ActivityFeed } from "@/components/activity-feed"
import { MetadataOverview } from "@/components/metadata-overview"
import { tenancy } from "@/lib/api"
import { formatDate } from "@/lib/format"
import { useCached } from "@/lib/store"

function fullName(m: TeamMember) {
  return [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email
}

export function MemberDetailDialog({
  open,
  onOpenChange,
  member,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: TeamMember | null
}) {
  // Only fetch once the dialog is open for a member (cache-first, revalidates).
  const userId = member?.userId ?? null
  const activityQ = useCached(
    open && userId ? `activity:user:${userId}` : null,
    () => tenancy.activity("user", userId as string).then((r) => r.activity)
  )

  const initials =
    `${member?.firstName?.[0] ?? ""}${member?.lastName?.[0] ?? ""}`.toUpperCase() ||
    member?.email[0]?.toUpperCase() ||
    "?"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Avatar className="size-11">
              {member?.imageUrl && <AvatarImage src={member.imageUrl} alt={member ? fullName(member) : ""} />}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2">
                <span className="truncate">{member ? fullName(member) : "Member"}</span>
                {member?.isYou && <Badge variant="outline" className="text-[10px]">You</Badge>}
              </DialogTitle>
              <DialogDescription className="truncate">{member?.email}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {member && (
          <div className="flex flex-col gap-5">
            <section className="flex flex-col gap-2">
              <h3 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Overview
              </h3>
              <MetadataOverview
                rows={[
                  { label: "Role", value: member.roleTitle },
                  { label: "Joined", value: formatDate(member.joinedAt) },
                  { label: "Email", value: member.email },
                ]}
              />
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Activity
              </h3>
              <ActivityFeed
                items={activityQ.data}
                error={!!activityQ.error}
                emptyText="No activity for this member yet."
              />
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
