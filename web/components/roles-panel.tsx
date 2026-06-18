"use client"

// Member-roles panel — pick a role, see/edit its permission matrix. Rendered in
// the team-detail "Member roles" tab. Admin = locked (view-only); others
// editable; read-only members see view-only. Cache-first + live-refreshable.

import * as React from "react"

import { Badge } from "@swift-struck/ui/registry/primitives/badge/badge"
import { Button } from "@swift-struck/ui/registry/primitives/button/button"
import { Skeleton } from "@swift-struck/ui/registry/primitives/skeleton/skeleton"
import { Spinner } from "@swift-struck/ui/registry/primitives/spinner/spinner"
import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"
import { List } from "@swift-struck/ui/registry/collections/list/list"
import {
  PermissionMatrix,
  defaultPermissionMatrixConfig,
  type PermissionMatrixConfig,
} from "@swift-struck/ui/registry/collections/permission-matrix/permission-matrix"
import { Lock, Pencil, Plus, Shield, ShieldCheck } from "lucide-react"

import type { PermissionValue, RolePermissions, TeamRole } from "@shared/types"
import { RoleFormDialog } from "@/components/role-form-dialog"
import { ApiFailure, tenancy } from "@/lib/api"
import { usePermissions } from "@/lib/perms"
import { primeCache, useCached } from "@/lib/store"
import type { ActiveTeam } from "@/lib/use-active-team"

export function RolesPanel({ active }: { active: ActiveTeam }) {
  const teamId = active.ctx?.team?.id ?? null

  const rolesQ = useCached<TeamRole[]>(
    teamId ? `member_roles:${teamId}` : null,
    () => tenancy.roles().then((r) => r.roles)
  )
  const roles = rolesQ.data
  const { can } = usePermissions(teamId)
  const canCreate = can("member_roles", "create")

  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const [editingOpen, setEditingOpen] = React.useState(false)
  const selectedRole = roles?.find((r) => r.id === selectedId) ?? null

  React.useEffect(() => {
    if (!roles || roles.length === 0) return
    setSelectedId((cur) =>
      cur && roles.some((r) => r.id === cur)
        ? cur
        : (roles.find((r) => !r.isDefault) ?? roles[0]).id
    )
  }, [roles])

  const permsQ = useCached<RolePermissions>(
    selectedId ? `role-perms:${selectedId}` : null,
    () => tenancy.rolePermissions(selectedId as string)
  )
  const perms = permsQ.data ?? null

  const [draft, setDraft] = React.useState<PermissionValue | null>(null)
  const serverRef = React.useRef<{ roleId: string; value: PermissionValue } | null>(null)
  React.useEffect(() => {
    if (!perms || !selectedId) return
    const prev = serverRef.current
    const nextJson = JSON.stringify(perms.value)
    // Same role + identical server value → nothing to reconcile. A realtime
    // ping (e.g. the one our own create/save fires) triggers a stale-while-
    // revalidate refetch that returns structurally-identical data as a NEW
    // object; without this bail the effect would churn while you're mid-edit.
    if (prev && prev.roleId === selectedId && JSON.stringify(prev.value) === nextJson)
      return
    if (!prev || prev.roleId !== selectedId) {
      setDraft(perms.value)
    } else if (JSON.stringify(prev.value) !== nextJson) {
      setDraft((d) =>
        d && JSON.stringify(d) === JSON.stringify(prev.value) ? perms.value : d
      )
    }
    serverRef.current = { roleId: selectedId, value: perms.value }
  }, [perms, selectedId])

  const dirty =
    perms != null &&
    draft != null &&
    JSON.stringify(draft) !== JSON.stringify(perms.value)

  async function save() {
    if (!selectedId || !draft) return
    setSaving(true)
    try {
      await tenancy.saveRolePermissions(selectedId, draft)
      const fresh = await tenancy.rolePermissions(selectedId)
      primeCache(`role-perms:${selectedId}`, fresh)
      serverRef.current = { roleId: selectedId, value: fresh.value }
      setDraft(fresh.value)
      toast.success("Permissions saved.")
    } catch (err) {
      toast.error(
        err instanceof ApiFailure ? err.message : "Couldn't save permissions."
      )
    } finally {
      setSaving(false)
    }
  }

  async function createRole(title: string, description: string) {
    const before = new Set((roles ?? []).map((r) => r.id))
    const { roles: next } = await tenancy.createRole(title, description)
    if (teamId) primeCache(`member_roles:${teamId}`, next)
    const created = next.find((r) => !before.has(r.id))
    if (created) setSelectedId(created.id)
    toast.success(`Created ${title}.`)
  }

  async function updateRoleDetails(title: string, description: string) {
    if (!selectedId) return
    const { roles: next } = await tenancy.updateRole(selectedId, title, description)
    if (teamId) primeCache(`member_roles:${teamId}`, next)
    toast.success("Role updated.")
  }

  const matrixConfig: PermissionMatrixConfig | null = perms && {
    ...defaultPermissionMatrixConfig,
    modules: perms.modules,
    mode: perms.isDefault ? "locked" : perms.canEdit ? "edit" : "read",
    autoFlipRead: true,
  }
  const canSave = perms != null && !perms.isDefault && perms.canEdit

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">Roles and what each one can do.</p>
        {canCreate && (
          <Button onClick={() => setCreating(true)} className="shrink-0 gap-1.5">
            <Plus className="size-4" />
            New role
          </Button>
        )}
      </div>

      {rolesQ.error ? (
        <p className="text-destructive text-sm">Couldn&apos;t load roles.</p>
      ) : roles === undefined ? (
        <Skeleton variant="list" lines={3} />
      ) : (
        <>
          <List
            selectedId={selectedId}
            onSelect={(item) => setSelectedId(item.id)}
            items={roles.map((r) => ({
              id: r.id,
              title: (
                <span className="flex items-center gap-2">
                  {r.title}
                  {r.isDefault && (
                    <Badge variant="outline" className="gap-1 text-[10px]">
                      <Lock className="size-2.5" aria-hidden />
                      Locked
                    </Badge>
                  )}
                </span>
              ),
              subtitle: r.description ?? undefined,
              leading: (
                <span className="bg-secondary text-secondary-foreground flex size-9 items-center justify-center rounded-lg">
                  {r.isDefault ? <ShieldCheck className="size-4" /> : <Shield className="size-4" />}
                </span>
              ),
              trailing: (
                <span className="text-muted-foreground text-xs">
                  {r.memberCount} member{r.memberCount === 1 ? "" : "s"}
                </span>
              ),
            }))}
          />

          <div className="flex flex-col gap-3">
            {permsQ.loading || !matrixConfig || !draft ? (
              <Skeleton className="h-64 w-full rounded-xl" />
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-muted-foreground text-sm">
                    {perms?.isDefault
                      ? "The Admin role has full access and can't be changed."
                      : canSave
                        ? "Switch on what this role can do. Any write turns Read on."
                        : "You can view what this role can do, but not change it."}
                  </p>
                  {canSave && (
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingOpen(true)}
                        className="gap-1.5"
                      >
                        <Pencil className="size-3.5" />
                        Edit details
                      </Button>
                      <Button onClick={() => void save()} disabled={!dirty || saving}>
                        {saving ? <Spinner /> : null}
                        {saving ? "Saving…" : "Save"}
                      </Button>
                    </div>
                  )}
                </div>
                <PermissionMatrix
                  config={matrixConfig}
                  value={draft}
                  onChange={(next) => setDraft(next)}
                  className="border-border bg-transparent [&_td.sticky]:bg-background [&_th.sticky]:bg-background"
                />
              </>
            )}
          </div>
        </>
      )}

      <RoleFormDialog open={creating} onOpenChange={setCreating} onSubmit={createRole} />
      <RoleFormDialog
        open={editingOpen}
        onOpenChange={setEditingOpen}
        initial={
          selectedRole
            ? { title: selectedRole.title, description: selectedRole.description ?? "" }
            : null
        }
        onSubmit={updateRoleDetails}
      />
    </div>
  )
}
