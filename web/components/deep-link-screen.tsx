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
import { Sparkles } from "lucide-react"

import { Button } from "@swift-struck/ui/registry/primitives/button/button"
import { Skeleton } from "@swift-struck/ui/registry/primitives/skeleton/skeleton"
import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"
import { TabsView, defaultTabsConfig } from "@swift-struck/ui/registry/primitives/tabs/tabs"
import {
  ScreenRenderer,
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
import { RoleDetailScreen } from "@/components/role-detail"
import { LearningDetailScreen } from "@/components/learning-detail"
import { LearningProgressScreen } from "@/components/learning-progress"
import { LearningFormDialog, type LearningFormValues } from "@/components/learning-form-dialog"
import { HelpDetailScreen } from "@/components/help-detail"
import { HelpFormDialog } from "@/components/help-form-dialog"
import { ImportScreen } from "@/components/import-screen"
import { SelectableScreen } from "@/components/selectable-screen"
import { AgentPanel } from "@/components/agent-panel"
import { RolePickerDialog } from "@/components/role-picker-dialog"
import { RoleFormDialog } from "@/components/role-form-dialog"
import { InviteDialog } from "@/components/invite-dialog"
import { TeamEditDialog } from "@/components/team-edit-dialog"
import { ConfirmAction } from "@/components/deep-link/confirm-action"
import { NoAccess, NotFound, LoadError, SectionWithCreate } from "@/components/deep-link/screen-bits"
import {
  parseRoute,
  sectionTitle,
  TOP_LEVEL_MODULES,
  type Route,
  type SectionKey,
} from "@/components/deep-link/route"
import {
  shapeHelpList,
  shapeInviteDetail,
  shapeInvitesList,
  shapeLearningList,
  shapeMemberDetail,
  shapeMembersList,
  shapeRolesList,
  shapeTeamDetail,
} from "@/components/deep-link/shape"
// Aliased: the local `content()` dispatcher (below) shadows the api namespace.
import { ApiFailure, content as contentApi, tenancy } from "@/lib/api"
import { usePermissions } from "@/lib/perms"
import { invalidate, primeCache, useCached } from "@/lib/store"
import { useActiveTeam } from "@/lib/use-active-team"
import { reportError } from "@/lib/log"
import { personName } from "@/lib/identity"
import { MODULE_PERMISSION, resolveRecipe, withoutActions } from "@/lib/screens"
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
  // The app-wide AI co-pilot sheet (a launcher opens it; gated by agent:create).
  const [agentOpen, setAgentOpen] = React.useState(false)
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

  // Per-module data — cache-first, null-keyed when the module doesn't need it.
  const overridesQ = useCached(enabled ? `screens:${teamId}` : null, () =>
    tenancy.screenOverrides().then((r) => r.screens)
  )
  const membersQ = useCached(
    enabled && module === "members" ? `members:${teamId}` : null,
    () => tenancy.members().then((r) => r.members)
  )
  // Roles back the roles list, the breadcrumb label, the change-role picker and
  // the invite form's role options — load them for the whole team area.
  const rolesQ = useCached(enabled ? `member_roles:${teamId}` : null, () =>
    tenancy.roles().then((r) => r.roles)
  )
  // Invites back the invites list AND the section-tab count badge, so load them
  // across the team area (cache-first + live, so the count stays honest).
  const invitesQ = useCached(enabled ? `invites:${teamId}` : null, () =>
    tenancy.invites().then((r) => r.invites)
  )
  const metaQ = useCached(enabled && module === "team" ? `team-meta:${teamId}` : null, () =>
    tenancy.teamMeta()
  )
  // Learning backs its list, the breadcrumb label and the article detail; load it
  // for the whole learning area (cache-first + row-level live, decision below).
  const learningQ = useCached(enabled && module === "learning" ? `learning:${teamId}` : null, () =>
    contentApi.learning().then((r) => r.learning)
  )
  // Help backs its list (All set), the breadcrumb label and the ticket thread.
  // ONE cache holds the whole team's tickets (the live registry patches it
  // row-by-row); the My/All toggle filters that set client-side by raiser.
  const helpQ = useCached(enabled && module === "help" ? `help:${teamId}` : null, () =>
    contentApi.help("all").then((r) => r.tickets)
  )
  // The team's dropdown values — feed the help/learning forms' Type/Category pickers.
  const formSelectableQ = useCached(
    enabled && (module === "help" || module === "learning") ? `selectable:${teamId}` : null,
    () => tenancy.selectable().then((r) => r.values)
  )
  const selectableValues = formSelectableQ.data ?? []
  const helpTypeOptions = selectableValues.filter((v) => v.type === "Help type").map((v) => v.value)
  const learningCategoryOptions = selectableValues
    .filter((v) => v.type === "Learning category")
    .map((v) => v.value)
  const contentTypeOptions = selectableValues.filter((v) => v.type === "File type").map((v) => v.value)
  const [helpScope, setHelpScope] = React.useState<"mine" | "all">("all")
  const activityScope: "team" | "user" | "invite" | null =
    module === "team"
      ? "team"
      : module === "members" && recordId
        ? "user"
        : module === "invites" && recordId
          ? "invite"
          : null
  const activityKey =
    !enabled || !activityScope
      ? null
      : activityScope === "team"
        ? `activity:team:${teamId}`
        : `activity:${activityScope}:${recordId}`
  const activityQ = useCached(activityKey, () =>
    tenancy
      .activity(activityScope ?? "team", activityScope === "team" ? undefined : (recordId ?? undefined))
      .then((r) => r.activity)
  )
  // The invite-detail audit (inviter snapshot + acceptance) — only when viewing
  // one invite. Cache-first + live (a revoke/accept ping refreshes its invite row).
  const inviteAuditQ = useCached(
    enabled && module === "invites" && recordId ? `invite-audit:${recordId}` : null,
    () => tenancy.inviteAudit(recordId as string)
  )

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

  /* ------------------------------- mutations ------------------------------ */

  // The named-action dispatcher. Calls the permission-checked endpoint, primes
  // the actor's cache (others get a realtime ping → invalidate), and toasts
  // success. THROWS on failure so the calling dialog / confirm surfaces it.
  const runAction = React.useCallback(
    async (actionId: string, payload: Record<string, string>) => {
      if (!teamId) return
      switch (actionId) {
        case "members.changeRole": {
          const { members } = await tenancy.setMemberRole(payload.userId, payload.roleId)
          primeCache(`members:${teamId}`, members)
          invalidate(`member_roles:${teamId}`) // member counts per role changed
          invalidate(`activity:user:${payload.userId}`) // their activity feed gained a row
          toast.success("Role updated.")
          break
        }
        case "members.remove": {
          const { members } = await tenancy.removeMember(payload.userId)
          primeCache(`members:${teamId}`, members)
          invalidate(`member_roles:${teamId}`)
          invalidate(`activity:user:${payload.userId}`)
          toast.success("Member removed.")
          break
        }
        case "invites.create": {
          const { invites } = await tenancy.createInvite(payload.email, payload.roleId)
          primeCache(`invites:${teamId}`, invites)
          toast.success(`Invited ${payload.email}.`)
          break
        }
        case "invites.revoke": {
          const { invites } = await tenancy.revokeInvite(payload.inviteId)
          primeCache(`invites:${teamId}`, invites)
          toast.success("Invite revoked.")
          break
        }
        case "roles.create": {
          const { roles: next } = await tenancy.createRole(payload.title, payload.description)
          primeCache(`member_roles:${teamId}`, next)
          toast.success(`Created ${payload.title}.`)
          break
        }
      }
    },
    [teamId]
  )

  // Create a learning article — its own handler (a rich payload, not the flat
  // string map runAction takes). Primes the list so the new article appears at
  // once; the realtime "add" ping refreshes it for everyone else.
  const createLearning = React.useCallback(
    async (values: LearningFormValues) => {
      if (!teamId) return
      const { learning: next } = await contentApi.createLearning({
        title: values.title,
        category: values.category || null,
        contentType: values.contentType || null,
        contentLink: values.contentLink || null,
        body: values.body || null,
      })
      primeCache(`learning:${teamId}`, next)
      toast.success(`Created "${values.title}".`)
    },
    [teamId]
  )

  // Raise a help ticket — its own handler (a small object payload). Primes the
  // list so the ticket shows at once; the realtime "add" ping refreshes everyone
  // else.
  const createHelp = React.useCallback(
    async (input: { description: string; helpType?: string }) => {
      if (!teamId) return
      const { tickets } = await contentApi.createHelp(input)
      primeCache(`help:${teamId}`, tickets)
      toast.success("Ticket raised.")
    },
    [teamId]
  )

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

  // Section-tab count badges — the count of what each section's collection shows
  // (Overview leads with team metadata, not a collection, so it has no count).
  // Members uses the active-member count from context (no extra fetch).
  const sectionCounts: Partial<Record<SectionKey, number>> = {
    members: active.ctx.memberCount,
    roles: rolesQ.data?.length,
    invites: invitesQ.data?.length,
    learning: learningQ.data?.length,
    help: helpQ.data?.length,
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

  function content(): React.ReactNode {
    if (noAccess) return <NoAccess />
    if (!enabled) return <Skeleton variant="list" lines={4} />
    if (perms === undefined) return <Skeleton variant="list" lines={4} />

    // Import — no permission KEY of its own (gated per-target). Handle it before
    // the MODULE_PERMISSION lookup, which would otherwise NotFound it.
    if (module === "import") {
      if (!canImport) return <NoAccess />
      return <ImportScreen teamId={teamId as string} initialTarget={recordId || undefined} />
    }

    if (module === "dropdowns") {
      if (!can("selectable_data", "read")) return <NoAccess />
      return <SelectableScreen teamId={teamId as string} />
    }

    const permKey = module ? MODULE_PERMISSION[module] : undefined
    if (!permKey) return <NotFound />
    if (!can(permKey, "read")) return <NoAccess />

    // Team overview ----------------------------------------------------------
    if (module === "team") {
      const recipe = resolveRecipe("team.detail", overridesQ.data)
      if (!recipe) return <NotFound />
      if (metaQ.data === undefined) return <Skeleton variant="list" lines={3} />
      const data = shapeTeamDetail({
        teamId: teamId as string,
        name: teamName,
        logoUrl: active.ctx?.team?.logoUrl ?? null,
        meta: metaQ.data,
        activity: activityQ.data ?? [],
      })
      return (
        <ScreenRenderer recipe={recipe} data={data} rights={rights} onAction={onAction} onIntent={onIntent} />
      )
    }

    // Lists ------------------------------------------------------------------
    if (!recordId) {
      const recipe = resolveRecipe(`${module}.list`, overridesQ.data)
      if (!recipe) return <NotFound />
      if (module === "members") {
        if (membersQ.error) return <LoadError what="members" />
        if (membersQ.data === undefined) return <Skeleton variant="list" lines={4} />
        const data = shapeMembersList(membersQ.data)
        return <ScreenRenderer recipe={recipe} data={data} rights={rights} onAction={onAction} onIntent={onIntent} />
      }
      if (module === "roles") {
        if (rolesQ.error) return <LoadError what="roles" />
        if (rolesQ.data === undefined) return <Skeleton variant="list" lines={4} />
        const data = shapeRolesList(roles)
        return (
          <SectionWithCreate
            show={can("member_roles", "create")}
            label="New role"
            icon="plus"
            secondary={{
              show: can("member_roles", "create"),
              label: "Import CSV",
              onClick: () => go(`/t/${teamId}/import/member_roles`),
            }}
            onCreate={() => go(sectionPath, { panel: "add", module: "roles" })}
          >
            <ScreenRenderer recipe={recipe} data={data} rights={rights} onAction={onAction} onIntent={onIntent} />
          </SectionWithCreate>
        )
      }
      if (module === "invites") {
        if (invitesQ.error) return <LoadError what="invites" />
        if (invitesQ.data === undefined) return <Skeleton variant="list" lines={4} />
        const data = shapeInvitesList(invitesQ.data)
        return (
          <SectionWithCreate
            show={can("team_members", "create")}
            label="Invite"
            icon="mail"
            onCreate={() => go(sectionPath, { panel: "add", module: "invites" })}
          >
            <ScreenRenderer recipe={recipe} data={data} rights={rights} onAction={onAction} onIntent={onIntent} />
          </SectionWithCreate>
        )
      }
      if (module === "learning") {
        if (learningQ.error) return <LoadError what="learning" />
        if (learningQ.data === undefined) return <Skeleton variant="list" lines={4} />
        const data = shapeLearningList(learningQ.data)
        const articlesPanel = (
          <SectionWithCreate
            show={can("learning", "create")}
            label="New article"
            icon="plus"
            secondary={{
              show: can("learning", "create"),
              label: "Import CSV",
              onClick: () => go(`/t/${teamId}/import/learning`),
            }}
            onCreate={() => go(sectionPath, { panel: "add", module: "learning" })}
          >
            <ScreenRenderer recipe={recipe} data={data} rights={rights} onAction={onAction} onIntent={onIntent} />
          </SectionWithCreate>
        )
        // Articles / Team progress as a REAL tab strip (library TabsView, URL-driven
        // via ?tab so Back works). The completion grid is for curators (learning:edit);
        // everyone else just sees Articles, no tabs.
        if (!can("learning", "edit")) return articlesPanel
        const learnTab = query.tab === "progress" ? "progress" : "articles"
        const learnTabsConfig = {
          ...defaultTabsConfig,
          variant: "line" as const,
          tabs: [
            {
              value: "articles",
              label: "Articles",
              icon: "book-open",
              badge: String(learningQ.data.length || ""),
              badgeVariant: "" as const,
            },
            { value: "progress", label: "Team progress", icon: "users", badge: "", badgeVariant: "" as const },
          ],
        }
        return (
          <TabsView
            config={learnTabsConfig}
            value={learnTab}
            onValueChange={(v) => go(sectionPath, v === "progress" ? { tab: "progress" } : {})}
            renderPanel={(t) =>
              t.value === "progress" ? <LearningProgressScreen teamId={teamId as string} /> : articlesPanel
            }
          />
        )
      }
      if (module === "help") {
        if (helpQ.error) return <LoadError what="tickets" />
        if (helpQ.data === undefined) return <Skeleton variant="list" lines={4} />
        // My/All is a client-side raiser filter over the one cached set (so it
        // never desyncs from the live-patched detail). "Mine" needs my id.
        const visible =
          helpScope === "mine" && myUserId
            ? helpQ.data.filter((t) => t.raiserId === myUserId)
            : helpQ.data
        const data = shapeHelpList(visible)
        return (
          <SectionWithCreate
            show={can("help", "create")}
            label="Raise ticket"
            icon="plus"
            onCreate={() => go(sectionPath, { panel: "add", module: "help" })}
          >
            <TabsView
              config={{
                ...defaultTabsConfig,
                variant: "line",
                tabs: [
                  {
                    value: "all",
                    label: "All tickets",
                    icon: "inbox",
                    badge: String(helpQ.data.length || ""),
                    badgeVariant: "",
                  },
                  {
                    value: "mine",
                    label: "My tickets",
                    icon: "user",
                    badge: String(
                      (myUserId ? helpQ.data.filter((t) => t.raiserId === myUserId).length : 0) || ""
                    ),
                    badgeVariant: "",
                  },
                ],
              }}
              value={helpScope}
              onValueChange={(v) => setHelpScope(v as "mine" | "all")}
            />
            <ScreenRenderer recipe={recipe} data={data} rights={rights} onAction={onAction} onIntent={onIntent} />
          </SectionWithCreate>
        )
      }
      return <NotFound />
    }

    // Details ----------------------------------------------------------------
    if (module === "members") {
      if (membersQ.error) return <LoadError what="members" />
      if (membersQ.data === undefined) return <Skeleton variant="list" lines={4} />
      const member = membersQ.data.find((m) => m.userId === recordId) ?? null
      if (!member) return <p className="text-muted-foreground text-sm">That member isn&apos;t on this team.</p>
      let recipe = resolveRecipe("members.detail", overridesQ.data)
      if (!recipe) return <NotFound />
      // You can't change your own role or remove yourself here.
      if (member.isYou) recipe = withoutActions(recipe, ["members.changeRole", "members.remove"])
      const data = shapeMemberDetail(member, activityQ.data ?? [])
      return <ScreenRenderer recipe={recipe} data={data} rights={rights} onAction={onAction} onIntent={onIntent} />
    }
    if (module === "invites") {
      if (invitesQ.error) return <LoadError what="invites" />
      if (invitesQ.data === undefined) return <Skeleton variant="list" lines={4} />
      const invite = invitesQ.data.find((i) => i.id === recordId) ?? null
      if (!invite) return <p className="text-muted-foreground text-sm">That invite no longer exists.</p>
      let recipe = resolveRecipe("invites.detail", overridesQ.data)
      if (!recipe) return <NotFound />
      // Revoke only makes sense while the invite is still pending.
      if (invite.status !== "pending") recipe = withoutActions(recipe, ["invites.revoke"])
      const data = shapeInviteDetail(invite, inviteAuditQ.data ?? null, activityQ.data ?? [])
      return <ScreenRenderer recipe={recipe} data={data} rights={rights} onAction={onAction} onIntent={onIntent} />
    }
    if (module === "roles") {
      return <RoleDetailScreen teamId={teamId as string} roleId={recordId} />
    }
    if (module === "learning") {
      return <LearningDetailScreen teamId={teamId as string} learningId={recordId} />
    }
    if (module === "help") {
      return <HelpDetailScreen teamId={teamId as string} helpId={recordId} myUserId={myUserId} />
    }
    return <NotFound />
  }

  // The change-role target (for the picker) + confirm targets, from the URL id.
  const changeTarget =
    query.panel === "edit" && query.module === "members" && query.id
      ? (membersQ.data?.find((m) => m.userId === query.id) ?? null)
      : null

  return (
    <AppShell active={active} breadcrumbs={crumbs} onNavigate={go} activePath={currentPath}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {showTabs && (
          <TeamSectionNav
            teamId={teamId as string}
            current={section}
            perms={perms}
            counts={sectionCounts}
            onNavigate={(href) => go(href)}
          />
        )}
        {content()}
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

      {/* The app-wide AI co-pilot. A floating launcher (gated by agent:create)
       * opens the right-side sheet; the panel itself re-checks the right and the
       * server enforces every action. Mounted here so the co-pilot sits over any
       * /t screen and can drive real navigation/actions through this host. */}
      {can("agent", "create") && (
        <>
          <button
            type="button"
            onClick={() => setAgentOpen(true)}
            aria-label="Open the assistant"
            className="bg-primary text-primary-foreground hover:bg-primary/90 fixed right-4 bottom-20 z-30 flex size-12 items-center justify-center rounded-full shadow-lg transition-colors md:bottom-6"
          >
            <Sparkles className="size-5" />
          </button>
          <AgentPanel teamId={teamId} open={agentOpen} onOpenChange={setAgentOpen} />
        </>
      )}
    </AppShell>
  )
}

