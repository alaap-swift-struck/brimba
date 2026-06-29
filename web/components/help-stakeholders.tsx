"use client"

// Stakeholders on a ticket — the people kept in the loop: the raiser, your team's
// admins, anyone @mentioned, plus people manually added. ADD-ONLY by design — you
// can pull a teammate in, but no one is ever removed (and there's no assignee).
// Gated by help:read (seeing a ticket lets you involve a teammate). Library primitives.

import * as React from "react"

import { Avatar, AvatarFallback, AvatarImage } from "@swift-struck/ui/registry/primitives/avatar/avatar"
import { Badge } from "@swift-struck/ui/registry/primitives/badge/badge"
import { Button } from "@swift-struck/ui/registry/primitives/button/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@swift-struck/ui/registry/primitives/select/select"
import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"
import { UserPlus } from "lucide-react"

import type { HelpStakeholder, TeamMember } from "@shared/types"
import { ApiFailure } from "@/lib/api"
import { letterMark, personName } from "@/lib/identity"

const ORIGIN_LABEL: Record<HelpStakeholder["origin"], string> = {
  raiser: "Raiser",
  admin: "Admin",
  mentioned: "Mentioned",
  added: "Added",
}

export function HelpStakeholders({
  stakeholders,
  members,
  canAdd,
  onAdd,
}: {
  stakeholders: HelpStakeholder[]
  members: TeamMember[]
  canAdd: boolean
  onAdd: (userId: string) => Promise<void>
}) {
  const [picked, setPicked] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  const existing = new Set(stakeholders.map((s) => s.userId))
  const addable = members.filter((m) => !existing.has(m.userId))

  async function add() {
    if (!picked) return
    setBusy(true)
    try {
      await onAdd(picked)
      setPicked("")
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't add them to the ticket.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">These people are kept in the loop on this ticket.</p>

      {stakeholders.length === 0 ? (
        <p className="text-muted-foreground text-sm">Just the raiser and your team&apos;s admins so far.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {stakeholders.map((s) => (
            <li
              key={s.userId}
              className="border-border/60 flex items-center gap-3 rounded-lg border px-3 py-2"
            >
              <Avatar className="size-8">
                {s.imageUrl && <AvatarImage src={s.imageUrl} alt="" />}
                <AvatarFallback>{letterMark(s.name || s.email)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{s.name || s.email}</p>
                <p className="text-muted-foreground truncate text-xs">{s.email}</p>
              </div>
              <Badge variant="outline" className="text-[10px]">
                {ORIGIN_LABEL[s.origin]}
              </Badge>
            </li>
          ))}
        </ul>
      )}

      {canAdd && addable.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={picked} onValueChange={setPicked} disabled={busy}>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue placeholder="Choose a teammate to involve" />
            </SelectTrigger>
            <SelectContent>
              {addable.map((m) => (
                <SelectItem key={m.userId} value={m.userId}>
                  {personName(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => void add()} disabled={busy || !picked} className="gap-1.5">
            <UserPlus className="size-4" />
            Add someone
          </Button>
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        You can add people, but no one is ever removed from a ticket.
      </p>
    </div>
  )
}
