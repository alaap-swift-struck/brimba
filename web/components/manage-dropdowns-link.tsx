"use client"

// "Manage dropdowns" — a small link shown beneath a dropdown that jumps to the
// team's dropdown-values settings (Settings → Dropdown values), where you add or
// edit options. Shown ONLY to people who can create or edit dropdown values; a
// read-only member can't act on it, so it stays hidden for them. Your form draft
// survives the navigation (CACHING.md §11), so you can add an option and return to a
// still-filled form.

import { Settings2 } from "lucide-react"

import { usePermissions } from "@/lib/perms"

export function ManageDropdownsLink({ teamId }: { teamId: string | null }) {
  const { can } = usePermissions(teamId)
  const allowed = !!teamId && (can("selectable_data", "create") || can("selectable_data", "edit"))
  if (!allowed) return null
  return (
    <a
      href={`/t/${teamId}/dropdowns`}
      className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-xs underline-offset-2 hover:underline"
    >
      <Settings2 className="size-3" aria-hidden />
      Manage dropdowns
    </a>
  )
}
