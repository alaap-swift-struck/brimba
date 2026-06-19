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

import { Skeleton } from "@swift-struck/ui/registry/primitives/skeleton/skeleton"
import { Button } from "@swift-struck/ui/registry/primitives/button/button"
import { Spinner } from "@swift-struck/ui/registry/primitives/spinner/spinner"
import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@swift-struck/ui/registry/primitives/alert-dialog/alert-dialog"
import { Plus, Mail } from "lucide-react"
import {
  ScreenRenderer,
  type ScreenData,
  type ScreenActionContext,
  type ScreenIntent,
} from "@swift-struck/ui/registry/collections/screen-renderer/screen-renderer"
import {
  buildScreenQuery,
  parseScreenPath,
  parseScreenQuery,
  type ScreenQuery,
  type ScreenRights,
} from "@swift-struck/ui/lib/recipe"

import { AppShell, ShellLoading } from "@/components/app-shell"
import { TeamSectionNav } from "@/components/team-section-nav"
import { RoleDetailScreen } from "@/components/role-detail"
import { RolePickerDialog } from "@/components/role-picker-dialog"
import { RoleFormDialog } from "@/components/role-form-dialog"
import { InviteDialog } from "@/components/invite-dialog"
import { TeamEditDialog } from "@/components/team-edit-dialog"
import { ApiFailure, tenancy } from "@/lib/api"
import { formatDate, formatDateTime } from "@/lib/format"
import { usePermissions } from "@/lib/perms"
import { invalidate, primeCache, useCached } from "@/lib/store"
import { useActiveTeam } from "@/lib/use-active-team"
import { reportError } from "@/lib/log"
import { MODULE_PERMISSION, resolveRecipe, withoutActions } from "@/lib/screens"
import { TEAM_SECTIONS, type Crumb } from "@/lib/pages"
import type { Invite, TeamMember } from "@shared/types"

const STATUS: Record<Invite["status"], string> = {
  pending: "Pending",
  accepted: "Accepted",
  revoked: "Revoked",
  expired: "Expired",
}

function fullName(m: TeamMember): string {
  return [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email
}

type SectionKey = "overview" | "members" | "roles" | "invites"

type Route = {
  teamId: string
  /** friendly URL module segment: team | members | roles | invites (| unknown) */
  module: string
  /** "" = the list / overview level (no record selected) */
  recordId: string
  query: ScreenQuery
}

function parseRoute(pathname: string, search: string): Route {
  const segs = pathname.split("/").filter(Boolean) // ["t", teamId, module?, id?, …]
  const teamId = segs[1] ?? ""
  const levels = parseScreenPath(segs.slice(2)) // [{module,id}, …]
  return {
    teamId,
    module: levels[0]?.module || "team",
    recordId: levels[0]?.id || "",
    query: parseScreenQuery(new URLSearchParams(search)),
  }
}

function sectionTitle(module: string): string {
  return TEAM_SECTIONS.find((s) => s.segment === module)?.title ?? "Team"
}

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

  const teamId = route?.teamId ?? null
  const module = route?.module ?? null
  const recordId = route?.recordId ?? null
  const query = route?.query ?? {}

  // If the link points at a team we're not in, switch (server validates
  // membership; a non-member switch fails → no access). Reset noAccess each time
  // the target team changes — this is ONE persistent shell, so a stale latched
  // flag would otherwise strand a later valid team on the no-access screen. Dep
  // on the primitive team id (not the whole `active` object, which is a fresh
  // literal every render → would re-fire + re-dispatch the switch each render).
  const activeTeamId = active.ctx?.team?.id ?? null
  const switchTeam = active.switchTeam
  React.useEffect(() => {
    if (!teamId || !activeTeamId) return
    setNoAccess(false)
    if (activeTeamId !== teamId) {
      switchTeam(teamId).catch(() => setNoAccess(true))
    }
  }, [teamId, activeTeamId, switchTeam])

  const onTeam = active.ctx?.team?.id === teamId
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
  const invitesQ = useCached(
    enabled && module === "invites" ? `invites:${teamId}` : null,
    () => tenancy.invites().then((r) => r.invites)
  )
  const metaQ = useCached(enabled && module === "team" ? `team-meta:${teamId}` : null, () =>
    tenancy.teamMeta()
  )
  const activityScope: "team" | "user" | null =
    module === "team" ? "team" : module === "members" && recordId ? "user" : null
  const activityKey =
    !enabled || !activityScope
      ? null
      : activityScope === "team"
        ? `activity:team:${teamId}`
        : `activity:user:${recordId}`
  const activityQ = useCached(activityKey, () =>
    tenancy
      .activity(activityScope ?? "team", activityScope === "user" ? (recordId ?? undefined) : undefined)
      .then((r) => r.activity)
  )

  const roles = rolesQ.data ?? []
  const activeRoles = roles.filter((r) => r.active)
  const rights: ScreenRights = perms ?? {}

  /* ------------------------------ navigation ------------------------------ */

  const teamPath = teamId ? `/t/${teamId}` : "/"
  const sectionPath = module && module !== "team" ? `/t/${teamId}/${module}` : teamPath
  const currentPath = recordId ? `/t/${teamId}/${module}/${recordId}` : sectionPath

  // Push a destination AND reflect it immediately (a query-only push won't
  // re-fire the pathname effect). Opening a panel is a push so Back closes it.
  const go = React.useCallback(
    (path: string, q?: ScreenQuery) => {
      navigatedRef.current = true
      const search = q ? buildScreenQuery(q) : ""
      router.push(path + search)
      setRoute(parseRoute(path, search))
    },
    [router]
  )
  const replace = React.useCallback(
    (path: string) => {
      router.replace(path)
      setRoute(parseRoute(path, ""))
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

  /* ------------------------- engine intent + action ------------------------ */

  function onIntent(intent: ScreenIntent) {
    if (intent.kind === "open") go(`/t/${teamId}/${intent.module}/${intent.id}`)
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

  const teamName = active.ctx.team?.name ?? "Team"
  const section: SectionKey =
    module === "members" || module === "roles" || module === "invites" ? module : "overview"

  // Breadcrumbs derived from the URL spine; the library Breadcrumbs collapses the
  // middle on small screens. The last crumb is the current page (no href).
  const crumbs: Crumb[] = [
    { label: "Settings", href: "/settings" },
    { label: teamName, href: teamPath },
  ]
  if (module && module !== "team") {
    crumbs.push({ label: sectionTitle(module), href: sectionPath })
    if (recordId) crumbs.push({ label: recordLabel() })
  }

  function recordLabel(): string {
    if (module === "members")
      return membersQ.data?.find((m) => m.userId === recordId)
        ? fullName(membersQ.data.find((m) => m.userId === recordId) as TeamMember)
        : "Member"
    if (module === "roles") return roles.find((r) => r.id === recordId)?.title ?? "Role"
    if (module === "invites")
      return invitesQ.data?.find((i) => i.id === recordId)?.email ?? "Invite"
    return ""
  }

  function content(): React.ReactNode {
    if (noAccess) return <NoAccess />
    if (!enabled) return <Skeleton variant="list" lines={4} />
    const permKey = module ? MODULE_PERMISSION[module] : undefined
    if (!permKey) return <NotFound />
    if (perms === undefined) return <Skeleton variant="list" lines={4} />
    if (!can(permKey, "read")) return <NoAccess />

    // Team overview ----------------------------------------------------------
    if (module === "team") {
      const recipe = resolveRecipe("team.detail", overridesQ.data)
      if (!recipe) return <NotFound />
      if (metaQ.data === undefined) return <Skeleton variant="list" lines={3} />
      const m = metaQ.data
      const data: ScreenData = {
        record: {
          id: teamId,
          name: teamName,
          image: active.ctx?.team?.logoUrl ?? "",
          created: formatDateTime(m.createdAt),
          createdBy: m.creatorName || m.creatorEmail || "",
          updated: m.updatedAt ? formatDateTime(m.updatedAt) : "—",
        },
        sets: { activity: activityRows() },
      }
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
        const data: ScreenData = {
          rows: membersQ.data.map((m) => ({
            id: m.userId,
            name: fullName(m),
            detail: `${m.roleTitle} · joined ${formatDate(m.joinedAt)}`,
          })),
        }
        return <ScreenRenderer recipe={recipe} data={data} rights={rights} onAction={onAction} onIntent={onIntent} />
      }
      if (module === "roles") {
        if (rolesQ.error) return <LoadError what="roles" />
        if (rolesQ.data === undefined) return <Skeleton variant="list" lines={4} />
        const data: ScreenData = {
          rows: roles.map((r) => ({
            id: r.id,
            name: r.active ? r.title : `${r.title} (inactive)`,
            detail: r.description || `${r.memberCount} member${r.memberCount === 1 ? "" : "s"}`,
          })),
        }
        return (
          <SectionWithCreate
            show={can("member_roles", "create")}
            label="New role"
            icon="plus"
            onCreate={() => go(sectionPath, { panel: "add", module: "roles" })}
          >
            <ScreenRenderer recipe={recipe} data={data} rights={rights} onAction={onAction} onIntent={onIntent} />
          </SectionWithCreate>
        )
      }
      if (module === "invites") {
        if (invitesQ.error) return <LoadError what="invites" />
        if (invitesQ.data === undefined) return <Skeleton variant="list" lines={4} />
        const data: ScreenData = {
          rows: invitesQ.data.map((i) => ({
            id: i.id,
            email: i.email,
            detail: `${i.roleTitle} · ${STATUS[i.status]}`,
          })),
        }
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
      const data: ScreenData = {
        record: {
          id: member.userId,
          name: fullName(member),
          email: member.email,
          role: member.roleTitle,
          joined: formatDate(member.joinedAt),
          image: member.imageUrl ?? "",
        },
        sets: { activity: activityRows() },
      }
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
      const data: ScreenData = {
        record: {
          id: invite.id,
          email: invite.email,
          role: invite.roleTitle,
          status: STATUS[invite.status],
          invited: formatDate(invite.createdAt),
          expires: formatDate(invite.expiresAt),
        },
      }
      return <ScreenRenderer recipe={recipe} data={data} rights={rights} onAction={onAction} onIntent={onIntent} />
    }
    if (module === "roles") {
      return <RoleDetailScreen teamId={teamId as string} roleId={recordId} />
    }
    return <NotFound />
  }

  // Activity rows for the team / member feeds → the engine's item shape.
  function activityRows(): Record<string, unknown>[] {
    return (activityQ.data ?? []).map((a) => ({
      id: a.id,
      description: a.description,
      actor: a.actorName ?? undefined,
      timestamp: formatDateTime(a.createdAt),
    }))
  }

  // The change-role target (for the picker) + confirm targets, from the URL id.
  const changeTarget =
    query.panel === "edit" && query.module === "members" && query.id
      ? (membersQ.data?.find((m) => m.userId === query.id) ?? null)
      : null

  return (
    <AppShell active={active} breadcrumbs={crumbs}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <TeamSectionNav teamId={teamId as string} current={section} perms={perms} onNavigate={(href) => go(href)} />
        {content()}
      </div>

      {/* Change a member's role (?panel=edit&module=members&id) */}
      <RolePickerDialog
        open={query.panel === "edit" && query.module === "members" && !!query.id}
        onOpenChange={(o) => !o && closePanel()}
        roles={activeRoles}
        currentRoleId={changeTarget?.roleId ?? null}
        subjectName={changeTarget ? fullName(changeTarget) : null}
        onPick={(roleId) => runAction("members.changeRole", { userId: query.id ?? "", roleId })}
      />

      {/* Invite someone (?panel=add&module=invites) */}
      <InviteDialog
        open={query.panel === "add" && query.module === "invites"}
        onOpenChange={(o) => !o && closePanel()}
        roles={activeRoles}
        onSubmit={(email, roleId) => runAction("invites.create", { email, roleId })}
      />

      {/* Create a role (?panel=add&module=roles) */}
      <RoleFormDialog
        open={query.panel === "add" && query.module === "roles"}
        onOpenChange={(o) => !o && closePanel()}
        onSubmit={(title, description) => runAction("roles.create", { title, description })}
      />

      {/* Edit the team (?panel=edit&module=team) */}
      <TeamEditDialog
        open={query.panel === "edit" && query.module === "team"}
        onOpenChange={(o) => !o && closePanel()}
        team={active.ctx.team}
        onSaved={active.refresh}
      />

      {/* Destructive confirms (?confirm=members.remove | invites.revoke) */}
      <ConfirmAction
        query={query}
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

/* -------------------------------- helpers -------------------------------- */

function NoAccess() {
  return (
    <p className="text-muted-foreground text-sm">
      You don&apos;t have access to this, or it doesn&apos;t exist.
    </p>
  )
}
function NotFound() {
  return <p className="text-muted-foreground text-sm">That screen doesn&apos;t exist.</p>
}
function LoadError({ what }: { what: string }) {
  return <p className="text-destructive text-sm">Couldn&apos;t load {what}.</p>
}

/** A list screen with a host-rendered create button above it (the engine list
 * has no "add" affordance — creating opens a ?panel form). */
function SectionWithCreate({
  show,
  label,
  icon,
  onCreate,
  children,
}: {
  show: boolean
  label: string
  icon: "plus" | "mail"
  onCreate: () => void
  children: React.ReactNode
}) {
  const Icon = icon === "plus" ? Plus : Mail
  return (
    <div className="flex flex-col gap-4">
      {show && (
        <div className="flex justify-end">
          <Button onClick={onCreate} className="gap-1.5">
            <Icon className="size-4" />
            {label}
          </Button>
        </div>
      )}
      {children}
    </div>
  )
}

/** The destructive-confirm AlertDialog for remove-member / revoke-invite, driven
 * by ?confirm. Owns its in-flight state; the parent does the mutation + nav. */
function ConfirmAction({
  query,
  memberName,
  onCancel,
  onConfirm,
}: {
  query: ScreenQuery
  memberName: TeamMember | null
  onCancel: () => void
  onConfirm: () => Promise<void>
}) {
  const [busy, setBusy] = React.useState(false)
  const open = query.confirm === "members.remove" || query.confirm === "invites.revoke"
  const isRemove = query.confirm === "members.remove"
  const title = isRemove
    ? `Remove ${memberName ? fullName(memberName) : "this member"}?`
    : "Revoke this invite?"
  const body = isRemove
    ? "They lose access to this team right away. You can invite them back later."
    : "They won't be able to join with this invite. You can send a new one later."

  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              setBusy(true)
              void onConfirm().finally(() => setBusy(false))
            }}
            disabled={busy}
          >
            {busy ? <Spinner /> : null}
            {isRemove ? "Remove" : "Revoke"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
