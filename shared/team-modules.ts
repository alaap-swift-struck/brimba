// THE one list of team modules a role's permission sheet covers — shared truth.
// Tenancy builds the permission matrix from it (tall sheet: one row per role ×
// module) and data-ops builds the import/export matrix columns from it, so the
// two can never drift. Adding a module here is the ONLY way it appears in either.

/** The modules every role's permission sheet covers today. Future modules just
 * add rows, never columns. */
export const TEAM_MODULES = [
  "teams",
  "team_members",
  "member_roles",
  "learning",
  "help",
  "selectable_data",
  "agent",
] as const

/** Plain-English label for each module, shown as the rows of the permission
 * matrix. Keyed off TEAM_MODULES so a new module can't be added without a
 * label. ONE source for both the workers and the Roles screen. */
const MODULE_LABELS: Record<(typeof TEAM_MODULES)[number], string> = {
  teams: "Team",
  team_members: "Members",
  member_roles: "Roles & permissions",
  learning: "Learning",
  help: "Help",
  selectable_data: "Dropdown data",
  agent: "AI agent",
}

/** The matrix rows: { key, label } per module, in display order. */
export const TEAM_MODULE_CATALOG: { key: string; label: string }[] =
  TEAM_MODULES.map((key) => ({ key, label: MODULE_LABELS[key] }))

/** The four rights each module row carries, in matrix order. */
export const MODULE_RIGHTS = ["read", "create", "edit", "delete"] as const
export type ModuleRight = (typeof MODULE_RIGHTS)[number]

/**
 * The rights each module ACTUALLY has — the narrowing behind the permission
 * matrix's `modules[].rights`.
 *
 * WHY THIS EXISTS. The matrix used to render all four rights for every module,
 * which meant five switches that enforced nothing: an admin ticked one, saw it
 * stick, and believed they had restricted something. A switch that enforces
 * nothing is worse than a missing one. A right left out here renders "—" in the
 * grid (with screen-reader text) instead of an off switch.
 *
 * THE RULE FOR EDITING THIS. A right belongs in a module's list when a door
 * opens on it — `requireRight` / `gated` / `gatedBody` with that pair — or when
 * a screen recipe's `gate` genuinely hides something on it. Shipping a door for
 * a right that is not listed here means adding it here in the same change,
 * otherwise the door is gated by a switch nobody can turn on. Verified against
 * the gated routes on 2026-08-25.
 */
const MODULE_RIGHTS_BY_MODULE: Record<(typeof TEAM_MODULES)[number], readonly ModuleRight[]> = {
  // No create door can bind: `createNamedTeam` is identity-gated because a
  // teamless person has to be able to make their first team. No delete door
  // exists either — teams are never deleted (deactivate-never-delete).
  // `read` stays: it is the gate on the team Overview screen recipe.
  teams: ["read", "edit"],
  team_members: ["read", "create", "edit", "delete"],
  member_roles: ["read", "create", "edit", "delete"],
  learning: ["read", "create", "edit", "delete"],
  help: ["read", "create", "edit"], // a ticket is never deleted or deactivated; it is closed via help:edit
  selectable_data: ["read", "create", "edit", "delete"],
  agent: ["read", "create"], // ask a question (read) and run a turn (create); a conversation is never edited or deleted
}

/** Which rights one module has. The one source the matrix and the workers both
 * read, so a grid switch and a server gate can never disagree. */
export function rightsOf(moduleKey: string): ModuleRight[] {
  const declared = MODULE_RIGHTS_BY_MODULE[moduleKey as (typeof TEAM_MODULES)[number]]
  return declared ? [...declared] : [...MODULE_RIGHTS]
}
