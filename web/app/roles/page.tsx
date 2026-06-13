"use client"

// Roles & permissions screen — pick a role, see/edit what it can do via the
// library PermissionMatrix. The locked Admin role shows view-only (every cell
// on); other roles are editable, with the "any write needs read" rule applied
// live (and re-applied on the server when you save). Flat — no card surfaces.

import * as React from "react"

import { Badge } from "@swift-struck/ui/registry/primitives/badge/badge"
import { Button } from "@swift-struck/ui/registry/primitives/button/button"
import { Spinner } from "@swift-struck/ui/registry/primitives/spinner/spinner"
import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"
import {
  PermissionMatrix,
  defaultPermissionMatrixConfig,
  type PermissionMatrixConfig,
} from "@swift-struck/ui/registry/collections/permission-matrix/permission-matrix"
import { Lock, Plus, ShieldCheck } from "lucide-react"

import type { PermissionValue, RolePermissions, TeamRole } from "@shared/types"
import { AppShell, ShellLoading } from "@/components/app-shell"
import { CreateRoleDialog } from "@/components/create-role-dialog"
import { ApiFailure, tenancy } from "@/lib/api"
import { useActiveTeam } from "@/lib/use-active-team"

export default function RolesPage() {
  const active = useActiveTeam()
  const [roles, setRoles] = React.useState<TeamRole[] | null>(null)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [perms, setPerms] = React.useState<RolePermissions | null>(null)
  const [draft, setDraft] = React.useState<PermissionValue | null>(null)
  const [loadingPerms, setLoadingPerms] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Load the role list once the active team is known; select one to start.
  React.useEffect(() => {
    if (active.loading || !active.ctx) return
    let live = true
    tenancy
      .roles()
      .then(({ roles }) => {
        if (!live) return
        setRoles(roles)
        // Prefer the first editable role so the matrix opens interactive.
        const first = roles.find((r) => !r.isDefault) ?? roles[0]
        setSelectedId(first?.id ?? null)
      })
      .catch((err) => {
        if (!live) return
        setError(err instanceof ApiFailure ? err.message : "Couldn't load roles.")
      })
    return () => {
      live = false
    }
  }, [active.loading, active.ctx])

  // Load the selected role's matrix whenever the selection changes.
  React.useEffect(() => {
    if (!selectedId) return
    let live = true
    setLoadingPerms(true)
    tenancy
      .rolePermissions(selectedId)
      .then((p) => {
        if (!live) return
        setPerms(p)
        setDraft(p.value)
      })
      .catch((err) => {
        if (!live) return
        toast.error(
          err instanceof ApiFailure ? err.message : "Couldn't load permissions."
        )
      })
      .finally(() => live && setLoadingPerms(false))
    return () => {
      live = false
    }
  }, [selectedId])

  const dirty =
    perms != null &&
    draft != null &&
    JSON.stringify(draft) !== JSON.stringify(perms.value)

  async function save() {
    if (!selectedId || !draft) return
    setSaving(true)
    try {
      await tenancy.saveRolePermissions(selectedId, draft)
      // Re-read so we reflect exactly what the server stored (auto-flip-read).
      const fresh = await tenancy.rolePermissions(selectedId)
      setPerms(fresh)
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
    setRoles(next)
    const created = next.find((r) => !before.has(r.id))
    if (created) setSelectedId(created.id)
    toast.success(`Created ${title}.`)
  }

  if (active.loading || !active.ctx) return <ShellLoading />

  // Admin = locked (view-only, all on); editors get "edit"; everyone else
  // (read-only members) gets "read" so the matrix and Save can't mislead them.
  const matrixConfig: PermissionMatrixConfig | null = perms && {
    ...defaultPermissionMatrixConfig,
    modules: perms.modules,
    mode: perms.isDefault ? "locked" : perms.canEdit ? "edit" : "read",
    autoFlipRead: true,
  }
  const canSave = perms != null && !perms.isDefault && perms.canEdit

  return (
    <AppShell active={active}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div className="animate-rise flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Roles &amp; permissions
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              What each role can do in {active.ctx.team?.name ?? "this team"}.
            </p>
          </div>
          <Button onClick={() => setCreating(true)} className="shrink-0 gap-1.5">
            <Plus className="size-4" />
            New role
          </Button>
        </div>

        {error ? (
          <p className="text-destructive text-sm">{error}</p>
        ) : roles === null ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <>
            {/* Role picker — flat selectable rows, no card surface */}
            <div className="animate-rise divide-border/60 flex flex-col divide-y">
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

            {/* Selected role's matrix */}
            <div className="animate-rise flex flex-col gap-3">
              {loadingPerms || !matrixConfig || !draft ? (
                <div className="flex justify-center py-8">
                  <Spinner />
                </div>
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
                      <Button
                        onClick={() => void save()}
                        disabled={!dirty || saving}
                        className="shrink-0"
                      >
                        {saving ? <Spinner /> : null}
                        {saving ? "Saving…" : "Save"}
                      </Button>
                    )}
                  </div>
                  {/* bg-transparent flattens the body; the sticky module column
                      hardcodes bg-card in the library, so paint it bg-background
                      too — stays opaque for horizontal scroll, no card strip. */}
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
      </div>

      <CreateRoleDialog
        open={creating}
        onOpenChange={setCreating}
        onCreate={createRole}
      />
    </AppShell>
  )
}
