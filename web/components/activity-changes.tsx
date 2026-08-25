"use client"

// WHAT CHANGED — the field-level detail behind an activity row, and the ONE place
// a record's feed rows are built.
//
// Learning, Help and Roles have written a before/after diff on every edit for
// months, and no screen had ever shown it: the feed could say "Ada edited it" and
// never which field, from what, to what. This is the half that was missing.
//
// AN ACTIVITY ROW IS A SENTENCE. The diff is the detail behind it, so it opens on
// request and not before — a feed that unfurls every old value by default is a
// wall of text where a timeline used to be.
//
// RECORD FEEDS ONLY, and that is decided by the server, not here. `changes` is
// absent on the team feed on purpose: that is the one read returning every
// module's rows behind a single gate, and shipping raw before/after values
// through it is precisely the leak Law R18 exists to prevent. This renders
// whatever arrives, which is why it only ever appears on a record's own tab.
//
// AND IT PRINTS WHAT IT WAS GIVEN. Values arrive clipped to 200 characters and a
// `hideValues` field arrives with its label alone — the client must never
// re-derive a value, re-expand a clipped one, or show what the writer withheld.
// `hideValues` is honoured here as well as on read, for the same reason the
// reader gates the diff twice: the decision to withhold must not depend on one
// layer remembering it.

import * as React from "react"

import { ChevronRight } from "lucide-react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@swift-struck/ui/registry/primitives/collapsible/collapsible"
import type { ActivityItem as ActivityFeedItem } from "@swift-struck/ui/registry/collections/activity-feed/activity-feed"

import type { ActivityItem, FieldDiff } from "@shared/types"
import { formatActivityWhen } from "@/lib/format"

/**
 * App activity rows → the library ActivityFeed's rows, with the diff expander
 * folded into the description where a row carries one.
 *
 * ONE SEAM, because the three screens that show a diff are exactly the three
 * modules that write one, and three copies of "collapsed by default, hide what
 * the writer hid, show the person by name" is three chances to drift.
 */
export function activityFeedItems(items: ActivityItem[]): ActivityFeedItem[] {
  return items.map((a) => ({
    id: a.id,
    description: a.changes?.length ? (
      <>
        {a.description}
        <ActivityChanges changes={a.changes} />
      </>
    ) : (
      a.description
    ),
    // THE PERSON, BY NAME. `actorName` is the name snapshot the row was written
    // with — it is the only thing about the actor that travels, and that is
    // deliberate: an id or an email address names someone in the one form nobody
    // recognises. No name means no attribution, never a raw id in its place.
    actor: a.actorName ?? undefined,
    timestamp: formatActivityWhen(a.createdAt),
  }))
}

/** One field's change, in the plainest words it can be said in. */
function changeText(c: FieldDiff): string {
  const from = (c.from ?? "").trim()
  const to = (c.to ?? "").trim()
  if (c.hideValues) return "Updated — the before and after aren't shown."
  if (!from && !to) return "Updated"
  if (!from) return `Set to ${to}`
  if (!to) return `Cleared (was ${from})`
  return `${from} → ${to}`
}

function ActivityChanges({ changes }: { changes: FieldDiff[] }) {
  const [open, setOpen] = React.useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-1">
      <CollapsibleTrigger className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs">
        <ChevronRight
          className={`size-3 transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden
        />
        What changed
      </CollapsibleTrigger>
      <CollapsibleContent>
        <dl className="border-border/60 mt-2 flex flex-col gap-1.5 border-l pl-3 text-xs">
          {changes.map((c) => (
            <div key={c.label} className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
              <dt className="text-muted-foreground sm:w-32 sm:shrink-0">{c.label}</dt>
              <dd className="min-w-0 break-words">{changeText(c)}</dd>
            </div>
          ))}
        </dl>
      </CollapsibleContent>
    </Collapsible>
  )
}
