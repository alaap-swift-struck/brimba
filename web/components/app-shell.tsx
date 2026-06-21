"use client"

// AppShell — the persistent frame every in-app screen sits inside. Desktop: a
// left sidebar (team switcher, Home/Settings nav, profile). Mobile: a top bar
// (switcher + profile) and a bottom tab bar. A breadcrumb strip (per page) shows
// where you are and lets you climb back. One live channel for the active team is
// opened here, refreshing caches when something changes. Composed from library
// primitives.

import * as React from "react"
import { useRouter, usePathname } from "next/navigation"

import { Breadcrumbs } from "@swift-struck/ui/registry/primitives/breadcrumbs/breadcrumbs"
import { ModeToggle } from "@swift-struck/ui/registry/primitives/mode-toggle/mode-toggle"
import { Skeleton } from "@swift-struck/ui/registry/primitives/skeleton/skeleton"
import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"
import { Home, Settings, PanelLeftClose, PanelLeftOpen } from "lucide-react"

import type { ActiveTeam } from "@/lib/use-active-team"
import { auth, tenancy } from "@/lib/api"
import { useRealtime, useUserRealtime } from "@/lib/realtime"
import { invalidate, patchRow } from "@/lib/store"
import { NAV, bottomNavItems, isNavActive, type Crumb } from "@/lib/pages"
import { CreateTeamDialog } from "@/components/create-team-dialog"
import { ProfileMenu } from "@/components/profile-menu"
import { TeamSwitcher } from "@/components/team-switcher"

const NAV_ICONS = { home: Home, settings: Settings } as const

// Row-level live registry: a "<resource> row <id> changed" ping → re-pull JUST
// that row and patch it into the cached list (never refetch the whole list);
// then refresh the small dependent aggregations/feeds coarsely (cheap — a 50-row
// feed or a role-count list, not the big collection). Adding a module = ONE
// entry here; the handler stays generic (no bespoke per-resource code).
const TEAM_RESOURCES: Record<
  string,
  {
    key: (teamId: string) => string
    idField: string
    fetchOne: (id: string) => Promise<Record<string, unknown> | null>
    /** small dependent caches to coarse-invalidate (aggregations / feeds). */
    deps?: (teamId: string, id: string) => string[]
    /** refresh the active-team context (e.g. the section member count). */
    refreshCtx?: boolean
  }
> = {
  members: {
    key: (t) => `members:${t}`,
    idField: "userId",
    fetchOne: (id) => tenancy.member(id),
    deps: (t, id) => [`member_roles:${t}`, `activity:user:${id}`],
    refreshCtx: true,
  },
  member_roles: {
    key: (t) => `member_roles:${t}`,
    idField: "id",
    fetchOne: (id) => tenancy.role(id),
    deps: (t, id) => [`my-perms:${t}`, `role-perms:${id}`],
  },
  invites: {
    key: (t) => `invites:${t}`,
    idField: "id",
    fetchOne: (id) => tenancy.invite(id),
  },
}

export function AppShell({
  active,
  children,
  breadcrumbs,
  onNavigate,
}: {
  active: ActiveTeam
  children: React.ReactNode
  breadcrumbs?: Crumb[]
  /** How a breadcrumb link navigates. The deep-link host passes its History-API
   * `go` so in-team crumbs don't trigger a full reload; other pages fall back to
   * the router. */
  onNavigate?: (href: string) => void
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

  // The active team's live channel. A ping patches ONLY the changed row in place
  // (row-level), via the generic registry above — no full-collection refetch.
  useRealtime(
    teamId,
    (event) => {
      if (!teamId) return
      // The team activity feed is append-only + small — refresh it on any change.
      invalidate(`activity:team:${teamId}`)
      if (event.resource === "team") {
        invalidate(`team-meta:${teamId}`)
        void active.refresh() // team name/logo
        return
      }
      const r = TEAM_RESOURCES[event.resource]
      if (!r) return
      if (!event.id) {
        // No row id on the ping → coarse-refetch just that collection (still
        // scoped, never a page reload). Row-level kicks in once the publisher
        // carries the id.
        invalidate(r.key(teamId))
        if (r.refreshCtx) void active.refresh()
        return
      }
      const id = event.id
      void patchRow(r.key(teamId), r.idField, id, () => r.fetchOne(id))
      for (const k of r.deps?.(teamId, id) ?? []) invalidate(k)
      if (r.refreshCtx) void active.refresh()
    },
    () => {
      // Reconnect after a dropped link: re-pull only the collections we hold (no
      // page reload), so nothing missed stays stale. (Precise per-id catch-up is
      // a planned refinement.)
      if (!teamId) return
      for (const r of Object.values(TEAM_RESOURCES)) invalidate(r.key(teamId))
      invalidate(`activity:team:${teamId}`)
    }
  )

  // Your OWN identity channel — account events + a forced sign-out — open even
  // before you join a team (teamless users still get it).
  const userId = active.user?.id ?? null
  useUserRealtime(userId, (event) => {
    if (event.resource === "session") {
      // A sign-out signal reaches ALL your devices (e.g. you changed your email
      // elsewhere). Only the devices whose session was actually dropped should
      // bounce to login — the acting device keeps its still-valid session, so
      // re-check first and redirect only if the session is dead.
      auth.me().catch(() => window.location.assign("/login"))
      return
    }
    if (event.resource === "account_activity") {
      invalidate("account-activity") // your own account feed (small) refreshes live
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

        {/* Breadcrumbs — URL-derived, collapsing on small screens (library
         * primitive). The host owns the router, so links route through onNavigate. */}
        {breadcrumbs && breadcrumbs.length > 0 && (
          <div className="px-4 pt-4">
            <Breadcrumbs
              items={breadcrumbs}
              onNavigate={onNavigate ?? ((href) => router.push(href))}
            />
          </div>
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
