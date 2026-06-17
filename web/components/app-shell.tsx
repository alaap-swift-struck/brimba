"use client"

// AppShell — the persistent frame every in-app screen sits inside. Desktop: a
// left sidebar (team switcher, Home/Settings nav, profile). Mobile: a top bar
// (switcher + profile) and a bottom tab bar. A breadcrumb strip (per page) shows
// where you are and lets you climb back. One live channel for the active team is
// opened here, refreshing caches when something changes. Composed from library
// primitives.

import * as React from "react"
import { useRouter, usePathname } from "next/navigation"

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
import {
  ChevronsUpDown,
  Check,
  Plus,
  LogOut,
  UserRound,
  Home,
  Settings,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react"

import { auth } from "@/lib/api"
import type { ActiveTeam } from "@/lib/use-active-team"
import { useRealtime } from "@/lib/realtime"
import { invalidate } from "@/lib/store"
import { NAV, bottomNavItems, isNavActive, type Crumb } from "@/lib/pages"
import { CreateTeamDialog } from "@/components/create-team-dialog"

const NAV_ICONS = { home: Home, settings: Settings } as const

function teamInitial(name?: string | null) {
  return name?.[0]?.toUpperCase() ?? "?"
}
function userInitials(first?: string | null, last?: string | null) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?"
}

/** The team switcher (one team at a time; tap to hop) — used in both layouts. */
function TeamSwitcher({
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
      <DropdownMenuContent
        align="start"
        className="w-60"
        style={{ backgroundColor: "var(--popover)" }}
      >
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

/** The profile menu — your name/email, a link to Account, and sign out. */
function ProfileMenu({ active }: { active: ActiveTeam }) {
  const router = useRouter()
  const { user } = active
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="rounded-full outline-none ring-offset-2 focus-visible:ring-2">
          <Avatar className="size-8">
            {user?.imageUrl && <AvatarImage src={user.imageUrl} alt="You" />}
            <AvatarFallback className="text-xs">
              {userInitials(user?.firstName, user?.lastName)}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56"
        style={{ backgroundColor: "var(--popover)" }}
      >
        <DropdownMenuLabel className="flex flex-col">
          <span className="truncate">
            {[user?.firstName, user?.lastName].filter(Boolean).join(" ")}
          </span>
          <span className="text-muted-foreground truncate text-xs font-normal">
            {user?.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/settings")} className="gap-2">
          <UserRound className="size-4" />
          Account
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => void auth.logout().then(() => router.replace("/login"))}
          className="gap-2"
        >
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppShell({
  active,
  children,
  breadcrumbs,
}: {
  active: ActiveTeam
  children: React.ReactNode
  breadcrumbs?: Crumb[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [creating, setCreating] = React.useState(false)
  const teamId = active.ctx?.team?.id ?? null

  // Desktop sidebar collapse (icon rail), remembered across sessions.
  const [collapsed, setCollapsed] = React.useState(false)
  React.useEffect(() => {
    setCollapsed(localStorage.getItem("ss-sidebar-collapsed") === "1")
  }, [])
  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c
      localStorage.setItem("ss-sidebar-collapsed", next ? "1" : "0")
      return next
    })
  }

  // Top-level destinations the user can reach (Home/Settings are universal;
  // gated ones would be filtered here once a top-level page declares `need`).
  const accessibleNav = NAV.filter((i) => !i.need)
  const bottomNav = bottomNavItems(accessibleNav)

  // One live channel for the active team → refresh caches when data changes.
  useRealtime(teamId, (event) => {
    if (!teamId) return
    if (event.resource === "members") {
      invalidate(`members:${teamId}`)
      void active.refresh()
    } else if (event.resource === "member_roles") {
      invalidate(`member_roles:${teamId}`)
      invalidate(`my-perms:${teamId}`) // a role's rights changed — maybe mine
      if (event.id) invalidate(`role-perms:${event.id}`)
    } else if (event.resource === "invites") {
      invalidate(`invites:${teamId}`)
    } else if (event.resource === "team") {
      void active.refresh() // team name/logo changed
    }
  })

  return (
    <div className="flex min-h-[100svh]">
      {/* Desktop sidebar (collapsible to an icon rail) */}
      <aside
        className={`hidden shrink-0 flex-col border-r md:flex ${collapsed ? "w-16 items-center" : "w-60"}`}
      >
        <div className={collapsed ? "py-3" : "p-3"}>
          <TeamSwitcher
            active={active}
            onCreateTeam={() => setCreating(true)}
            collapsed={collapsed}
          />
        </div>
        <nav className={`flex flex-col gap-1 ${collapsed ? "px-2" : "px-3"}`}>
          {accessibleNav.map((item) => {
            const Icon = NAV_ICONS[item.icon]
            const activeNav = isNavActive(item.path, pathname)
            return (
              <button
                key={item.slug}
                type="button"
                onClick={() => router.push(item.path)}
                aria-current={activeNav ? "page" : undefined}
                title={collapsed ? item.title : undefined}
                className={`flex items-center rounded-lg text-sm font-medium transition-colors ${
                  collapsed ? "justify-center p-2" : "gap-3 px-3 py-2"
                } ${
                  activeNav
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                <Icon className="size-4" />
                {!collapsed && item.title}
              </button>
            )
          })}
        </nav>
        <div
          className={`mt-auto flex items-center gap-2 p-3 ${collapsed ? "flex-col" : "justify-between"}`}
        >
          <ProfileMenu active={active} />
          {!collapsed && <ModeToggle />}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand" : "Collapse"}
            className="text-muted-foreground hover:bg-muted/50 hover:text-foreground rounded-lg p-2 transition-colors"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </button>
        </div>
      </aside>

      <div className="flex min-h-[100svh] min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="glass sticky top-0 z-20 flex items-center justify-between gap-2 border-b px-4 py-2.5 md:hidden">
          <TeamSwitcher active={active} onCreateTeam={() => setCreating(true)} />
          <div className="flex items-center gap-1">
            <ModeToggle />
            <ProfileMenu active={active} />
          </div>
        </header>

        {/* Breadcrumbs */}
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 px-4 pt-4 text-sm">
            {breadcrumbs.map((c, i) => {
              const last = i === breadcrumbs.length - 1
              return (
                <React.Fragment key={i}>
                  {i > 0 && <ChevronRight className="text-muted-foreground size-3.5 shrink-0" />}
                  {c.href && !last ? (
                    <button
                      type="button"
                      onClick={() => router.push(c.href as string)}
                      className="text-muted-foreground hover:text-foreground truncate transition-colors"
                    >
                      {c.label}
                    </button>
                  ) : (
                    <span className={last ? "truncate font-medium" : "text-muted-foreground truncate"}>
                      {c.label}
                    </span>
                  )}
                </React.Fragment>
              )
            })}
          </nav>
        )}

        <main className="flex-1 px-4 py-6 pb-24 md:pb-8">{children}</main>

        {/* Mobile bottom tabs — capped at 5, Home centered, gated items hidden */}
        <nav className="glass fixed inset-x-0 bottom-0 z-20 flex items-center justify-around border-t px-2 py-1.5 md:hidden">
          {bottomNav.map((item) => {
            const Icon = NAV_ICONS[item.icon]
            const activeNav = isNavActive(item.path, pathname)
            return (
              <button
                key={item.slug}
                type="button"
                onClick={() => router.push(item.path)}
                aria-current={activeNav ? "page" : undefined}
                className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium transition-colors ${
                  activeNav ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                <Icon className="size-5" />
                {item.title}
              </button>
            )
          })}
        </nav>
      </div>

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

/** Skeleton frame for the brief first load (only the FIRST screen shows it —
 * the session is cached after that). */
export function ShellLoading() {
  return (
    <div className="flex min-h-[100svh]">
      <aside className="hidden w-60 shrink-0 flex-col gap-3 border-r p-3 md:flex">
        <Skeleton className="h-9 w-full rounded-lg" />
        <Skeleton className="h-8 w-full rounded-lg" />
        <Skeleton className="h-8 w-full rounded-lg" />
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="glass flex items-center justify-between border-b px-4 py-2.5 md:hidden">
          <Skeleton className="h-7 w-40 rounded-lg" />
          <Skeleton className="size-8 rounded-full" />
        </header>
        <main className="flex-1 px-4 py-6">
          <div className="mx-auto w-full max-w-2xl">
            <Skeleton variant="list" lines={4} />
          </div>
        </main>
      </div>
    </div>
  )
}
