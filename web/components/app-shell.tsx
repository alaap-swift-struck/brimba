"use client"

// AppShell — the persistent frame every in-app screen sits inside. Desktop: a
// left sidebar (team switcher, Home/Settings nav, profile). Mobile: a top bar
// (switcher + profile) and a bottom tab bar. A breadcrumb strip (per page) shows
// where you are and lets you climb back. One live channel for the active team is
// opened here, refreshing caches when something changes. Composed from library
// primitives.

import * as React from "react"
import { useRouter, usePathname } from "next/navigation"

import { ModeToggle } from "@swift-struck/ui/registry/primitives/mode-toggle/mode-toggle"
import { Skeleton } from "@swift-struck/ui/registry/primitives/skeleton/skeleton"
import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"
import {
  Home,
  Settings,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react"

import type { ActiveTeam } from "@/lib/use-active-team"
import { useRealtime } from "@/lib/realtime"
import { invalidate } from "@/lib/store"
import { NAV, bottomNavItems, isNavActive, type Crumb } from "@/lib/pages"
import { CreateTeamDialog } from "@/components/create-team-dialog"
import { ProfileMenu } from "@/components/profile-menu"
import { TeamSwitcher } from "@/components/team-switcher"

const NAV_ICONS = { home: Home, settings: Settings } as const

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
    // Any change can add an activity row — refresh the team feed (cheap when the
    // Activity tab isn't open: no subscriber, so it just clears the cache).
    invalidate(`activity:team:${teamId}`)
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
      invalidate(`team-meta:${teamId}`) // name/creator metadata changed
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

        <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-6 pb-24 md:pb-8">
          {children}
        </main>

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
