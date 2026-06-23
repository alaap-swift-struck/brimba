"use client"

// Help detail — one support ticket's conversation at /t/<teamId>/help/<id>. The
// thread has no screen-engine block (it's a bespoke conversation), so the host
// composes it here from the library TicketThread while the help LIST is engine-
// driven. Self-contained, like role-detail: it reads the ticket + its replies +
// the team members cache-first (the same caches the live registry warms), owns
// posting a reply and changing status.
//
// STATUS form differs across the seam: the library uses the HYPHEN form
// ("in-progress"); the server uses the UNDERSCORE form ("in_progress"). We map
// both ways at this boundary so neither side leaks the other's shape.

import * as React from "react"

import { Skeleton } from "@swift-struck/ui/registry/primitives/skeleton/skeleton"
import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"
import {
  TicketThread,
  type TicketMember,
  type TicketStatus,
} from "@swift-struck/ui/registry/collections/ticket-thread/ticket-thread"

import type { HelpMessage, HelpTicket, TeamMember } from "@shared/types"
import { ApiFailure, content, tenancy } from "@/lib/api"
import { formatRelative } from "@/lib/format"
import { personName } from "@/lib/identity"
import { usePermissions } from "@/lib/perms"
import { invalidate, primeCache, useCached } from "@/lib/store"

/** The library (hyphen) ⇄ server (underscore) status forms — they differ only in
 * the "in progress" value, but map explicitly so a future status can't slip. */
const TO_SERVER: Record<TicketStatus, HelpTicket["status"]> = {
  open: "open",
  "in-progress": "in_progress",
  resolved: "resolved",
  reopened: "reopened",
}
const TO_LIBRARY: Record<HelpTicket["status"], TicketStatus> = {
  open: "open",
  in_progress: "in-progress",
  resolved: "resolved",
  reopened: "reopened",
}

export function HelpDetailScreen({
  teamId,
  helpId,
  myUserId,
}: {
  teamId: string
  helpId: string
  /** The signed-in user's id — the raiser may always reopen their own ticket. */
  myUserId: string | null
}) {
  // The ticket lives in the SAME list cache the live registry patches row-by-row,
  // so a remote status change reflects here without its own fetch.
  const ticketsQ = useCached<HelpTicket[]>(`help:${teamId}`, () =>
    content.help("all").then((r) => r.tickets)
  )
  const ticket = ticketsQ.data?.find((t) => t.id === helpId) ?? null

  const repliesQ = useCached<HelpMessage[]>(`help-thread:${helpId}`, () =>
    content.helpThread(helpId).then((r) => r.replies)
  )
  const membersQ = useCached<TeamMember[]>(`members:${teamId}`, () =>
    tenancy.members().then((r) => r.members)
  )

  const { can } = usePermissions(teamId)
  // Resolving needs help:edit; but the raiser may always reopen their own ticket.
  const isRaiser = !!ticket && !!myUserId && ticket.raiserId === myUserId
  const canResolve = can("help", "edit") || isRaiser

  async function onReply(body: string, _attachments: File[], mentions: TicketMember[]) {
    // Attachments are a deferred feature — ignore them for now (see brief).
    try {
      const { replies } = await content.replyHelp(helpId, body, mentions.map((m) => m.id))
      primeCache(`help-thread:${helpId}`, replies)
      // The reply bumps the ticket's updatedAt; the server pings `help` too, but
      // refresh the list now so any "updated" ordering stays honest immediately.
      invalidate(`help:${teamId}`)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't post your reply.")
    }
  }

  async function onStatusChange(status: TicketStatus) {
    try {
      const { tickets } = await content.setHelpStatus(helpId, TO_SERVER[status])
      primeCache(`help:${teamId}`, tickets)
      toast.success("Status updated.")
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't update the status.")
    }
  }

  if (ticketsQ.error) return <p className="text-destructive text-sm">Couldn&apos;t load the ticket.</p>
  if (ticketsQ.data === undefined) return <Skeleton variant="list" lines={4} />
  if (!ticket) return <p className="text-muted-foreground text-sm">That ticket no longer exists.</p>

  const members: TicketMember[] = (membersQ.data ?? []).map((m) => ({
    id: m.userId,
    name: personName(m),
  }))
  const replies = (repliesQ.data ?? []).map((r) => ({
    id: r.id,
    author: r.authorName || "Member",
    time: formatRelative(r.createdAt),
    body: r.body,
    aiDrafted: r.isAgent,
  }))

  return (
    <TicketThread
      ticket={{
        description: ticket.description,
        type: ticket.helpType || "Help",
        status: TO_LIBRARY[ticket.status],
        fromScreen: ticket.sourceScreen ? { label: ticket.sourceScreen } : undefined,
      }}
      replies={replies}
      members={members}
      canResolve={canResolve}
      onReply={onReply}
      onStatusChange={onStatusChange}
    />
  )
}
