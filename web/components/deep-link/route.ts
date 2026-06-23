// The /t/* deep-link grammar — pure URL → route parsing (no React), shared by the
// deep-link screen. /t/<teamId>/<module>/<id>?panel|confirm. Kept separate so the
// resolver component stays focused on data + rendering.

import { parseScreenPath, parseScreenQuery, type ScreenQuery } from "@swift-struck/ui/lib/recipe"

import { TEAM_SECTIONS } from "@/lib/pages"

/** The team-area sections (the tab spine across /t/<teamId>/…). */
export type SectionKey =
  | "overview"
  | "members"
  | "roles"
  | "invites"
  | "learning"
  | "help"
  | "import"

export type Route = {
  teamId: string
  /** friendly URL module segment: team | members | roles | invites (| unknown) */
  module: string
  /** "" = the list / overview level (no record selected) */
  recordId: string
  query: ScreenQuery
}

export function parseRoute(pathname: string, search: string): Route {
  const segs = pathname.split("/").filter(Boolean) // ["t", teamId, module?, id?, …]
  const teamId = segs[1] ?? ""
  const levels = parseScreenPath(segs.slice(2)) // [{module,id}, …]
  return {
    teamId,
    module: levels[0]?.module || "team",
    recordId: levels[0]?.id || "",
    query: parseScreenQuery(new URLSearchParams(search)),
  }
}

/** The friendly title for a module segment (for breadcrumbs). */
export function sectionTitle(module: string): string {
  return TEAM_SECTIONS.find((s) => s.segment === module)?.title ?? "Team"
}
