"use client"

// Role detail — one role's permission grid, at /t/<teamId>/roles/<id>. The grid
// has no screen-engine block (it's a bespoke matrix), so the host composes it
// here from the library PermissionMatrix while the roles LIST is engine-driven.
// Self-contained: it fetches the role + its permissions cache-first, owns the
// draft + Save (with the reconciliation guard that survives live pings), Edit
// details, and Deactivate / Activate. Admin = locked (view-only); a read-only
// viewer sees the grid view-only; never deleted — deactivate-only (ARCH §4).

import * as React from "react"

import { Badge } from "@swift-struck/ui/registry/primitives/badge/badge"
import { Button } from "@swift-struck/ui/registry/primitives/button/button"
import { Skeleton } from "@swift-struck/ui/registry/primitives/skeleton/skeleton"
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
import {
  PermissionMatrix,
  defaultPermissionMatrixConfig,
  type PermissionMatrixConfig,
} from "@swift-struck/ui/registry/collections/permission-matrix/permission-matrix"
import { Lock, Pencil } from "lucide-react"

import type { PermissionValue, RolePermissions, TeamRole } from "@shared/types"
import { RoleFormDialog } from "@/components/role-form-dialog"
import { ApiFailure, tenancy } from "@/lib/api"
import { usePermissions } from "@/lib/perms"
import { primeCache, useCached } from "@/lib/store"

export function RoleDetailScreen({ teamId, roleId }: { teamId: string; roleId: string }) {
  const rolesQ = useCached<TeamRole[]>(`member_roles:${teamId}`, () =>
    tenancy.roles().then((r) => r.roles)
  )
  const role = rolesQ.data?.find((r) => r.id === roleId) ?? null

  const { can } = usePermissions(teamId)
  // Edit-details / Save are gated by the SERVER payload (perms.canEdit → canSave);
  // deactivate/activate is the "delete" right in our deactivate-only model.
  const canDeactivate = can("member_roles", "delete")

  const [saving, setSaving] = React.useState(false)
  const [busyActive, setBusyActive] = React.useState(false)
  const [editingOpen, setEditingOpen] = React.useState(false)
  const [confirmDeactivate, setConfirmDeactivate] = React.useState(false)

  // A deactivated role's permissions are frozen + not fetchable (the server 404s
  // it) — only load the matrix for an active role.
  const permsQ = useCached<RolePermissions>(
    role?.active ? `role-perms:${roleId}` : null,
    () => tenancy.rolePermissions(roleId)
  )
  const perms = permsQ.data ?? null

  const [draft, setDraft] = React.useState<PermissionValue | null>(null)
  const serverRef = React.useRef<{ roleId: string; value: PermissionValue } | null>(null)
  React.useEffect(() => {
    if (!perms) return
    const prev = serverRef.current
    const nextJson = JSON.stringify(perms.value)
    // Same role + identical server value → nothing to reconcile. A realtime ping
    // (e.g. our own save) triggers a stale-while-revalidate refetch returning a
    // structurally-identical NEW object; without this bail the effect churns
    // while you're mid-edit.
    if (prev && prev.roleId === roleId && JSON.stringify(prev.value) === nextJson) return
    if (!prev || prev.roleId !== roleId) {
      setDraft(perms.value)
    } else if (JSON.stringify(prev.value) !== nextJson) {
      setDraft((d) =>
        d && JSON.stringify(d) === JSON.stringify(prev.value) ? perms.value : d
      )
    }
    serverRef.current = { roleId, value: perms.value }
  }, [perms, roleId])

  const dirty =
    perms != null && draft != null && JSON.stringify(draft) !== JSON.stringify(perms.value)

  async function save() {
    if (!draft) return
    setSaving(true)
    try {
      await tenancy.saveRolePermissions(roleId, draft)
      const fresh = await tenancy.rolePermissions(roleId)
      primeCache(`role-perms:${roleId}`, fresh)
      serverRef.current = { roleId, value: fresh.value }
      setDraft(fresh.value)
      toast.success("Permissions saved.")
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't save permissions.")
    } finally {
      setSaving(false)
    }
  }

  async function updateDetails(title: string, description: string) {
    const { roles: next } = await tenancy.updateRole(roleId, title, description)
    primeCache(`member_roles:${teamId}`, next)
    toast.success("Role updated.")
  }

  async function setActive(activeNext: boolean) {
    setBusyActive(true)
    try {
      const { roles: next } = await tenancy.setRoleActive(roleId, activeNext)
      primeCache(`member_roles:${teamId}`, next)
      toast.success(activeNext ? "Role switched on." : "Role switched off.")
      setConfirmDeactivate(false)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't update the role.")
    } finally {
      setBusyActive(false)
    }
  }

  if (rolesQ.error) return <p className="text-destructive text-sm">Couldn&apos;t load the role.</p>
  if (rolesQ.data === undefined) return <Skeleton variant="list" lines={4} />
  if (!role) return <p className="text-muted-foreground text-sm">That role doesn&apos;t exist.</p>

  const matrixConfig: PermissionMatrixConfig | null = perms && {
    ...defaultPermissionMatrixConfig,
    modules: perms.modules,
    mode: perms.isDefault ? "locked" : perms.canEdit ? "edit" : "read",
    autoFlipRead: true,
    surface: "card",
  }
  const canSave = perms != null && !perms.isDefault && perms.canEdit

  return (
    <div className="flex flex-col gap-6">
      {/* Role header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <span className="truncate">{role.title}</span>
            {role.isDefault && (
              <Badge variant="outline" className="gap-1 text-[10px]">
                <Lock className="size-2.5" aria-hidden />
                Locked
              </Badge>
            )}
            {!role.active && (
              <Badge variant="outline" className="text-muted-foreground text-[10px]">
                Switched off
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {role.description || `${role.memberCount} member${role.memberCount === 1 ? "" : "s"}`}
          </p>
        </div>
        {canSave && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditingOpen(true)}
            className="shrink-0 gap-1.5"
          >
            <Pencil className="size-3.5" />
            Edit details
          </Button>
        )}
      </div>

      {!role.active ? (
        // Deactivated: permissions frozen (holders keep access); offer reactivate.
        <div className="border-border/60 flex flex-col gap-3 rounded-xl border p-6">
          <p className="text-muted-foreground text-sm">
            This role is switched off. Members who have it keep their access, but you can&apos;t give
            it to anyone new until you switch it back on.
          </p>
          {canDeactivate && (
            <Button
              onClick={() => void setActive(true)}
              disabled={busyActive}
              className="w-full gap-1.5 sm:w-auto sm:self-start"
            >
              {busyActive ? <Spinner /> : null}
              {busyActive ? "Switching on…" : "Switch on"}
            </Button>
          )}
        </div>
      ) : permsQ.loading || !matrixConfig || !draft ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground text-sm">
              {perms?.isDefault
                ? "The Admin role has full access and can't be changed."
                : canSave
                  ? "Switch on what this role can do. Turning on Create, Edit or Remove turns on Read too."
                  : "You can view what this role can do, but not change it."}
            </p>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {!role.isDefault && canDeactivate && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmDeactivate(true)}
                  disabled={busyActive}
                  className="text-destructive hover:text-destructive gap-1.5"
                >
                  Switch off
                </Button>
              )}
              {canSave && (
                <Button onClick={() => void save()} disabled={!dirty || saving}>
                  {saving ? <Spinner /> : null}
                  {saving ? "Saving…" : "Save"}
                </Button>
              )}
            </div>
          </div>
          <PermissionMatrix config={matrixConfig} value={draft} onChange={(next) => setDraft(next)} />
        </div>
      )}

      <RoleFormDialog
        open={editingOpen}
        onOpenChange={setEditingOpen}
        initial={{ title: role.title, description: role.description ?? "" }}
        onSubmit={updateDetails}
      />

      <AlertDialog
        open={confirmDeactivate}
        onOpenChange={(o) => !busyActive && setConfirmDeactivate(o)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch off {role.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              Members who have it keep their access, but you can&apos;t give it to anyone new.
              You can switch it back on later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyActive}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void setActive(false)
              }}
              disabled={busyActive}
            >
              {busyActive ? <Spinner /> : null}
              {busyActive ? "Switching off…" : "Switch off"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
