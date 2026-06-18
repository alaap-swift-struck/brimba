"use client"

// Invites panel — invite people by email to a role, and manage pending /
// accepted / revoked / expired invites. Rendered in the team-detail "Invites"
// tab. Cache-first + live (AppShell invalidates invites:<team> on a ping).
// The list is bordered but transparent — a border, not a card background.

import * as React from "react"

import { Badge } from "@swift-struck/ui/registry/primitives/badge/badge"
import { Button } from "@swift-struck/ui/registry/primitives/button/button"
import { Input } from "@swift-struck/ui/registry/primitives/input/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@swift-struck/ui/registry/primitives/select/select"
import { Skeleton } from "@swift-struck/ui/registry/primitives/skeleton/skeleton"
import { Spinner } from "@swift-struck/ui/registry/primitives/spinner/spinner"
import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"
import { Mail } from "lucide-react"

import type { Invite, TeamRole } from "@shared/types"
import { ApiFailure, tenancy } from "@/lib/api"
import { usePermissions } from "@/lib/perms"
import { primeCache, useCached } from "@/lib/store"
import type { ActiveTeam } from "@/lib/use-active-team"

const STATUS: Record<Invite["status"], string> = {
  pending: "Pending",
  accepted: "Accepted",
  revoked: "Revoked",
  expired: "Expired",
}

export function InvitesPanel({ active }: { active: ActiveTeam }) {
  const teamId = active.ctx?.team?.id ?? null

  const invitesQ = useCached(teamId ? `invites:${teamId}` : null, () =>
    tenancy.invites().then((r) => r.invites)
  )
  const rolesQ = useCached<TeamRole[]>(teamId ? `member_roles:${teamId}` : null, () =>
    tenancy.roles().then((r) => r.roles)
  )
  const invites = invitesQ.data
  const roles = rolesQ.data ?? []

  const { can } = usePermissions(teamId)
  const canInvite = can("team_members", "create")
  const canRevoke = can("team_members", "delete")

  const [email, setEmail] = React.useState("")
  const [roleId, setRoleId] = React.useState<string>("")
  const [sending, setSending] = React.useState(false)

  // Default the role select to the first non-Admin role once roles load.
  React.useEffect(() => {
    if (!roleId && roles.length) {
      setRoleId((roles.find((r) => !r.isDefault) ?? roles[0]).id)
    }
  }, [roles, roleId])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!teamId || !email.trim() || !roleId) return
    setSending(true)
    try {
      const { invites } = await tenancy.createInvite(email.trim(), roleId)
      primeCache(`invites:${teamId}`, invites)
      toast.success(`Invited ${email.trim()}.`)
      setEmail("")
    } catch (err) {
      toast.error(
        err instanceof ApiFailure ? err.message : "Couldn't send the invite."
      )
    } finally {
      setSending(false)
    }
  }

  async function revoke(inviteId: string) {
    if (!teamId) return
    try {
      const { invites } = await tenancy.revokeInvite(inviteId)
      primeCache(`invites:${teamId}`, invites)
      toast.success("Invite revoked.")
    } catch (err) {
      toast.error(
        err instanceof ApiFailure ? err.message : "Couldn't revoke the invite."
      )
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Invite-by-email form — only for those who may invite. Mobile-first:
       * controls STACK (full width) on phones so the email field shows its
       * placeholder + the typed address; they line up in a row only at sm+
       * (library UI-RULES: never blindly inherit desktop horizontal layout). */}
      {canInvite && (
        <form onSubmit={send} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
            disabled={sending}
            className="w-full min-w-0 sm:flex-1"
          />
          <Select value={roleId} onValueChange={setRoleId} disabled={sending}>
            <SelectTrigger className="w-full sm:w-40 sm:shrink-0">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" disabled={sending || !email.trim() || !roleId} className="w-full gap-1.5 sm:w-auto sm:shrink-0">
            {sending ? <Spinner /> : <Mail className="size-4" />}
            {sending ? "Sending…" : "Send invite"}
          </Button>
        </form>
      )}

      {/* Invite list — bordered, transparent fill */}
      {invitesQ.error ? (
        <p className="text-destructive text-sm">Couldn&apos;t load invites.</p>
      ) : invites === undefined ? (
        <Skeleton variant="list" lines={3} />
      ) : invites.length === 0 ? (
        <p className="text-muted-foreground border-border/60 rounded-xl border py-8 text-center text-sm">
          {canInvite ? "No invites yet — invite someone above." : "No invites yet."}
        </p>
      ) : (
        <div className="divide-border/60 overflow-hidden rounded-xl border divide-y">
          {invites.map((inv) => (
            <div key={inv.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{inv.email}</div>
                <div className="text-muted-foreground truncate text-xs">{inv.roleTitle}</div>
              </div>
              <Badge
                variant={inv.status === "pending" ? "secondary" : "outline"}
                className={
                  inv.status === "accepted"
                    ? "text-[11px] text-emerald-600 dark:text-emerald-400"
                    : "text-muted-foreground text-[11px]"
                }
              >
                {STATUS[inv.status]}
              </Badge>
              {inv.status === "pending" && canRevoke && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void revoke(inv.id)}
                  className="text-destructive hover:text-destructive shrink-0"
                >
                  Revoke
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
