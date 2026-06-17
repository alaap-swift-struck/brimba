"use client"

// Members panel — the team's people in a library data-table, rendered inside the
// team-detail "Members" tab. Cache-first + live (AppShell invalidates
// `members:<team>` on a ping). All guard rules are enforced server-side.

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
import { Skeleton } from "@swift-struck/ui/registry/primitives/skeleton/skeleton"
import { Spinner } from "@swift-struck/ui/registry/primitives/spinner/spinner"
import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"
import {
  DataTable,
  defaultDataTableConfig,
} from "@swift-struck/ui/registry/collections/data-table/data-table"
import { MoreHorizontal, ShieldCheck } from "lucide-react"

import type { TeamMember } from "@shared/types"
import { RolePickerDialog } from "@/components/role-picker-dialog"
import { ApiFailure, tenancy } from "@/lib/api"
import { usePermissions } from "@/lib/perms"
import { invalidate, primeCache, useCached } from "@/lib/store"
import type { ActiveTeam } from "@/lib/use-active-team"

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

export function MembersPanel({ active }: { active: ActiveTeam }) {
  const teamId = active.ctx?.team?.id ?? null

  const membersQ = useCached(teamId ? `members:${teamId}` : null, () =>
    tenancy.members().then((r) => r.members)
  )
  const rolesQ = useCached(teamId ? `member_roles:${teamId}` : null, () =>
    tenancy.roles().then((r) => r.roles)
  )
  const members = membersQ.data
  const roles = rolesQ.data ?? []

  // Mirror the server's rights in the UI — never show an action you can't do.
  const { can } = usePermissions(teamId)
  const canEditRoles = can("team_members", "edit")
  const canRemove = can("team_members", "delete")

  const [roleTarget, setRoleTarget] = React.useState<TeamMember | null>(null)
  const [removeTarget, setRemoveTarget] = React.useState<TeamMember | null>(null)
  const [removing, setRemoving] = React.useState(false)

  async function changeRole(roleId: string) {
    if (!roleTarget || !teamId) return
    const { members } = await tenancy.setMemberRole(roleTarget.userId, roleId)
    primeCache(`members:${teamId}`, members)
    invalidate(`member_roles:${teamId}`)
    toast.success(`Updated ${fullName(roleTarget)}'s role.`)
  }

  async function confirmRemove() {
    if (!removeTarget || !teamId) return
    setRemoving(true)
    try {
      const { members } = await tenancy.removeMember(removeTarget.userId)
      primeCache(`members:${teamId}`, members)
      invalidate(`member_roles:${teamId}`)
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
              <div className="text-muted-foreground truncate text-xs">{m.email}</div>
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
          <span className="text-muted-foreground text-sm">{formatDate(m.joinedAt)}</span>
        ),
        menu:
          m.isYou || (!canEditRoles && !canRemove) ? null : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" style={{ backgroundColor: "var(--popover)" }}>
                {canEditRoles && (
                  <DropdownMenuItem onSelect={() => setRoleTarget(m)}>
                    Change role
                  </DropdownMenuItem>
                )}
                {canRemove && (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={() => setRemoveTarget(m)}
                  >
                    Remove from team
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ),
      })),
    [members, canEditRoles, canRemove]
  )

  return (
    <>
      {membersQ.error ? (
        <p className="text-destructive text-sm">Couldn&apos;t load members.</p>
      ) : members === undefined ? (
        <Skeleton variant="list" lines={4} />
      ) : (
        <DataTable data={rows} config={TABLE_CONFIG} />
      )}

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
              They lose access to {active.ctx?.team?.name ?? "this team"} right away.
              You can invite them back later.
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
    </>
  )
}
