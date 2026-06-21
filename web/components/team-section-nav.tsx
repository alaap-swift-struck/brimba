"use client"

// The team-area section switcher (Overview · Members · Member roles · Invites),
// shown across every /t/<teamId>/… screen. Built on the library's config-driven
// Tabs (line variant) so each section carries its CONCEPT icon and — when the
// section leads with a collection — a count badge (the count of what that
// collection shows, compacted: 6 · 189 · 1.18M). Sections you lack the read-right
// for are hidden (the server re-checks too). Tabs here are just a nicer way to
// reach the sub-pages, so selecting one navigates (no panel content).

import { TabsView, defaultTabsConfig } from "@swift-struck/ui/registry/primitives/tabs/tabs"

import type { PermissionValue } from "@shared/types"
import { CONCEPT_ICON, TEAM_SECTIONS, type TeamSection } from "@/lib/pages"
import { abbreviateCount } from "@/lib/format"

export function TeamSectionNav({
  teamId,
  current,
  perms,
  counts,
  onNavigate,
}: {
  teamId: string
  current: TeamSection["key"]
  perms: PermissionValue | undefined
  /** Per-section collection count (omit a section to show no badge). */
  counts: Partial<Record<TeamSection["key"], number>>
  onNavigate: (href: string) => void
}) {
  if (!perms) return null
  const visible = TEAM_SECTIONS.filter((s) => perms[s.module]?.read)
  if (visible.length <= 1) return null

  const hrefFor = (s: TeamSection) => (s.segment ? `/t/${teamId}/${s.segment}` : `/t/${teamId}`)

  return (
    <TabsView
      config={{
        ...defaultTabsConfig,
        variant: "line",
        tabs: visible.map((s) => {
          const count = counts[s.key]
          return {
            value: s.key,
            label: s.title,
            icon: CONCEPT_ICON[s.key],
            badge: count != null ? abbreviateCount(count) : "",
            badgeVariant: "",
          }
        }),
      }}
      value={current}
      onValueChange={(v) => {
        const s = visible.find((x) => x.key === v)
        if (s) onNavigate(hrefFor(s))
      }}
    />
  )
}
