"use client"

// Members screen — the team's people in a library data-table. Each row has a
// "⋯" menu: Change role (opens the role picker) and Remove (confirm first).
// All the hard rules (no self-edit, keep one admin) are enforced server-side;
// the UI just hides the actions that can't apply (your own row) and surfaces
// any guard message as a toast.

import * as React from "react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@swift-struck/ui/registry/primitives/avatar/avatar"
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
import { Badge } from "@swift-struck/ui/registry/primitives/badge/badge"
import { Button } from "@swift-struck/ui/registry/primitives/button/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@swift-struck/ui/registry/primitives/dropdown-menu/dropdown-menu"
import { Spinner } from "@swift-struck/ui/registry/primitives/spinner/spinner"
import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"
import {
  DataTable,
  defaultDataTableConfig,
} from "@swift-struck/ui/registry/collections/data-table/data-table"
import { MoreHorizontal, ShieldCheck } from "lucide-react"

import type { TeamMember, TeamRole } from "@shared/types"
import { AppShell, ShellLoading } from "@/components/app-shell"
import { RolePickerDialog } from "@/components/role-picker-dialog"
import { ApiFailure, tenancy } from "@/lib/api"
import { useActiveTeam } from "@/lib/use-active-team"

const COLUMNS = [
  { key: "member", header: "Member", type: "text", sortable: false, align: "left" },
  { key: "role", header: "Role", type: "text", sortable: true, align: "left" },
  { key: "joined", header: "Joined", type: "text", sortable: false, align: "left" },
  { key: "menu", header: "", type: "text", sortable: false, align: "right" },
] as const

const TABLE_CONFIG = {
  ...defaultDataTableConfig,
  columns: COLUMNS as unknown as typeof defaultDataTableConfig.columns,
  searchable: false,
  rowActions: false,
  emptyText: "No members yet.",
}

function fullName(m: TeamMember) {
  return [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email
}

function initials(m: TeamMember) {
  return (
    `${m.firstName?.[0] ?? ""}${m.lastName?.[0] ?? ""}`.toUpperCase() ||
    m.email[0]?.toUpperCase() ||
    "?"
  )
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

export default function MembersPage() {
  const active = useActiveTeam()
  const [members, setMembers] = React.useState<TeamMember[] | null>(null)
  const [roles, setRoles] = React.useState<TeamRole[]>([])
  const [error, setError] = React.useState<string | null>(null)

  const [roleTarget, setRoleTarget] = React.useState<TeamMember | null>(null)
  const [removeTarget, setRemoveTarget] = React.useState<TeamMember | null>(null)
  const [removing, setRemoving] = React.useState(false)

  // Load members + roles once the active team is known.
  React.useEffect(() => {
    if (active.loading || !active.ctx) return
    let live = true
    Promise.all([tenancy.members(), tenancy.roles()])
      .then(([m, r]) => {
        if (!live) return
        setMembers(m.members)
        setRoles(r.roles)
      })
      .catch((err) => {
        if (!live) return
        setError(
          err instanceof ApiFailure ? err.message : "Couldn't load members."
        )
      })
    return () => {
      live = false
    }
  }, [active.loading, active.ctx])

  async function changeRole(roleId: string) {
    if (!roleTarget) return
    const { members } = await tenancy.setMemberRole(roleTarget.userId, roleId)
    setMembers(members)
    toast.success(`Updated ${fullName(roleTarget)}'s role.`)
  }

  async function confirmRemove() {
    if (!removeTarget) return
    setRemoving(true)
    try {
      const { members } = await tenancy.removeMember(removeTarget.userId)
      setMembers(members)
      toast.success(`Removed ${fullName(removeTarget)}.`)
      setRemoveTarget(null)
    } catch (err) {
      toast.error(
        err instanceof ApiFailure ? err.message : "Couldn't remove the member."
      )
    } finally {
      setRemoving(false)
    }
  }

  // Map members to the table's display rows (cells are React nodes).
  const rows = React.useMemo(
    () =>
      (members ?? []).map((m) => ({
        member: (
          <div className="flex items-center gap-3">
            <Avatar className="size-8">
              {m.imageUrl && <AvatarImage src={m.imageUrl} alt={fullName(m)} />}
              <AvatarFallback className="text-xs">{initials(m)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <span className="truncate">{fullName(m)}</span>
                {m.isYou && (
                  <Badge variant="outline" className="text-[10px]">
                    You
                  </Badge>
                )}
              </div>
              <div className="text-muted-foreground truncate text-xs">
                {m.email}
              </div>
            </div>
          </div>
        ),
        role: (
          <Badge variant="secondary" className="gap-1">
            {m.isAdmin && <ShieldCheck className="size-3" />}
            {m.roleTitle}
          </Badge>
        ),
        joined: (
          <span className="text-muted-foreground text-sm">
            {formatDate(m.joinedAt)}
          </span>
        ),
        menu: m.isYou ? null : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setRoleTarget(m)}>
                Change role
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => setRemoveTarget(m)}
              >
                Remove from team
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      })),
    [members]
  )

  if (active.loading || !active.ctx) return <ShellLoading />

  return (
    <AppShell active={active}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div className="animate-rise">
          <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Who&apos;s on {active.ctx.team?.name ?? "this team"} and the role
            each one holds.
          </p>
        </div>

        <div className="animate-rise">
          {error ? (
            <p className="text-destructive text-sm">{error}</p>
          ) : members === null ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : (
            <DataTable data={rows} config={TABLE_CONFIG} />
          )}
        </div>
      </div>

      <RolePickerDialog
        open={roleTarget !== null}
        onOpenChange={(o) => !o && setRoleTarget(null)}
        roles={roles}
        currentRoleId={roleTarget?.roleId ?? null}
        subjectName={roleTarget ? fullName(roleTarget) : null}
        onPick={changeRole}
      />

      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(o) => !removing && !o && setRemoveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {removeTarget ? fullName(removeTarget) : "this member"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They lose access to {active.ctx.team?.name ?? "this team"} right
              away. You can invite them back later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void confirmRemove()
              }}
              disabled={removing}
            >
              {removing ? <Spinner /> : null}
              {removing ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  )
}
