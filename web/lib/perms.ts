"use client"

// ONE place every screen asks "may I?" — mirrors the server's rights in the UI
// so you never see an action you can't perform (defense in depth: the server
// still enforces every write). Reads the SAME cached `my-perms:<teamId>` the
// page guard uses, so there's no extra fetch and it refreshes live when a role
// changes (AppShell invalidates it on a member_roles ping).

import type { PermissionValue } from "@shared/types"

import { tenancy } from "@/lib/api"
import { useCached } from "@/lib/store"

export type Right = "read" | "create" | "edit" | "delete"
export type Can = (module: string, right: Right) => boolean

/** Your effective rights for a team + a `can(module, right)` check. While rights
 * are still loading, `can` returns false (so actions stay hidden until known). */
export function usePermissions(teamId: string | null): {
  perms: PermissionValue | undefined
  loading: boolean
  can: Can
} {
  const q = useCached<PermissionValue>(teamId ? `my-perms:${teamId}` : null, () =>
    tenancy.myPermissions().then((r) => r.permissions)
  )
  const perms = q.data
  const can: Can = (module, right) => perms?.[module]?.[right] === true
  return { perms, loading: q.loading, can }
}
