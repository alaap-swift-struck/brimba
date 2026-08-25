"use client"

// Help detail — one ticket as a tabbed record: a status STEPPER (the hero control)
// above Conversation / Overview / Activity tabs. Conversation = the chat (library
// TicketThread), Overview = audit metadata (DescriptionList), Activity = the
// ticket's history (the GENERIC record-activity feed). Edit + every status move are
// gated PURELY by help:edit. Replies echo instantly (optimistic) and reconcile with
// the server reply. Host-composed, like role-detail.

import * as React from "react"

import { Button } from "@swift-struck/ui/registry/primitives/button/button"
import { Skeleton } from "@swift-struck/ui/registry/primitives/skeleton/skeleton"
import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"
import { TabsView, defaultTabsConfig } from "@swift-struck/ui/registry/primitives/tabs/tabs"
import {
  DescriptionList,
  defaultDescriptionListConfig,
} from "@swift-struck/ui/registry/collections/description-list/description-list"
import {
  ActivityFeed,
  defaultActivityFeedConfig,
  type ActivityItem as ActivityFeedItem,
} from "@swift-struck/ui/registry/collections/activity-feed/activity-feed"
import {
  TicketThread,
  type TicketMember,
  type TicketStatus,
} from "@swift-struck/ui/registry/collections/ticket-thread/ticket-thread"
import { Pencil } from "lucide-react"

import type {
  ActivityItem,
  HelpMessage,
  HelpStakeholder,
  HelpTicket,
  SelectableValue,
  TeamMember,
} from "@shared/types"
import { ApiFailure, content, tenancy } from "@/lib/api"
import { auditItems } from "@/lib/audit-overview"
import { formatActivityWhen, formatRelative } from "@/lib/format"
import { personName } from "@/lib/identity"
import { usePermissions } from "@/lib/perms"
import { applyUpdated, totalKey } from "@/lib/live-resources"
import { invalidate, primeCache, useCached, useCachedValue } from "@/lib/store"
import { formatCount } from "@/lib/format-count"
import { HelpFormDialog } from "@/components/help-form-dialog"
import { HelpStakeholders } from "@/components/help-stakeholders"
import { HelpStatusStepper, type HelpStatusValue } from "@/components/help-status-stepper"

// library (hyphen) ⇄ server (underscore) status — only "in progress" differs.
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
const STATUS_LABEL: Record<HelpTicket["status"], string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  reopened: "Reopened",
}

export function HelpDetailScreen({
  teamId,
  helpId,
  myUserId,
}: {
  teamId: string
  helpId: string
  myUserId: string | null
}) {
  const ticketsQ = useCached<HelpTicket[]>(`help:${teamId}`, () =>
    content.help("all").then((r) => r.tickets)
  )
  const fromList = ticketsQ.data?.find((t) => t.id === helpId) ?? null

  // THE DEEP LINK PAST PAGE ONE. Reading a detail out of the list cache is the
  // locked optimisation in EDGE-CASES 2 / CACHING 3, and it was sound while help
  // returned every ticket. R14 made help a PAGED collection, and the two rules
  // stopped composing: a ticket beyond the loaded page is simply absent from the
  // cache, so pasting its URL into a fresh tab rendered "That ticket no longer
  // exists" about a ticket that exists.
  //
  // The single-row door has been there the whole time (it is what live-sync uses
  // to patch a row in). This asks it ONLY when the list genuinely does not have
  // the ticket — `null` key means no request — so the common path still costs
  // nothing and the locked decision is untouched. (Round-trip review, 2026-08-25.)
  const listSettled = ticketsQ.data !== undefined
  const oneQ = useCached<HelpTicket | null>(
    listSettled && !fromList ? `help-one:${helpId}` : null,
    () => content.helpOne(helpId)
  )
  const ticket = fromList ?? oneQ.data ?? null

  const repliesQ = useCached<HelpMessage[]>(`help-thread:${helpId}`, () =>
    content.helpThread(helpId).then((r) => {
      // R16: the badge shows the door's exact COUNT(*), never the (capped) list length.
      primeCache(`total:help-thread:${helpId}`, r.total)
      return r.replies
    })
  )
  const threadTotal = useCachedValue<number>(`total:help-thread:${helpId}`)
  const membersQ = useCached<TeamMember[]>(`members:${teamId}`, () =>
    tenancy.members().then((r) => r.members)
  )
  const activityQ = useCached<ActivityItem[]>(`activity:record:help:${helpId}`, () =>
    tenancy.recordActivity("help", helpId)
  )
  const selectableQ = useCached<SelectableValue[]>(`selectable:${teamId}`, () =>
    tenancy.selectable().then((r) => r.values)
  )
  const stakeholdersQ = useCached<HelpStakeholder[]>(`help-stakeholders:${helpId}`, () =>
    content.helpStakeholders(helpId).then((r) => r.stakeholders)
  )

  const stakeholderBadge = formatCount(stakeholdersQ.data?.length)
  const { can } = usePermissions(teamId)
  const canEdit = can("help", "edit") // single source — gates Edit, the stepper, and the thread's resolve

  const [tab, setTab] = React.useState("conversation")
  const [editing, setEditing] = React.useState(false)
  const [statusBusy, setStatusBusy] = React.useState(false)

  const helpTypeOptions = (selectableQ.data ?? [])
    .filter((v) => v.type === "Help type")
    .map((v) => v.value)

  async function changeStatus(next: HelpStatusValue) {
    setStatusBusy(true)
    try {
      const { updated } = await content.setHelpStatus(helpId, next)
      await applyUpdated({ listKey: `help:${teamId}`, id: helpId, row: updated })
      invalidate(`activity:record:help:${helpId}`)
      toast.success("Status updated.")
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't update the status.")
    } finally {
      setStatusBusy(false)
    }
  }

  async function editTicket(input: { description: string; helpType?: string }) {
    const { updated } = await content.updateHelp({
      id: helpId,
      description: input.description,
      helpType: input.helpType,
      expectedVersion: ticket?.updatedAt ?? ticket?.createdAt ?? null,
    })
    // R23: one row back, patched in (CACHING rule 3) — not the whole page.
    await applyUpdated({ listKey: `help:${teamId}`, id: helpId, row: updated })
    invalidate(`activity:record:help:${helpId}`)
    toast.success("Ticket updated.")
  }

  async function addStakeholder(userId: string) {
    const { stakeholders } = await content.addStakeholder(helpId, userId)
    primeCache(`help-stakeholders:${helpId}`, stakeholders)
    invalidate(`activity:record:help:${helpId}`)
  }

  async function onReply(body: string, _files: File[], mentions: TicketMember[]) {
    const prev = repliesQ.data ?? []
    const optimistic: HelpMessage = {
      id: `optimistic-${Date.now()}`,
      ticketId: helpId,
      body,
      taggedUserIds: mentions.map((m) => m.id),
      isAgent: false,
      authorId: myUserId ?? "",
      authorName: "You",
      createdAt: new Date().toISOString(),
    }
    primeCache(`help-thread:${helpId}`, [...prev, optimistic]) // ~instant echo (WhatsApp-style)
    try {
      const { created } = await content.replyHelp(
        helpId,
        body,
        mentions.map((m) => m.id)
      )
      // R21: the door returns the CREATED REPLY — swap the optimistic echo for it
      // rather than re-pulling the whole thread to add one message.
      primeCache(`help-thread:${helpId}`, created ? [...prev, created] : prev)
      invalidate(`help:${teamId}`)
    } catch (err) {
      primeCache(`help-thread:${helpId}`, prev) // rollback the echo
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't post your reply.")
    }
  }

  if (ticketsQ.error) return <p className="text-destructive text-sm">Couldn&apos;t load the ticket.</p>
  if (ticketsQ.data === undefined) return <Skeleton variant="list" lines={4} />
  // Only once the fallback has settled too — otherwise a deep-linked ticket
  // flashes "no longer exists" while its own read is still in flight.
  if (!ticket && oneQ.loading) return <Skeleton variant="list" lines={4} />
  if (!ticket) return <p className="text-muted-foreground text-sm">That ticket no longer exists.</p>

  // self-tag fix: you can't @mention yourself
  const mentionableMembers: TicketMember[] = (membersQ.data ?? [])
    .filter((m) => m.userId !== myUserId)
    .map((m) => ({ id: m.userId, name: personName(m) }))

  const replies = (repliesQ.data ?? []).map((r) => ({
    id: r.id,
    author: r.authorName || "Member",
    time: formatRelative(r.createdAt),
    body: r.body,
    aiDrafted: r.isAgent,
  }))

  const overviewItems = [
    { label: "Type", value: ticket.helpType || "General" },
    { label: "Raised from", value: ticket.sourceScreen || "" },
    ...auditItems({
      createdByName: ticket.raiserName,
      createdAt: ticket.createdAt,
      editedByName: ticket.editorName,
      updatedAt: ticket.updatedAt,
      status: STATUS_LABEL[ticket.status],
    }),
    { label: "Resolved", value: ticket.resolvedAt ? formatRelative(ticket.resolvedAt) : "" },
  ]

  const activityItems: ActivityFeedItem[] = (activityQ.data ?? []).map((a) => ({
    id: a.id,
    description: a.description,
    actor: a.actorName ?? undefined,
    timestamp: formatActivityWhen(a.createdAt),
  }))

  const tabsConfig = {
    ...defaultTabsConfig,
    variant: "line" as const,
    tabs: [
      {
        value: "conversation",
        label: "Conversation",
        icon: "messages-square",
        badge: formatCount(threadTotal),
        badgeVariant: "" as const,
      },
      { value: "overview", label: "Overview", icon: "info", badge: "", badgeVariant: "" as const },
      { value: "activity", label: "Activity", icon: "history", badge: "", badgeVariant: "" as const },
      {
        value: "stakeholders",
        label: "Stakeholders",
        icon: "users",
        // The stakeholder set is COMPUTED in full (raiser + admins + mentions + adds),
        // not a capped table read — its size IS the true total, shown via the one seam.
        badge: stakeholderBadge,
        badgeVariant: "" as const,
      },
    ],
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <p className="min-w-0 flex-1 truncate text-sm font-medium">{ticket.description}</p>
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
              className="shrink-0 gap-1.5"
            >
              <Pencil className="size-3.5" />
              Edit
            </Button>
          )}
        </div>
        <HelpStatusStepper
          status={ticket.status}
          canEdit={canEdit}
          onChange={(n) => void changeStatus(n)}
          busy={statusBusy}
        />
      </div>

      <TabsView
        config={tabsConfig}
        value={tab}
        onValueChange={setTab}
        renderPanel={(t) => {
          if (t.value === "overview")
            return (
              <DescriptionList
                config={{ ...defaultDescriptionListConfig, columns: 1 }}
                items={overviewItems}
              />
            )
          if (t.value === "activity")
            return (
              <ActivityFeed
                config={{
                  ...defaultActivityFeedConfig,
                  emptyText: "No activity yet.",
                }}
                items={activityItems}
              />
            )
          if (t.value === "stakeholders")
            return (
              <HelpStakeholders
                stakeholders={stakeholdersQ.data ?? []}
                members={membersQ.data ?? []}
                canAdd={can("help", "read")}
                onAdd={addStakeholder}
              />
            )
          return (
            <TicketThread
              ticket={{
                description: ticket.description,
                type: ticket.helpType || "General",
                status: TO_LIBRARY[ticket.status],
                fromScreen: ticket.sourceScreen ? { label: ticket.sourceScreen } : undefined,
              }}
              replies={replies}
              members={mentionableMembers}
              canResolve={canEdit}
              showStatusControl={false}
              onReply={onReply}
              onStatusChange={(s) => void changeStatus(TO_SERVER[s])}
            />
          )
        }}
      />

      <HelpFormDialog
        open={editing}
        onOpenChange={setEditing}
        draftKey={`help:edit:${helpId}`}
        teamId={teamId}
        helpTypeOptions={helpTypeOptions}
        initial={{ description: ticket.description, helpType: ticket.helpType }}
        onSubmit={editTicket}
      />
    </div>
  )
}
