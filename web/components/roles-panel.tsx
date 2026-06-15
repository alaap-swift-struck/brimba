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
import {
  PermissionMatrix,
  defaultPermissionMatrixConfig,
  type PermissionMatrixConfig,
} from "@swift-struck/ui/registry/collections/permission-matrix/permission-matrix"
import { Lock, Pencil, Plus, ShieldCheck } from "lucide-react"

import type { PermissionValue, RolePermissions, TeamRole } from "@shared/types"
import { RoleFormDialog } from "@/components/role-form-dialog"
import { ApiFailure, tenancy } from "@/lib/api"
import { primeCache, useCached } from "@/lib/store"
import type { ActiveTeam } from "@/lib/use-active-team"

export function RolesPanel({ active }: { active: ActiveTeam }) {
  const teamId = active.ctx?.team?.id ?? null

  const rolesQ = useCached<TeamRole[]>(
    teamId ? `member_roles:${teamId}` : null,
    () => tenancy.roles().then((r) => r.roles)
  )
  const roles = rolesQ.data

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
    if (!prev || prev.roleId !== selectedId) {
      setDraft(perms.value)
    } else if (JSON.stringify(prev.value) !== JSON.stringify(perms.value)) {
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
        <Button onClick={() => setCreating(true)} className="shrink-0 gap-1.5">
          <Plus className="size-4" />
          New role
        </Button>
      </div>

      {rolesQ.error ? (
        <p className="text-destructive text-sm">Couldn&apos;t load roles.</p>
      ) : roles === undefined ? (
        <Skeleton variant="list" lines={3} />
      ) : (
        <>
          <div className="divide-border/60 flex flex-col divide-y">
            {roles.map((r) => {
              const selected = r.id === selectedId
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  aria-current={selected}
                  className={`flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left transition-colors ${
                    selected ? "bg-muted" : "hover:bg-muted/40"
                  }`}
                >
                  <span className="bg-secondary text-secondary-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
                    {r.isDefault ? (
                      <ShieldCheck className="size-4" />
                    ) : (
                      <Lock className="size-4 opacity-0" aria-hidden />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 font-medium">
                      {r.title}
                      {r.isDefault && (
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <Lock className="size-2.5" aria-hidden />
                          Locked
                        </Badge>
                      )}
                    </div>
                    {r.description && (
                      <div className="text-muted-foreground truncate text-sm">
                        {r.description}
                      </div>
                    )}
                  </div>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {r.memberCount} member{r.memberCount === 1 ? "" : "s"}
                  </span>
                </button>
              )
            })}
          </div>

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
