"use client"

// Learning progress — the curator's "Team progress" view: a members × articles
// completion grid, at /t/<teamId>/learning?view=progress. Gated by learning:edit
// (only a curator sees who's done what). Host-composed from the library
// ProgressDashboard, fed by content.learningProgress() (every member's done
// state) + tenancy.members() (the people) + the learning list (the items). All
// three are read cache-first from the same caches the rest of the app warms.

import * as React from "react"

import { Skeleton } from "@swift-struck/ui/registry/primitives/skeleton/skeleton"
import { ProgressDashboard } from "@swift-struck/ui/registry/collections/progress-dashboard/progress-dashboard"

import type { Learning, LearningProgressEntry, TeamMember } from "@shared/types"
import { content, tenancy } from "@/lib/api"
import { personName } from "@/lib/identity"
import { useCached } from "@/lib/store"

export function LearningProgressScreen({ teamId }: { teamId: string }) {
  const membersQ = useCached<TeamMember[]>(`members:${teamId}`, () =>
    tenancy.members().then((r) => r.members)
  )
  const learningQ = useCached<Learning[]>(`learning:${teamId}`, () =>
    content.learning().then((r) => r.learning)
  )
  // Progress is its own (not-row-level) read — refetched on mount, no live wiring
  // (a Done toggle elsewhere is reflected next time the curator opens this view).
  const progressQ = useCached<LearningProgressEntry[]>(`learning-progress:${teamId}`, () =>
    content.learningProgress().then((r) => r.progress)
  )

  if (membersQ.error || learningQ.error || progressQ.error)
    return <p className="text-destructive text-sm">Couldn&apos;t load team progress.</p>
  if (membersQ.data === undefined || learningQ.data === undefined || progressQ.data === undefined)
    return <Skeleton className="h-64 w-full rounded-xl" />

  // Only active articles count toward "team progress" (deactivated items are
  // frozen; their old completions stay in the data but don't surface here).
  const items = learningQ.data
    .filter((l) => l.active)
    .map((l) => ({ id: l.id, label: l.title }))
  const members = membersQ.data.map((m) => ({ id: m.userId, name: personName(m) }))
  const done = progressQ.data
    .filter((p) => p.done)
    .map((p) => ({ memberId: p.userId, itemId: p.learningId }))

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team progress</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Who&apos;s marked each article done. Only switched-on articles are shown.
        </p>
      </div>
      <ProgressDashboard members={members} items={items} done={done} />
    </div>
  )
}
