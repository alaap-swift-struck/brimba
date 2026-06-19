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
 * (extras would fold into a "More" entry), with Home pinned to the centre. */
export function bottomNavItems(items: NavItem[]): NavItem[] {
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
  key: "overview" | "members" | "roles" | "invites"
  title: string
  module: string
  segment: string
}

export const TEAM_SECTIONS: TeamSection[] = [
  { key: "overview", title: "Overview", module: "teams", segment: "" },
  { key: "members", title: "Members", module: "team_members", segment: "members" },
  { key: "roles", title: "Member roles", module: "member_roles", segment: "roles" },
  { key: "invites", title: "Invites", module: "team_members", segment: "invites" },
]

/** A breadcrumb step. `href` omitted = the current (non-link) page. */
export type Crumb = { label: string; href?: string }

/** Is `path` the active nav destination for the current `pathname`? */
export function isNavActive(path: string, pathname: string): boolean {
  return pathname === path || pathname.startsWith(path + "/")
}
