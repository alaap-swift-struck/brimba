"use client"

// The deep-link resolver — ONE static shell backs the whole /t/* tree. It reads
// /t/<teamId>/<module>/<id>?panel|confirm from the URL (client-side — static
// export can't prerender ids), switches to that team if the link came from
// elsewhere, fetches each module's data + the caller's rights through the
// permission-checked endpoints, shapes it for the recipe, and renders the
// library ScreenRenderer. The engine emits open/close intents and named actions;
// the host maps intents to URL changes and dispatches actions to the API.
//
// M3 migrated the team-detail experience here: team Overview, the members /
// roles / invites LISTS + their detail screens, and the mutating actions
// (change-role, remove, invite, revoke, role deactivate). The role permission
// grid has no engine block, so its detail is host-composed (role-detail.tsx).
// Write UI is URL-driven (?panel / ?confirm) so Back closes it and links are
// shareable; it reuses the existing tested dialogs.

import * as React from "react"
import { useRouter, usePathname } from "next/navigation"

import { Button } from "@swift-struck/ui/registry/primitives/button/button"
import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"
import {
  type ScreenActionContext,
  type ScreenIntent,
} from "@swift-struck/ui/registry/collections/screen-renderer/screen-renderer"
import {
  buildScreenQuery,
  type ScreenQuery,
  type ScreenRights,
} from "@swift-struck/ui/lib/recipe"

import { AppShell, ShellLoading } from "@/components/app-shell"
import { TeamSectionNav } from "@/components/team-section-nav"
import { LearningFormDialog, type LearningFormValues } from "@/components/learning-form-dialog"
import { HelpFormDialog } from "@/components/help-form-dialog"
import { RolePickerDialog } from "@/components/role-picker-dialog"
import { RoleFormDialog } from "@/components/role-form-dialog"
import { InviteDialog } from "@/components/invite-dialog"
import { TeamEditDialog } from "@/components/team-edit-dialog"
import { ConfirmAction } from "@/components/deep-link/confirm-action"
import { renderModuleContent } from "@/components/deep-link/module-content"
import {
  ACCOUNT_MODULES,
  parseRoute,
  sectionTitle,
  TOP_LEVEL_MODULES,
  type Route,
  type SectionKey,
} from "@/components/deep-link/route"
import { HomeScreen } from "@/components/screens/home-screen"
import { SettingsScreen } from "@/components/screens/settings-screen"
import { InvitationsScreen } from "@/components/screens/invitations-screen"
import { registerHostGo } from "@/lib/nav"
// Aliased: the local `content()` dispatcher (below) shadows the api namespace.
import { ApiFailure, content as contentApi, tenancy } from "@/lib/api"
import { usePermissions } from "@/lib/perms"
import { invalidate, primeCache } from "@/lib/store"
import { useScreenData } from "@/lib/use-screen-data"
import { useScreenActions } from "@/lib/use-screen-actions"
import { useActiveTeam } from "@/lib/use-active-team"
import { reportError } from "@/lib/log"
import { personName } from "@/lib/identity"
import { type TraceTarget } from "@/lib/agent-trace"
import { onHostTrace } from "@/lib/screen-trace"
import { TEAM_SECTIONS, type Crumb } from "@/lib/pages"
import type { TeamMember } from "@shared/types"

export function DeepLinkScreen() {
  const active = useActiveTeam()
  const router = useRouter()
  const pathname = usePathname()

  // Static export → resolve the path + query on the client. Re-read on path
  // changes and on Back/Forward (popstate); query-only changes are reflected
  // synchronously by go() (a push that doesn't change the pathname won't re-fire
  // the effect). This avoids useSearchParams (which complicates static export).
  const [route, setRoute] = React.useState<Route | null>(null)
  const [noAccess, setNoAccess] = React.useState(false)
  // A CSS selector the agent asked us to ring briefly (the traced control), cleared
  // on a short timer so the highlight is a glance, not a lingering focus-steal.
  const [traceHighlight, setTraceHighlight] = React.useState<string | null>(null)
  // True once we've navigated in-app (a go() push). Lets close be history-aware:
  // an in-app panel closes by popping that push (Back also closes it); a panel
  // reached by a fresh deep link has no entry to pop, so it closes by replacing
  // to the clean URL instead of router.back() (which would leave the app).
  const navigatedRef = React.useRef(false)
  React.useEffect(() => {
    const read = () => setRoute(parseRoute(window.location.pathname, window.location.search))
    read()
    window.addEventListener("popstate", read)
    return () => window.removeEventListener("popstate", read)
  }, [pathname])

  const urlTeamId = route?.teamId || null
  const module = route?.module ?? null
  const recordId = route?.recordId ?? null
  const query = route?.query ?? {}
  const topLevel = route?.topLevel ?? false

  // Top-level pages (/learning, /help) run against the ACTIVE team (like /home);
  // /t/<id> URLs name their team explicitly. `teamId` = the effective team for
  // data; `urlTeamId` is set only when the URL names one — it drives the team
  // switch + the membership guard (top-level never switches, you're already on it).
  const activeTeamId = active.ctx?.team?.id ?? null
  const teamId = urlTeamId ?? activeTeamId
  const teamCount = active.ctx?.teams.length ?? 0
  const isMemberOfUrlTeam = urlTeamId
    ? (active.ctx?.teams.some((t) => t.id === urlTeamId) ?? false)
    : true
  const switchTeam = active.switchTeam
  // Tracks the URL-team we've SYNCED the active team to. Lets us tell a DEEP-LINK
  // (never synced to this URL's team yet → adopt it) from an external TEAM SWITCH (we
  // WERE synced here, then the switcher moved the active team away → follow it to
  // /home instead of snapping back). Keying off "were we synced" (not "did the URL
  // change") makes it race- and StrictMode-safe: a mid-adopt re-render re-adopts
  // rather than wrongly bouncing to /home.
  const syncedTeam = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (active.loading || !urlTeamId) return
    if (!isMemberOfUrlTeam) {
      // Removed from this team. Go to the active team's home if one remains;
      // if teamless, use-active-team has already routed us to onboarding.
      if (teamCount > 0) router.replace("/home")
      return
    }
    setNoAccess(false)
    if (activeTeamId === urlTeamId) {
      syncedTeam.current = urlTeamId // we're on this team now — remember it
      return
    }
    if (activeTeamId) {
      if (syncedTeam.current === urlTeamId) {
        // We were on this URL's team, then switched away elsewhere → follow the switch.
        router.replace("/home")
      } else {
        // Deep link to another of your teams → switch to it (server re-validates).
        // A member whose team is still provisioning fails here = the no-access case.
        switchTeam(urlTeamId).catch(() => setNoAccess(true))
      }
    }
  }, [urlTeamId, activeTeamId, isMemberOfUrlTeam, teamCount, active.loading, switchTeam, router])

  const onTeam = !!teamId && active.ctx?.team?.id === teamId
  const enabled = Boolean(teamId && onTeam)
  const { perms, can } = usePermissions(enabled ? teamId : null)

  // Per-module data — cache-first + null-keyed (a screen fetches only the modules
  // it shows). Lifted into one hook so the host reads as "fetch, then render".
  const {
    overridesQ,
    membersQ,
    rolesQ,
    invitesQ,
    metaQ,
    learningQ,
    helpQ,
    formSelectableQ,
    selectableValues,
    helpTypeOptions,
    learningCategoryOptions,
    contentTypeOptions,
    activityScope,
    activityKey,
    activityQ,
    inviteAuditQ,
  } = useScreenData({ teamId, enabled, module, recordId })

  // The help My/All toggle filters the one cached ticket set client-side by raiser.
  const [helpScope, setHelpScope] = React.useState<"mine" | "all">("all")

  const roles = rolesQ.data ?? []
  const activeRoles = roles.filter((r) => r.active)
  const rights: ScreenRights = perms ?? {}

  /* ------------------------------ navigation ------------------------------ */

  // The base URL for the current screen — a clean top-level path (/learning) or the
  // team-scoped form (/t/<teamId>/<module>). go() / breadcrumbs / closePanel build
  // off these, so intra-screen nav stays in whichever form you arrived through.
  const teamPath = teamId ? `/t/${teamId}` : "/"
  const moduleBase = topLevel
    ? `/${module}`
    : module && module !== "team"
      ? `/t/${teamId}/${module}`
      : teamPath
  const sectionPath = moduleBase
  const currentPath = recordId ? `${moduleBase}/${recordId}` : moduleBase

  // A path the deep-link host owns (so go/replace use the History API, no reload):
  // the whole /t/* tree, plus the top-level module pages (/learning, /help).
  const isInAppPath = (p: string) =>
    p.startsWith("/t") || TOP_LEVEL_MODULES.some((m) => p === `/${m}` || p.startsWith(`/${m}/`))

  // Navigate. The ENTIRE /t/* tree is one static shell (this component never
  // unmounts), so moving WITHIN it must NOT use the framework router: in a static
  // export the router has no data file for an arbitrary /t/<…> path and falls
  // back to a full-page reload (re-runs the session check, refetches everything,
  // wipes the in-memory cache). Instead we change the URL with the History API —
  // Next observes pushState, the route segment never changes, nothing reloads,
  // and the cache stays warm — then swap the screen from `route` state. Leaving
  // /t (Home/Settings) is a real route change, so use the router there.
  const go = React.useCallback(
    (path: string, q?: ScreenQuery) => {
      navigatedRef.current = true
      const search = q ? buildScreenQuery(q) : ""
      const url = path + search
      if (isInAppPath(path)) {
        window.history.pushState(null, "", url)
        setRoute(parseRoute(path, search))
      } else {
        router.push(url)
      }
    },
    [router]
  )
  const replace = React.useCallback(
    (path: string) => {
      if (isInAppPath(path)) {
        window.history.replaceState(null, "", path)
        setRoute(parseRoute(path, ""))
      } else {
        router.replace(path)
      }
    },
    [router]
  )
  // Close an open ?panel / ?confirm. In-app: pop the push (Back closes too).
  // Deep-linked (no in-app history): replace to the clean path so the panel
  // closes in place and the URL is cleaned, rather than leaving the app.
  const closePanel = () => {
    if (navigatedRef.current) router.back()
    else replace(currentPath)
  }

  // Register THIS host's soft go() so deep components (the profile menu, team switcher,
  // invite inbox) navigate through the History API instead of router.push — no reload.
  React.useEffect(() => registerHostGo(go), [go])

  // Real-screen tracing: the agent panel emits a trace target per write step. The whole
  // app is one shell now, so we honour it from ANY screen (Home included) — `onTeam`
  // falls back to the active team, and go() into /t is a soft History-API move (no
  // reload). We only skip a trace for a DIFFERENT team than the one shown (a safety net;
  // the agent only acts in the current team). Move softly via go(), then ring the control.
  React.useEffect(() => {
    return onHostTrace(({ teamId: traceTeam, target }: { teamId: string; target: TraceTarget }) => {
      if (!teamId || traceTeam !== teamId || !onTeam) return
      if (!isInAppPath(target.path)) return
      // Traces move the screen to the RESULT (no query → no dialog opens); the ring
      // draws attention to the changed row/record once it lands.
      go(target.path)
      setTraceHighlight(target.highlight ?? null)
    })
    // go/isInAppPath are stable-enough; re-subscribe when the shown team/host changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, onTeam, go])

  // Clear the highlight shortly after it lands (a glance, then gone).
  React.useEffect(() => {
    if (!traceHighlight) return
    const t = setTimeout(() => setTraceHighlight(null), 2200)
    return () => clearTimeout(t)
  }, [traceHighlight])

  /* ------------------------------- mutations ------------------------------ */

  // The write layer (named-action dispatcher + the two rich-payload creators),
  // lifted into one hook. Each action calls the permission-checked endpoint, primes
  // the actor's cache and invalidates any changed sibling count; runAction throws on
  // failure so the calling dialog / confirm surfaces it.
  const { runAction, createLearning, createHelp } = useScreenActions(teamId)

  /* ------------------------- engine intent + action ------------------------ */

  function onIntent(intent: ScreenIntent) {
    if (intent.kind === "open")
      // Open a record in the SAME URL form we're in (clean top-level or /t-scoped).
      go(topLevel ? `/${intent.module}/${intent.id}` : `/t/${teamId}/${intent.module}/${intent.id}`)
    else if (intent.kind === "close") {
      if (query.panel || query.confirm) closePanel()
      else router.back()
    }
    // tab intent: TabsView keeps its own state; URL-tab sync is a later milestone.
  }

  // An engine action → host. Confirming / input-gathering actions route to the
  // URL (?panel / ?confirm); the dialog or confirm there does the mutation.
  function onAction(actionId: string, ctx: ScreenActionContext) {
    const id = ctx.id ?? ""
    switch (actionId) {
      case "members.changeRole":
        go(currentPath, { panel: "edit", module: "members", id })
        break
      case "members.remove":
        go(currentPath, { confirm: "members.remove", id })
        break
      case "invites.revoke":
        go(currentPath, { confirm: "invites.revoke", id })
        break
      case "team.edit":
        go(currentPath, { panel: "edit", module: "team" })
        break
    }
  }

  /* --------------------------------- render -------------------------------- */

  if (active.loading || !active.ctx || !route) return <ShellLoading />

  // Account screens (/home, /settings, /invitations) render DIRECTLY in the shell — they
  // aren't team-scoped module content, so they skip the team tabs / queries / membership
  // gate below. Because they live inside this one never-unmounting shell, moving in and
  // out of them (and into /t) is soft History-API nav — no reload anywhere.
  if (ACCOUNT_MODULES.includes(module ?? "")) {
    const accountCrumbs: Crumb[] =
      module === "settings"
        ? [{ label: "Settings" }]
        : module === "invitations"
          ? [{ label: "Invitations" }]
          : []
    return (
      <AppShell active={active} breadcrumbs={accountCrumbs} onNavigate={go} activePath={currentPath}>
        {module === "home" && <HomeScreen active={active} />}
        {module === "settings" && <SettingsScreen active={active} />}
        {module === "invitations" && <InvitationsScreen active={active} />}
      </AppShell>
    )
  }

  // About to be redirected: the membership effect sends us to /home when the URL
  // points at a team we're no longer in (we still have others). Show the loading
  // frame — NOT the shell bound to the auto-fallback team — so we never flash the
  // wrong team's name/logo in the header/breadcrumb during the hop.
  if (teamId && !isMemberOfUrlTeam && teamCount > 0) return <ShellLoading />

  const teamName = active.ctx.team?.name ?? "Team"
  const myUserId = active.user?.id ?? null
  // Import has no read-right of its own — it's gated per-target. You can reach it
  // if you can CREATE into any supported target (member_roles or learning).
  const canImport = can("member_roles", "create") || can("learning", "create")
  const section: SectionKey =
    module === "members" ||
    module === "roles" ||
    module === "invites" ||
    module === "dropdowns" ||
    module === "learning" ||
    module === "help" ||
    module === "import"
      ? module
      : "overview"
  // Learning/Help are sidebar PAGES now and Import is contextual — the team tab
  // strip shows only on the "tab" sections (Overview / Members / Roles / Invites).
  const showTabs = (TEAM_SECTIONS.find((s) => s.key === section)?.placement ?? "tab") === "tab"

  // Section-tab count badges — DERIVED, never hand-listed (LAW R8): each section
  // that declares a countCacheKey (pages.ts) gets the length of that key's loaded
  // rows, so a new collection tab can't ship without a count. The rows come from
  // the queries above, keyed by the same cache prefix; members has no team-wide
  // cache loaded here, so its count reads the active-member count from context.
  const loadedByCacheKey: Record<string, unknown[] | undefined> = {
    members: active.ctx.memberCount != null ? new Array(active.ctx.memberCount) : undefined,
    member_roles: rolesQ.data,
    invites: invitesQ.data,
    selectable: formSelectableQ.data,
    learning: learningQ.data,
    help: helpQ.data,
  }
  const sectionCounts: Partial<Record<SectionKey, number>> = {}
  for (const s of TEAM_SECTIONS) {
    if (!s.countCacheKey) continue
    const rows = loadedByCacheKey[s.countCacheKey]
    if (rows !== undefined) sectionCounts[s.key] = rows.length
  }

  // Breadcrumbs derived from the URL spine; the library Breadcrumbs collapses the
  // middle on small screens. The last crumb is the current page (no href).
  const crumbs: Crumb[] = []
  if (topLevel) {
    // A top-level page (Learning / Help) — its OWN page, not under Settings.
    crumbs.push({ label: sectionTitle(module ?? ""), href: recordId ? sectionPath : undefined })
    if (recordId) {
      const label = recordLabel()
      if (label) crumbs.push({ label })
    }
  } else {
    crumbs.push({ label: "Settings", href: "/settings" }, { label: teamName, href: teamPath })
    if (module && module !== "team") {
      crumbs.push({ label: sectionTitle(module), href: sectionPath })
      if (recordId) {
        const label = recordLabel()
        if (label) crumbs.push({ label })
      }
    }
  }

  function recordLabel(): string {
    if (module === "members")
      return membersQ.data?.find((m) => m.userId === recordId)
        ? personName(membersQ.data.find((m) => m.userId === recordId) as TeamMember)
        : "Member"
    if (module === "roles") return roles.find((r) => r.id === recordId)?.title ?? "Role"
    if (module === "invites")
      return invitesQ.data?.find((i) => i.id === recordId)?.email ?? "Invite"
    if (module === "learning")
      return learningQ.data?.find((l) => l.id === recordId)?.title ?? "Article"
    if (module === "help") return "Ticket"
    return ""
  }


  // The change-role target (for the picker) + confirm targets, from the URL id.
  const changeTarget =
    query.panel === "edit" && query.module === "members" && query.id
      ? (membersQ.data?.find((m) => m.userId === query.id) ?? null)
      : null

  return (
    <AppShell active={active} breadcrumbs={crumbs} onNavigate={go} activePath={currentPath}>
      {/* data-trace marks the screen the agent just drove; the ring is a short-lived
       * glance cue (auto-cleared) so the user sees WHERE a traced change landed. It
       * rings the content region — a just-opened dialog draws the eye on its own. */}
      <div
        data-trace={traceHighlight ?? undefined}
        className={`mx-auto flex w-full max-w-3xl flex-col gap-6 rounded-xl transition-shadow ${
          traceHighlight ? "ring-primary/60 ring-2 ring-offset-2 ring-offset-background" : ""
        }`}
      >
        {showTabs && (
          <TeamSectionNav
            teamId={teamId as string}
            current={section}
            perms={perms}
            counts={sectionCounts}
            onNavigate={(href) => go(href)}
          />
        )}
        {renderModuleContent({
          noAccess, enabled, perms, can, module, recordId, teamId, canImport, go,
          overridesQ, metaQ, membersQ, rolesQ, roles, invitesQ, learningQ, helpQ,
          activityQ, inviteAuditQ, teamName, active, rights, onAction, onIntent,
          sectionPath, helpScope, setHelpScope, myUserId, query,
        })}
      </div>

      {/* Change a member's role (?panel=edit&module=members&id). Gated by the
       * edit right — a deep link can't reach a form the action would hide
       * (block at every step, incl. deep-link entry — not just at submit). */}
      <RolePickerDialog
        open={
          query.panel === "edit" &&
          query.module === "members" &&
          !!query.id &&
          can("team_members", "edit")
        }
        onOpenChange={(o) => !o && closePanel()}
        roles={activeRoles}
        currentRoleId={changeTarget?.roleId ?? null}
        subjectName={changeTarget ? personName(changeTarget) : null}
        onPick={(roleId) => runAction("members.changeRole", { userId: query.id ?? "", roleId })}
      />

      {/* Invite someone (?panel=add&module=invites) — gated by create. */}
      <InviteDialog
        open={query.panel === "add" && query.module === "invites" && can("team_members", "create")}
        onOpenChange={(o) => !o && closePanel()}
        draftKey={teamId ? `invite:new:${teamId}` : undefined}
        roles={activeRoles}
        onSubmit={(email, roleId) => runAction("invites.create", { email, roleId })}
      />

      {/* Create a role (?panel=add&module=roles) — gated by create. */}
      <RoleFormDialog
        open={query.panel === "add" && query.module === "roles" && can("member_roles", "create")}
        onOpenChange={(o) => !o && closePanel()}
        draftKey={teamId ? `role:new:${teamId}` : undefined}
        onSubmit={(title, description) => runAction("roles.create", { title, description })}
      />

      {/* Create a learning article (?panel=add&module=learning) — gated by create. */}
      <LearningFormDialog
        open={query.panel === "add" && query.module === "learning" && can("learning", "create")}
        onOpenChange={(o) => !o && closePanel()}
        draftKey={teamId ? `learning:new:${teamId}` : undefined}
        teamId={teamId}
        categoryOptions={learningCategoryOptions}
        contentTypeOptions={contentTypeOptions}
        onSubmit={createLearning}
      />

      {/* Raise a help ticket (?panel=add&module=help) — gated by create. */}
      <HelpFormDialog
        open={query.panel === "add" && query.module === "help" && can("help", "create")}
        onOpenChange={(o) => !o && closePanel()}
        draftKey={teamId ? `help:new:${teamId}` : undefined}
        teamId={teamId}
        helpTypeOptions={helpTypeOptions}
        onSubmit={createHelp}
      />

      {/* Edit the team (?panel=edit&module=team) — gated by teams:edit. */}
      <TeamEditDialog
        open={query.panel === "edit" && query.module === "team" && can("teams", "edit")}
        onOpenChange={(o) => !o && closePanel()}
        draftKey={teamId ? `team:edit:${teamId}` : undefined}
        team={active.ctx.team}
        onSaved={active.refresh}
      />

      {/* Destructive confirms (?confirm=members.remove | invites.revoke) — both
       * need team_members:delete, gated so a deep link can't reach them. */}
      <ConfirmAction
        query={query}
        canRun={can("team_members", "delete")}
        memberName={
          query.confirm === "members.remove"
            ? (membersQ.data?.find((m) => m.userId === query.id) ?? null)
            : null
        }
        onCancel={closePanel}
        onConfirm={async () => {
          if (!query.confirm || !query.id) return
          const payload: Record<string, string> =
            query.confirm === "members.remove"
              ? { userId: query.id }
              : { inviteId: query.id }
          try {
            await runAction(query.confirm, payload)
            // The member is gone / the invite changed — return to the list.
            replace(sectionPath)
          } catch (err) {
            if (!(err instanceof ApiFailure)) reportError("deep-link:confirm", err)
            toast.error(err instanceof ApiFailure ? err.message : "Something went wrong. Try again.")
          }
        }}
      />
    </AppShell>
  )
}

