"use client"

// The team-area section switcher (Overview · Members · Member roles · Invites),
// shown across every /t/<teamId>/… screen. Sections you lack the read-right for
// are hidden (the server re-checks too). Each section is its own link, so the
// trail and Back button work and links are shareable. A wrapping button row —
// it never forces horizontal scroll on mobile (UI-RULES).

import type { PermissionValue } from "@shared/types"
import { TEAM_SECTIONS } from "@/lib/pages"

export function TeamSectionNav({
  teamId,
  current,
  perms,
  onNavigate,
}: {
  teamId: string
  /** The active section key (from the URL). */
  current: "overview" | "members" | "roles" | "invites"
  /** Your effective rights — drives which sections are visible. */
  perms: PermissionValue | undefined
  onNavigate: (href: string) => void
}) {
  if (!perms) return null
  const visible = TEAM_SECTIONS.filter((s) => perms[s.module]?.read)
  if (visible.length <= 1) return null

  return (
    <nav className="border-border/60 flex flex-wrap gap-1 border-b pb-px" aria-label="Team sections">
      {visible.map((s) => {
        const active = s.key === current
        const href = s.segment ? `/t/${teamId}/${s.segment}` : `/t/${teamId}`
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onNavigate(href)}
            aria-current={active ? "page" : undefined}
            className={`-mb-px rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "border-foreground text-foreground"
                : "text-muted-foreground hover:text-foreground border-transparent"
            }`}
          >
            {s.title}
          </button>
        )
      })}
    </nav>
  )
}
