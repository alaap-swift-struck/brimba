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
import { Home, Settings, GraduationCap, LifeBuoy, PanelLeftClose, PanelLeftOpen } from "lucide-react"

import type { ActiveTeam } from "@/lib/use-active-team"
import { auth, content, tenancy } from "@/lib/api"
import { useRealtime, useUserRealtime } from "@/lib/realtime"
import { invalidate, patchRow, reconcile } from "@/lib/store"
import { NAV, TEAM_SECTIONS, bottomNavItems, isNavActive, type Crumb } from "@/lib/pages"
import { usePermissions } from "@/lib/perms"
import { useTeamPrewarm } from "@/lib/use-team-prewarm"
import { CreateTeamDialog } from "@/components/create-team-dialog"
import { ProfileMenu } from "@/components/profile-menu"
import { TeamSwitcher } from "@/components/team-switcher"

const NAV_ICONS = { home: Home, settings: Settings } as const
// The lucide component for each team SIDEBAR page (Learning / Help) in the rail.
const SECTION_ICONS: Record<string, typeof Home> = { learning: GraduationCap, help: LifeBuoy }

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
    /** re-pull the WHOLE list — used by reconnect catch-up to diff-patch it. */
    fetchList: () => Promise<Record<string, unknown>[]>
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
    fetchList: () => tenancy.members().then((r) => r.members),
    deps: (t, id) => [`member_roles:${t}`, `activity:user:${id}`],
    refreshCtx: true,
  },
  member_roles: {
    key: (t) => `member_roles:${t}`,
    idField: "id",
    fetchOne: (id) => tenancy.role(id),
    fetchList: () => tenancy.roles().then((r) => r.roles),
    deps: (t, id) => [`my-perms:${t}`, `role-perms:${id}`],
  },
  invites: {
    key: (t) => `invites:${t}`,
    idField: "id",
    fetchOne: (id) => tenancy.invite(id),
    fetchList: () => tenancy.invites().then((r) => r.invites),
    // The invite detail also shows the invite_logs audit + that invite's activity;
    // refresh both when the invite row changes (revoke/accept) so the detail stays live.
    deps: (_t, id) => [`invite-audit:${id}`, `activity:invite:${id}`],
  },
  // Learning content — row-level live. An edit / (de)activate elsewhere patches
  // just that article in the cached list; the row read passes the team filter so a
  // genuinely-gone item drops out. (Done toggles are personal, not broadcast.)
  learning: {
    key: (t) => `learning:${t}`,
    idField: "id",
    fetchOne: (id) => content.learningOne(id),
    fetchList: () => content.learning().then((r) => r.learning),
  },
  // Help tickets — row-level live. A status change / new reply (postHelpReply
  // pings `help` too) patches just that ticket in the cached "all" set. The
  // thread (help_threads) isn't in the registry — it refreshes when the detail is
  // (re)opened; the brief defers live thread patching.
  help: {
    key: (t) => `help:${t}`,
    idField: "id",
    fetchOne: (id) => content.helpOne(id),
    fetchList: () => content.help().then((r) => r.tickets),
    // A status change / edit / reply / stakeholder-add on a ticket also refreshes
    // its Activity tab + Stakeholders tab.
    deps: (_t, id) => [`activity:record:help:${id}`, `help-stakeholders:${id}`],
  },
}

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
  const router = useRouter()
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
  const navigate = onNavigate ?? ((href: string) => router.push(href))
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
      // catching adds too, not just edits. The small derived feeds/gates are
      // cheap, so coarse-invalidate them; active.refresh() re-pulls team name,
      // member count + my role.
      if (!teamId) return
      for (const r of Object.values(TEAM_RESOURCES)) void reconcile(r.key(teamId), r.idField, r.fetchList)
      invalidate(`activity:team:${teamId}`)
      invalidate(`my-perms:${teamId}`)
      void active.refresh()
    }
  )

  // Your OWN identity channel — account events + a forced sign-out — open even
  // before you join a team (teamless users still get it).
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
          <div className="mx-auto w-full max-w-2xl">
            <Skeleton variant="list" lines={4} />
          </div>
        </main>
      </div>
    </div>
  )
}
