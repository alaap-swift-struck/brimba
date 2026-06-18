"use client"

// A record's Activity tab — the shared activity feed (edits, role changes,
// invites, removals…), newest first. Presentational: the caller fetches the
// items cache-first (useCached) and passes them in. The SAME component renders
// the team feed, a member's history, and a role's history — one feed, many views.

import { Skeleton } from "@swift-struck/ui/registry/primitives/skeleton/skeleton"

import type { ActivityItem } from "@shared/types"
import { formatDateTime } from "@/lib/format"

export function ActivityFeed({
  items,
  error,
  emptyText = "No activity yet.",
}: {
  /** undefined = still loading (shows a skeleton); [] = loaded but empty */
  items: ActivityItem[] | undefined
  error?: boolean
  emptyText?: string
}) {
  if (error) return <p className="text-destructive text-sm">Couldn&apos;t load activity.</p>
  if (items === undefined) return <Skeleton variant="list" lines={4} />
  if (items.length === 0)
    return (
      <p className="text-muted-foreground border-border/60 rounded-xl border py-8 text-center text-sm">
        {emptyText}
      </p>
    )
  return (
    <ol className="divide-border/60 flex flex-col divide-y overflow-hidden rounded-xl border">
      {items.map((a) => (
        <li key={a.id} className="flex flex-col gap-0.5 px-4 py-3">
          <span className="text-sm">{a.description}</span>
          <span className="text-muted-foreground text-xs">
            {a.actorName ? `${a.actorName} · ` : ""}
            {formatDateTime(a.createdAt)}
          </span>
        </li>
      ))}
    </ol>
  )
}
