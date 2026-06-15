// The page registry — ONE source for the app's navigation, slugs and the
// per-tab permission a screen needs. The nav shell, breadcrumbs and the page
// guard all read from here, so adding a screen is a one-line change.

/** Top-level destinations (sidebar on desktop, bottom tabs on mobile). */
export type NavItem = { slug: string; path: string; title: string; icon: "home" | "settings" }

export const NAV: NavItem[] = [
  { slug: "home", path: "/", title: "Home", icon: "home" },
  { slug: "settings", path: "/settings", title: "Settings", icon: "settings" },
]

/** Tabs inside a team's detail screen. `module` is the right needed to see the
 * tab (read); `soon` marks a not-yet-built tab. */
export type TeamTab = {
  key: "members" | "roles" | "invites"
  title: string
  module: string
  soon?: boolean
}

export const TEAM_TABS: TeamTab[] = [
  { key: "members", title: "Members", module: "team_members" },
  { key: "roles", title: "Member roles", module: "member_roles" },
  { key: "invites", title: "Invites", module: "team_members", soon: true },
]

/** A breadcrumb step. `href` omitted = the current (non-link) page. */
export type Crumb = { label: string; href?: string }

/** Is `path` the active nav destination for the current `pathname`? */
export function isNavActive(path: string, pathname: string): boolean {
  return path === "/" ? pathname === "/" : pathname.startsWith(path)
}
