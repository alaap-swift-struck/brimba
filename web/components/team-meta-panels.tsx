"use client"

// The team's Overview + Activity tabs (Settings → Team). Each fetches cache-
// first and renders a shared presentational component, so every record screen
// (team, member, …) uses the same Overview/Activity building blocks.

import { Skeleton } from "@swift-struck/ui/registry/primitives/skeleton/skeleton"

import { ActivityFeed } from "@/components/activity-feed"
import { MetadataOverview } from "@/components/metadata-overview"
import { tenancy } from "@/lib/api"
import { formatDateTime } from "@/lib/format"
import { useCached } from "@/lib/store"
import type { ActiveTeam } from "@/lib/use-active-team"

export function TeamOverviewPanel({ active }: { active: ActiveTeam }) {
  const teamId = active.ctx?.team?.id ?? null
  const metaQ = useCached(teamId ? `team-meta:${teamId}` : null, () => tenancy.teamMeta())
  const m = metaQ.data
  if (metaQ.error) return <p className="text-destructive text-sm">Couldn&apos;t load the overview.</p>
  if (m === undefined) return <Skeleton variant="list" lines={3} />
  return (
    <MetadataOverview
      rows={[
        { label: "Created", value: formatDateTime(m.createdAt) },
        { label: "Created by", value: m.creatorName || m.creatorEmail },
        { label: "Last updated", value: formatDateTime(m.updatedAt) },
      ]}
    />
  )
}

export function TeamActivityPanel({ active }: { active: ActiveTeam }) {
  const teamId = active.ctx?.team?.id ?? null
  const actQ = useCached(teamId ? `activity:team:${teamId}` : null, () =>
    tenancy.activity("team").then((r) => r.activity)
  )
  return (
    <ActivityFeed
      items={actQ.data}
      error={!!actQ.error}
      emptyText="Nothing has happened in this team yet."
    />
  )
}
