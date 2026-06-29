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
  | "dropdowns"
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
  /** true when reached via a clean top-level module URL (/learning, /help) rather
   * than /t/<teamId>/… — the host resolves the team from the active context, like
   * /home does. */
  topLevel: boolean
}

/** Modules that have a clean top-level URL (/learning, /help) — their own pages,
 * not nested under /t/<teamId>. They resolve the active team from context. */
export const TOP_LEVEL_MODULES = ["learning", "help"]

export function parseRoute(pathname: string, search: string): Route {
  const segs = pathname.split("/").filter(Boolean) // ["t", teamId, module?, id?] OR [module, id?]
  const query = parseScreenQuery(new URLSearchParams(search))
  if (segs[0] === "t") {
    const levels = parseScreenPath(segs.slice(2)) // [{module,id}, …]
    return {
      teamId: segs[1] ?? "",
      module: levels[0]?.module || "team",
      recordId: levels[0]?.id || "",
      query,
      topLevel: false,
    }
  }
  // Top-level module URL: /learning, /learning/<id>, /help, /help/<id>.
  const levels = parseScreenPath(segs)
  return {
    teamId: "",
    module: levels[0]?.module || "team",
    recordId: levels[0]?.id || "",
    query,
    topLevel: true,
  }
}

/** The friendly title for a module segment (for breadcrumbs). */
export function sectionTitle(module: string): string {
  return TEAM_SECTIONS.find((s) => s.segment === module)?.title ?? "Team"
}
