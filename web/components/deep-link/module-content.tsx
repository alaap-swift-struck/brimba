"use client"

// The module-render switch for the deep-link host — "given the fully-resolved
// route, rights and per-module data, render the right screen". Extracted from
// deep-link-screen.tsx (which stays the routing + state + effects + dialogs
// host) so each half reads on its own. Pure: it takes ONE context bundle the
// host builds and returns the screen node; it holds no state of its own.

import * as React from "react"

import { Skeleton } from "@swift-struck/ui/registry/primitives/skeleton/skeleton"
import { TabsView, defaultTabsConfig } from "@swift-struck/ui/registry/primitives/tabs/tabs"
import {
  ScreenRenderer,
  type ScreenActionContext,
  type ScreenIntent,
} from "@swift-struck/ui/registry/collections/screen-renderer/screen-renderer"
import { type ScreenQuery, type ScreenRights } from "@swift-struck/ui/lib/recipe"

import { RoleDetailScreen } from "@/components/role-detail"
import { LearningDetailScreen } from "@/components/learning-detail"
import { LearningProgressScreen } from "@/components/learning-progress"
import { HelpDetailScreen } from "@/components/help-detail"
import { ImportScreen } from "@/components/import-screen"
import { SelectableScreen } from "@/components/selectable-screen"
import { NoAccess, NotFound, LoadError, SectionWithCreate, CollectionCard } from "@/components/deep-link/screen-bits"
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
import type { useScreenData } from "@/lib/use-screen-data"
import type { usePermissions } from "@/lib/perms"
import type { useActiveTeam } from "@/lib/use-active-team"
import { MODULE_PERMISSION, resolveRecipe, withDataDrivenCollection, withoutActions } from "@/lib/screens"
import type { TeamRole } from "@shared/types"

type ScreenData = ReturnType<typeof useScreenData>

/** Everything the module-render switch needs from the host: the resolved route,
 * the caller's rights, the per-module queries, and the intent/action bridges.
 * The host owns all of it; this bundle is how it hands the render half a snapshot. */
export type ModuleContentCtx = Pick<
  ScreenData,
  "overridesQ" | "metaQ" | "membersQ" | "rolesQ" | "invitesQ" | "learningQ" | "helpQ" | "activityQ" | "inviteAuditQ"
> & {
  noAccess: boolean
  enabled: boolean
  perms: ReturnType<typeof usePermissions>["perms"]
  can: ReturnType<typeof usePermissions>["can"]
  module: string | null
  recordId: string | null
  teamId: string | null
  canImport: boolean
  go: (path: string, q?: ScreenQuery) => void
  roles: TeamRole[]
  teamName: string
  active: ReturnType<typeof useActiveTeam>
  rights: ScreenRights
  onAction: (actionId: string, ctx: ScreenActionContext) => void
  onIntent: (intent: ScreenIntent) => void
  sectionPath: string
  helpScope: "mine" | "all"
  setHelpScope: (v: "mine" | "all") => void
  myUserId: string | null
  query: ScreenQuery
}

export function renderModuleContent(ctx: ModuleContentCtx): React.ReactNode {
  const {
    noAccess,
    enabled,
    perms,
    module,
    recordId,
    teamId,
    canImport,
    can,
    go,
    overridesQ,
    metaQ,
    membersQ,
    rolesQ,
    roles,
    invitesQ,
    learningQ,
    helpQ,
    activityQ,
    inviteAuditQ,
    teamName,
    active,
    rights,
    onAction,
    onIntent,
    sectionPath,
    helpScope,
    setHelpScope,
    myUserId,
    query,
  } = ctx

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
      return (
        <SelectableScreen
          teamId={teamId as string}
          onImport={() => go(`/t/${teamId}/import/selectable_data`)}
        />
      )
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
        const membersRecipe = withDataDrivenCollection(recipe, data.rows ?? [])
        return (
          <CollectionCard>
            <ScreenRenderer recipe={membersRecipe} data={data} rights={rights} onAction={onAction} onIntent={onIntent} />
          </CollectionCard>
        )
      }
      if (module === "roles") {
        if (rolesQ.error) return <LoadError what="roles" />
        if (rolesQ.data === undefined) return <Skeleton variant="list" lines={4} />
        const data = shapeRolesList(roles)
        const rolesRecipe = withDataDrivenCollection(recipe, data.rows ?? [])
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
            download={{
              show: (data.rows?.length ?? 0) > 0, // export needs READ — implied by seeing this list
              label: "Export CSV",
              href: "/api/tenancy/roles/export",
            }}
            onCreate={() => go(sectionPath, { panel: "add", module: "roles" })}
          >
            <ScreenRenderer recipe={rolesRecipe} data={data} rights={rights} onAction={onAction} onIntent={onIntent} />
          </SectionWithCreate>
        )
      }
      if (module === "invites") {
        if (invitesQ.error) return <LoadError what="invites" />
        if (invitesQ.data === undefined) return <Skeleton variant="list" lines={4} />
        const data = shapeInvitesList(invitesQ.data)
        const invitesRecipe = withDataDrivenCollection(recipe, data.rows ?? [])
        return (
          <SectionWithCreate
            show={can("team_members", "create")}
            label="Invite"
            icon="mail"
            onCreate={() => go(sectionPath, { panel: "add", module: "invites" })}
          >
            <ScreenRenderer recipe={invitesRecipe} data={data} rights={rights} onAction={onAction} onIntent={onIntent} />
          </SectionWithCreate>
        )
      }
      if (module === "learning") {
        if (learningQ.error) return <LoadError what="learning" />
        if (learningQ.data === undefined) return <Skeleton variant="list" lines={4} />
        const data = shapeLearningList(learningQ.data)
        const learningRecipe = withDataDrivenCollection(recipe, data.rows ?? [])
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
            download={{
              show: (data.rows?.length ?? 0) > 0, // export needs READ — implied by seeing this list
              label: "Export CSV",
              href: "/api/content/learning/export",
            }}
            onCreate={() => go(sectionPath, { panel: "add", module: "learning" })}
          >
            <ScreenRenderer recipe={learningRecipe} data={data} rights={rights} onAction={onAction} onIntent={onIntent} />
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
        const helpRecipe = withDataDrivenCollection(recipe, data.rows ?? [])
        return (
          <SectionWithCreate
            show={can("help", "create")}
            label="Raise ticket"
            icon="plus"
            onCreate={() => go(sectionPath, { panel: "add", module: "help" })}
            // The My/All raiser strip sits ABOVE the boxed list — it scopes which
            // tickets the collection card shows, so it isn't part of that unit.
            aboveCard={
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
            }
          >
            <ScreenRenderer recipe={helpRecipe} data={data} rights={rights} onAction={onAction} onIntent={onIntent} />
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
