"use client"

// The team switcher (one team at a time; tap to hop) — used in both the desktop
// sidebar and the mobile top bar. Extracted from the app shell so each stays
// small. Menu opacity is handled by the library dropdown now (UI-GAPS row 5).

import { useRouter } from "next/navigation"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@swift-struck/ui/registry/primitives/avatar/avatar"
import { Badge } from "@swift-struck/ui/registry/primitives/badge/badge"
import { Button } from "@swift-struck/ui/registry/primitives/button/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@swift-struck/ui/registry/primitives/dropdown-menu/dropdown-menu"
import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"
import { Check, ChevronsUpDown, Inbox, Plus } from "lucide-react"

import { useReceivedInvites } from "@/components/invitations"
import type { ActiveTeam } from "@/lib/use-active-team"

function teamInitial(name?: string | null) {
  return name?.[0]?.toUpperCase() ?? "?"
}

export function TeamSwitcher({
  active,
  onCreateTeam,
  collapsed,
}: {
  active: ActiveTeam
  onCreateTeam: () => void
  /** icon-only trigger (collapsed sidebar) */
  collapsed?: boolean
}) {
  const { ctx } = active
  const router = useRouter()
  const pendingInvites = useReceivedInvites().data?.length ?? 0
  async function handleSwitch(teamId: string) {
    if (teamId === ctx?.team?.id) return
    const name = ctx?.teams.find((t) => t.id === teamId)?.name
    await active.switchTeam(teamId)
    toast.success(name ? `Switched to ${name}` : "Team switched")
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {collapsed ? (
          <button
            className="rounded-lg outline-none ring-offset-2 focus-visible:ring-2"
            title={ctx?.team?.name ?? "No team"}
            aria-label="Switch team"
          >
            <Avatar className="size-8">
              {ctx?.team?.logoUrl && <AvatarImage src={ctx.team.logoUrl} alt={ctx.team.name} />}
              <AvatarFallback className="text-xs">{teamInitial(ctx?.team?.name)}</AvatarFallback>
            </Avatar>
          </button>
        ) : (
          <Button variant="ghost" className="hover-lift-none h-auto w-full justify-start gap-2 px-2 py-1.5">
            <Avatar className="size-7">
              {ctx?.team?.logoUrl && <AvatarImage src={ctx.team.logoUrl} alt={ctx.team.name} />}
              <AvatarFallback className="text-xs">{teamInitial(ctx?.team?.name)}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold">
              {ctx?.team?.name ?? "No team"}
            </span>
            <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {/* Invitations you've received — reachable from anywhere, so a missed
         * invite email is never a dead end. */}
        {pendingInvites > 0 && (
          <>
            <DropdownMenuItem onSelect={() => router.push("/invitations")} className="gap-2">
              <Inbox className="size-4" />
              <span className="min-w-0 flex-1">Invitations</span>
              <Badge variant="secondary" className="text-[10px]">
                {pendingInvites}
              </Badge>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuLabel>Your teams</DropdownMenuLabel>
        {ctx?.teams.map((team) => (
          <DropdownMenuItem key={team.id} onSelect={() => void handleSwitch(team.id)} className="gap-2">
            <Avatar className="size-6">
              {team.logoUrl && <AvatarImage src={team.logoUrl} alt={team.name} />}
              <AvatarFallback className="text-[10px]">{teamInitial(team.name)}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 truncate">{team.name}</span>
            {team.id === ctx.team?.id && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onCreateTeam} className="gap-2">
          <Plus className="size-4" />
          Create team
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
