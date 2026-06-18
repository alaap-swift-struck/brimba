"use client"

// A record's Overview metadata — a clean labeled list (created on / by, last
// updated, etc.). Presentational: the caller passes the rows. Reused by the
// team Overview tab and the member detail. Empty/blank rows are dropped so a
// record with partial metadata still reads cleanly.

import * as React from "react"

export type MetaRow = { label: string; value: React.ReactNode }

export function MetadataOverview({ rows }: { rows: MetaRow[] }) {
  const shown = rows.filter((r) => r.value !== null && r.value !== undefined && r.value !== "")
  if (shown.length === 0)
    return <p className="text-muted-foreground text-sm">No details to show yet.</p>
  return (
    <dl className="divide-border/60 flex flex-col divide-y overflow-hidden rounded-xl border">
      {shown.map((r) => (
        <div key={r.label} className="flex items-baseline gap-4 px-4 py-3">
          <dt className="text-muted-foreground w-32 shrink-0 text-sm">{r.label}</dt>
          <dd className="min-w-0 flex-1 text-sm">{r.value}</dd>
        </div>
      ))}
    </dl>
  )
}
