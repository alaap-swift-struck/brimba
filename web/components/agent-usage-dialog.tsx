"use client"

// The assistant's usage view (behind the quota badge): where credits went + why.
// Self-contained: lazily loads the team-scoped usage log each time it opens, so
// it always reflects the turns just run.

import * as React from "react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@swift-struck/ui/registry/primitives/dialog/dialog"
import { ScrollArea } from "@swift-struck/ui/registry/primitives/scroll-area/scroll-area"

import { dataOps, type UsageLogRow } from "@/lib/api"
import { formatActivityWhen } from "@/lib/format"

export function AgentUsageDialog({
  open,
  onOpenChange,
  summary,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** the header line: free left today + purchased balance */
  summary: string
}) {
  const [rows, setRows] = React.useState<UsageLogRow[] | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    let alive = true
    setLoading(true)
    setError(false)
    dataOps
      .agentUsageLog(50)
      .then((r) => alive && setRows(r.rows))
      .catch(() => alive && setError(true))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assistant usage</DialogTitle>
          {summary && <DialogDescription>{summary}</DialogDescription>}
        </DialogHeader>
        {loading ? (
          <p className="text-muted-foreground py-6 text-center text-sm">Loading…</p>
        ) : error ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            Couldn&apos;t load usage. Try again.
          </p>
        ) : rows && rows.length > 0 ? (
          <ScrollArea className="max-h-80">
            <ul className="flex flex-col gap-3 pr-3">
              {rows.map((row) => (
                <li key={row.id} className="border-b pb-3 text-sm last:border-0 last:pb-0">
                  <p className="text-muted-foreground text-xs">
                    {formatActivityWhen(row.createdAt)}
                    {row.actorName ? ` · ${row.actorName}` : ""} · {row.credits}{" "}
                    {row.credits === 1 ? "credit" : "credits"}
                  </p>
                  <p className="mt-0.5">{row.summary}</p>
                </li>
              ))}
            </ul>
          </ScrollArea>
        ) : (
          <p className="text-muted-foreground py-6 text-center text-sm">No usage yet today.</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
