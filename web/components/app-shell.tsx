"use client"

// AppShell — the persistent frame every in-app screen sits inside: a top bar
// with the team switcher (Glide-style: tap the team name to hop teams) and a
// profile menu. Composed ENTIRELY from library primitives; when this pattern
// stabilises it's a candidate to move into the library as an `app-bar`
// collection (flagged in UI-GAPS.md).

import * as React from "react"
import { useRouter } from "next/navigation"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@swift-struck/ui/registry/primitives/avatar/avatar"
import { Button } from "@swift-struck/ui/registry/primitives/button/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@swift-struck/ui/registry/primitives/dropdown-menu/dropdown-menu"
import { ModeToggle } from "@swift-struck/ui/registry/primitives/mode-toggle/mode-toggle"
import { Skeleton } from "@swift-struck/ui/registry/primitives/skeleton/skeleton"
import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"
import { ChevronsUpDown, Check, Plus, LogOut } from "lucide-react"

import { auth } from "@/lib/api"
import type { ActiveTeam } from "@/lib/use-active-team"
import { useRealtime } from "@/lib/realtime"
import { invalidate } from "@/lib/store"
import { CreateTeamDialog } from "@/components/create-team-dialog"

export function AppShell({
  active,
  children,
}: {
  active: ActiveTeam
  children: React.ReactNode
}) {
  const router = useRouter()
  const [creating, setCreating] = React.useState(false)
  const { user, ctx } = active
  const teamId = ctx?.team?.id ?? null

  // ONE live channel for the active team: when something changes (here or for
  // another member), drop the matching cache so the open screen refetches — and
  // refresh the shell's own member count. This is the "data just updates" piece.
  useRealtime(teamId, (event) => {
    if (!teamId) return
    if (event.resource === "members") {
      invalidate(`members:${teamId}`)
      void active.refresh()
    } else if (event.resource === "member_roles") {
      invalidate(`member_roles:${teamId}`)
    }
  })

  function initials(first?: string | null, last?: string | null) {
    return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?"
  }

  async function handleSwitch(teamId: string) {
    if (teamId === ctx?.team?.id) return
    await active.switchTeam(teamId)
    const name = ctx?.teams.find((t) => t.id === teamId)?.name
    toast.success(name ? `Switched to ${name}` : "Team switched")
  }

  return (
    <div className="flex min-h-[100svh] flex-col">
      <header className="glass sticky top-0 z-20 flex items-center justify-between gap-2 border-b px-4 py-2.5">
        {/* Team switcher — the current team, tap to hop (one team at a time) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="hover-lift-none -ml-1 h-auto gap-2 px-2 py-1.5">
              <Avatar className="size-7">
                {ctx?.team?.logoUrl && (
                  <AvatarImage src={ctx.team.logoUrl} alt={ctx.team.name} />
                )}
                <AvatarFallback className="text-xs">
                  {ctx?.team?.name?.[0]?.toUpperCase() ?? "?"}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 max-w-[40vw] truncate text-sm font-semibold">
                {ctx?.team?.name ?? "No team"}
              </span>
              <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuLabel>Your teams</DropdownMenuLabel>
            {ctx?.teams.map((team) => (
              <DropdownMenuItem
                key={team.id}
                onSelect={() => void handleSwitch(team.id)}
                className="gap-2"
              >
                <Avatar className="size-6">
                  {team.logoUrl && <AvatarImage src={team.logoUrl} alt={team.name} />}
                  <AvatarFallback className="text-[10px]">
                    {team.name[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate">{team.name}</span>
                {team.id === ctx.team?.id && <Check className="size-4" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setCreating(true)} className="gap-2">
              <Plus className="size-4" />
              Create team
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Right side: theme toggle + profile menu */}
        <div className="flex items-center gap-1">
          <ModeToggle />
          <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded-full outline-none ring-offset-2 focus-visible:ring-2">
              <Avatar className="size-8">
                {user?.imageUrl && <AvatarImage src={user.imageUrl} alt="You" />}
                <AvatarFallback className="text-xs">
                  {initials(user?.firstName, user?.lastName)}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col">
              <span className="truncate">
                {[user?.firstName, user?.lastName].filter(Boolean).join(" ")}
              </span>
              <span className="text-muted-foreground truncate text-xs font-normal">
                {user?.email}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => void auth.logout().then(() => router.replace("/login"))}
              className="gap-2"
            >
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="flex-1 px-4 py-6">{children}</main>

      <CreateTeamDialog
        open={creating}
        onOpenChange={setCreating}
        onCreate={async (name) => {
          await active.createTeam(name)
          toast.success(`Created ${name}`)
        }}
      />
    </div>
  )
}

/** Skeleton frame for the brief first load (only the FIRST screen ever shows it
 * — the session is cached after that). Mirrors the shell so nothing jumps. */
export function ShellLoading() {
  return (
    <div className="flex min-h-[100svh] flex-col">
      <header className="glass sticky top-0 z-20 flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <Skeleton className="h-7 w-40 rounded-lg" />
        <Skeleton className="size-8 rounded-full" />
      </header>
      <main className="flex-1 px-4 py-6">
        <div className="mx-auto w-full max-w-2xl">
          <Skeleton variant="list" lines={4} />
        </div>
      </main>
    </div>
  )
}
