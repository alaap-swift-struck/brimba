"use client"

// AppShell — the persistent frame every in-app screen sits inside. Desktop: a
// left sidebar (team switcher, Home/Settings nav, profile). Mobile: a top bar
// (switcher + profile) and a bottom tab bar. A breadcrumb strip (per page) shows
// where you are and lets you climb back. One live channel for the active team is
// opened here, refreshing caches when something changes. Composed from library
// primitives.

import * as React from "react"
import { usePathname } from "next/navigation"

import { Breadcrumbs } from "@swift-struck/ui/registry/primitives/breadcrumbs/breadcrumbs"
import { ConnectionStatus } from "@swift-struck/ui/registry/primitives/connection-status/connection-status"
import { ModeToggle } from "@swift-struck/ui/registry/primitives/mode-toggle/mode-toggle"
import { Skeleton } from "@swift-struck/ui/registry/primitives/skeleton/skeleton"
import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"
import { Home, Settings, GraduationCap, LifeBuoy, PanelLeftClose, PanelLeftOpen } from "lucide-react"

import type { ActiveTeam } from "@/lib/use-active-team"
import { auth } from "@/lib/api"
import { softNavigate } from "@/lib/nav"
import { useRealtime, useUserRealtime } from "@/lib/realtime"
// The row-level registry + coarse invalidations moved to lib (R15): they're DATA
// the live-collections check imports, and the thread/help_threads + agent_usage
// deaf-exemptions live beside them in the rules registry.
import { SIMPLE_INVALIDATIONS, TEAM_RESOURCES, totalKey } from "@/lib/live-resources"
import { invalidate, patchRow, primeCache, readCache, reconcile } from "@/lib/store"
import { NAV, TEAM_SECTIONS, bottomNavItems, isNavActive, type Crumb } from "@/lib/pages"
import { usePermissions } from "@/lib/perms"
import { useTeamPrewarm } from "@/lib/use-team-prewarm"
import { CreateTeamDialog } from "@/components/create-team-dialog"
import { ProfileMenu } from "@/components/profile-menu"
import { TeamSwitcher } from "@/components/team-switcher"

const NAV_ICONS = { home: Home, settings: Settings } as const
// The lucide component for each team SIDEBAR page (Learning / Help) in the rail.
const SECTION_ICONS: Record<string, typeof Home> = { learning: GraduationCap, help: LifeBuoy }

export function AppShell({
  active,
  children,
  breadcrumbs,
  onNavigate,
  activePath,
}: {
  active: ActiveTeam
  children: React.ReactNode
  breadcrumbs?: Crumb[]
  /** How a breadcrumb / nav link navigates. The deep-link host passes its
   * History-API `go` so in-team moves don't trigger a full reload; other pages
   * fall back to the router. */
  onNavigate?: (href: string) => void
  /** The live in-app path, for nav highlighting. The deep-link host moves via the
   * History API (which `usePathname` doesn't observe), so it passes the current
   * path here; other pages rely on `usePathname`. */
  activePath?: string
}) {
  const pathname = usePathname()
  const [creating, setCreating] = React.useState(false)
  // The AI co-pilot (launcher + panel + screen-trace engine) is mounted ONCE at the
  // root layout (agent-host.tsx) so it survives navigation — it is deliberately NOT
  // owned by this per-route shell anymore.
  const teamId = active.ctx?.team?.id ?? null
  const userId = active.user?.id ?? null

  // Warm the cheap always-needed team-wide caches on team entry so the first tap
  // into a tab paints from cache, not a skeleton. Cold-guarded + failure-swallowed
  // (see the hook) — it only SEEDS cold keys, never touching a warm/live entry.
  useTeamPrewarm(teamId)

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

  const { can } = usePermissions(teamId)
  const navigate = onNavigate ?? softNavigate
  const here = activePath ?? pathname

  // The rail: the universal anchors (Home / Settings) with the team's first-class
  // SIDEBAR pages (Learning / Help) slotted between them — each scoped to the
  // active team and gated by its own read right, so it vanishes for anyone who
  // can't read it (and when teamless). ONE composed list drives both the desktop
  // rail and the mobile bottom bar.
  type ShellLink = { slug: string; title: string; Icon: typeof Home; path: string }
  const universal: ShellLink[] = NAV.filter((i) => !i.need).map((i) => ({
    slug: i.slug,
    title: i.title,
    Icon: NAV_ICONS[i.icon],
    path: i.path,
  }))
  const sidebarPages: ShellLink[] = teamId
    ? TEAM_SECTIONS.filter((s) => s.placement === "sidebar" && can(s.module, "read")).map((s) => ({
        slug: s.key,
        title: s.title,
        Icon: SECTION_ICONS[s.key] ?? Home,
        // Clean top-level URL (/learning, /help) — resolves the active team from
        // context, like Home. (The gateway serves the shell for any sub-path.)
        path: `/${s.segment}`,
      }))
    : []
  const homeIdx = universal.findIndex((i) => i.slug === "home")
  const navLinks: ShellLink[] =
    homeIdx >= 0
      ? [...universal.slice(0, homeIdx + 1), ...sidebarPages, ...universal.slice(homeIdx + 1)]
      : [...sidebarPages, ...universal]
  const bottomNav = bottomNavItems(navLinks)

  // The active team's live channel. A ping patches ONLY the changed row in place
  // (row-level), via the generic registry above — no full-collection refetch.
  const teamLink = useRealtime(
    teamId,
    (event) => {
      if (!teamId) return
      // The team activity feed is append-only + small — refresh it on any change.
      invalidate(`activity:team:${teamId}`)
      // Coarse listeners (team meta, screen recipes) — data-driven, R15.
      const simple = SIMPLE_INVALIDATIONS[event.resource]
      if (simple) {
        for (const k of simple(teamId)) invalidate(k)
        if (event.resource === "team") void active.refresh() // team name/logo
        return
      }
      const r = TEAM_RESOURCES[event.resource]
      if (!r) return
      // R16: an add/remove moves the collection's exact total by one — bump the
      // primed sidecar so badges stay honest between full refetches.
      if (event.op === "add" || event.op === "remove") {
        const tk = totalKey(event.resource === "selectable_data" ? "selectable" : event.resource, teamId)
        const t = readCache<number>(tk)
        if (typeof t === "number") primeCache(tk, Math.max(0, t + (event.op === "add" ? 1 : -1)))
      }
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
      // If MY membership row changed (e.g. an admin swapped my role), my own
      // effective rights may differ now — refresh the permission gate so my
      // nav/buttons reflect it live, not just how others see my row.
      if (event.resource === "members" && id === userId) invalidate(`my-perms:${teamId}`)
      if (r.refreshCtx) void active.refresh()
    },
    () => {
      // Reconnect after a dropped link: catch up on everything we missed, with
      // no page reload. The row-level lists are DIFF-PATCHED in place (reconcile:
      // only changed rows re-render, new rows appear in order, gone rows drop) —
      // catching adds too, not just edits; the total-priming fetchers re-prime
      // the badges as they run. Paged screens come back with them, because they
      // read the SAME cache keys these reconcile. The small
      // derived feeds/gates are cheap, so coarse-invalidate them.
      if (!teamId) return
      for (const r of Object.values(TEAM_RESOURCES))
        void reconcile(r.key(teamId), r.idField, () => r.fetchList(teamId))
      invalidate(`activity:team:${teamId}`)
      invalidate(`my-perms:${teamId}`)
      void active.refresh()
    }
  )

  // Your OWN identity channel — account events + a forced sign-out — open even
  // before you join a team (teamless users still get it).
  const userLink = useUserRealtime(userId, (event) => {
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
    if (event.resource === "profile") {
      // You edited your name/photo on another device — refresh your identity so
      // the sidebar/profile menu update here too (member rows others see update
      // via each team's own channel).
      void active.refresh()
    }
    if (event.resource === "teams") {
      // Cross-team membership changed (you joined, were removed, or created a
      // team). Refresh the switcher + active context. If this drops your LAST
      // team, use-active-team routes you to onboarding; if it drops the team
      // you're VIEWING, deep-link-screen routes you home (decision #8).
      void active.refresh()
    }
  })

  // Is what you're looking at still true? The shell owns the sockets, so it owns
  // the answer. Inside a team the TEAM channel is the one keeping the screen
  // current; teamless, only your own channel is open. Deliberately a dot and not
  // a banner — nobody needs reassurance every second, they need to notice when
  // it is NOT live, and a bar across the top for every blip trains people to
  // ignore bars across the top. The word is always in the DOM for screen
  // readers, and `title` gives it to a mouse.
  const link = teamId ? teamLink : userLink
  const linkTitle =
    link === "live"
      ? "Live — this screen updates as your team works"
      : link === "reconnecting"
        ? "Reconnecting — what you can see may be out of date"
        : "Offline — what you can see may be out of date"
  const liveDot = (
    <span title={linkTitle} className="flex items-center">
      <ConnectionStatus state={link} />
    </span>
  )

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
          {navLinks.map((item) => {
            const Icon = item.Icon
            const activeNav = isNavActive(item.path, here)
            return (
              <button
                key={item.slug}
                type="button"
                onClick={() => navigate(item.path)}
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
          {liveDot}
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
            {liveDot}
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
              onNavigate={onNavigate ?? softNavigate}
            />
          </div>
        )}

        <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-6 pb-24 md:px-[10%] md:pb-8">
          {children}
        </main>

        {/* Mobile bottom tabs — capped at 5, Home centered, gated items hidden */}
        <nav className="glass fixed inset-x-0 bottom-0 z-20 flex items-center justify-around border-t px-2 py-1.5 md:hidden">
          {bottomNav.map((item) => {
            const Icon = item.Icon
            const activeNav = isNavActive(item.path, here)
            return (
              <button
                key={item.slug}
                type="button"
                onClick={() => navigate(item.path)}
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
        draftKey="team:new"
        onCreate={async (name) => {
          await active.createTeam(name)
          toast.success(`Created ${name}`)
        }}
      />

      {/* The AI co-pilot (launcher + panel) now lives at the root layout
       * (agent-host.tsx) so it survives navigation — it is intentionally not
       * rendered here. */}
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
          <div className="mx-auto w-full">
            <Skeleton variant="list" lines={4} />
          </div>
        </main>
      </div>
    </div>
  )
}
