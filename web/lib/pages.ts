// The page registry — ONE source for the app's navigation, slugs and the
// per-tab permission a screen needs. The nav shell, breadcrumbs and the page
// guard all read from here, so adding a screen is a one-line change.

/** Top-level destinations (sidebar on desktop, bottom tabs on mobile).
 * `need` (optional) is a right required to see it — gated destinations vanish
 * from the nav for people who lack it. Home/Settings are universal. */
export type NavItem = {
  slug: string
  path: string
  title: string
  icon: "home" | "settings"
  need?: { module: string; right: "read" }
}

export const NAV: NavItem[] = [
  { slug: "home", path: "/home", title: "Home", icon: "home" },
  { slug: "settings", path: "/settings", title: "Settings", icon: "settings" },
]

/** The mobile bottom-bar set: only destinations the user can reach, capped at 5
 * (extras would fold into a "More" entry), with Home pinned to the centre.
 * Generic over the link shape so the shell can pass its composed Home + team
 * sidebar pages + Settings list, not just the bare NAV. */
export function bottomNavItems<T extends { slug: string }>(items: T[]): T[] {
  const capped = items.slice(0, 5)
  const home = capped.find((i) => i.slug === "home")
  if (!home) return capped
  const rest = capped.filter((i) => i.slug !== "home")
  const mid = Math.floor((rest.length + 1) / 2) // centre index for the full set
  return [...rest.slice(0, mid), home, ...rest.slice(mid)]
}

/** The sections of a team's area (the switcher across /t/<teamId>/…). `module` is
 * the read-right needed to see it; `segment` is the URL segment under the team
 * (empty = the team overview at /t/<teamId> itself). Activity lives as a tab on
 * the Overview screen, so it isn't a separate section. */
export type TeamSection = {
  key: "overview" | "members" | "roles" | "invites" | "dropdowns" | "learning" | "help" | "import"
  title: string
  module: string
  segment: string
  /** Where this destination appears in navigation:
   *  - "tab": a tab on the team area (the admin sections under Settings → team)
   *  - "sidebar": a first-class left-sidebar page (team-scoped, gated by its read right)
   *  - "contextual": reached from a button on another page (e.g. Import) — never a tab or sidebar item */
  placement: "tab" | "sidebar" | "contextual"
  /** The team-scoped cache-key PREFIX whose loaded rows ARE this section's count
   * (deep-link-screen keys each collection `${prefix}:${teamId}`). Present on every
   * section that leads with a collection, so the tab-count badge is DERIVED from
   * the same rows the screen shows and can never be forgotten (LAW R8). Absent on
   * metadata/non-collection tabs (Overview) and non-tab destinations (Import). */
  countCacheKey?: string
}

export const TEAM_SECTIONS: TeamSection[] = [
  // Overview leads with team metadata, not a collection → no countCacheKey (LAW R8 exception).
  { key: "overview", title: "Overview", module: "teams", segment: "", placement: "tab" },
  { key: "members", title: "Members", module: "team_members", segment: "members", placement: "tab", countCacheKey: "members" },
  { key: "roles", title: "Member roles", module: "member_roles", segment: "roles", placement: "tab", countCacheKey: "member_roles" },
  { key: "invites", title: "Invites", module: "team_members", segment: "invites", placement: "tab", countCacheKey: "invites" },
  // Dropdown values ("selectable data") — managed on the team page, a tab beside
  // the other admin sections. Gated by the selectable_data module.
  { key: "dropdowns", title: "Dropdown values", module: "selectable_data", segment: "dropdowns", placement: "tab", countCacheKey: "selectable" },
  // Learning + Help are first-class SIDEBAR pages (not buried tabs) — team-scoped,
  // each gated by its own read right. The URL segment IS the permission module.
  { key: "learning", title: "Learning", module: "learning", segment: "learning", placement: "sidebar", countCacheKey: "learning" },
  { key: "help", title: "Help", module: "help", segment: "help", placement: "sidebar", countCacheKey: "help" },
  // Import has NO read-right of its own — it's gated per-target (create on
  // member_roles or learning). Reached CONTEXTUALLY from an "Import CSV" button on
  // those pages (which land on /t/<team>/import/<tableKey>), never a tab.
  { key: "import", title: "Import", module: "import", segment: "import", placement: "contextual" },
]

/** The ONE icon vocabulary for the app — each concept (page / section / record
 * kind) gets a single, distinct lucide icon (kebab-case name), reused at the
 * page, section-tab and button level so "members" always looks the same wherever
 * it appears. Add a concept here, not a one-off icon at a call site. */
export const CONCEPT_ICON = {
  home: "home",
  settings: "settings",
  team: "building",
  overview: "layout-dashboard",
  members: "users",
  roles: "shield-half",
  invites: "mail",
  dropdowns: "list",
  learning: "graduation-cap",
  help: "life-buoy",
  import: "upload",
  activity: "history",
} as const

export type ConceptKey = keyof typeof CONCEPT_ICON

/** A breadcrumb step. `href` omitted = the current (non-link) page. */
export type Crumb = { label: string; href?: string }

/** Is `path` the active nav destination for the current `pathname`? */
export function isNavActive(path: string, pathname: string): boolean {
  return pathname === path || pathname.startsWith(path + "/")
}
