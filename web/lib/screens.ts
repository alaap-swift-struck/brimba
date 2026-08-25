// Base screen recipes — whole screens described as DATA, rendered by the library
// engine (@swift-struck/ui ScreenRenderer). The host (deep-link-screen.tsx)
// shapes app types into the flat rows/records these recipes reference, supplies
// the per-module rights, dispatches the named actions, and owns the router. A
// team can OVERRIDE any recipe at runtime via the config store (M2); the
// resolver merges override-over-base. Keyed by `<module>.<view>`, where the
// module is the friendly URL segment used in the deep-link grammar
// (/t/<teamId>/<module>/<id>).

import type {
  RecipeAction,
  RecipeField,
  ScreenQuery,
  ScreenRecipe,
} from "@swift-struck/ui/lib/recipe"
import {
  defaultCollectionConfig,
  defaultFieldConfig,
  type CollectionConfig,
  type FilterFacet,
} from "@swift-struck/ui/lib/config"

import { CONCEPT_ICON } from "@/lib/pages"

/** A plain text column/field for a recipe (label only — the host supplies the
 * already-formatted value in the row/record). */
function field(column: string, label: string): RecipeField {
  return { column, type: "text", field: { ...defaultFieldConfig, label } }
}

/** THE WAY OUT OF AN EMPTY SCREEN — `emptyAction`, and the dispatch behind it.
 *
 * `ScreenRecipe.emptyAction` names one of the recipe's OWN `actions` by id, and
 * the engine renders it inside the empty state as an `ActionButton` that fires
 * `onAction(action.id)`. Because it is one of the recipe's own actions it is
 * GATED like any other: a viewer without the create right is not invited to
 * press a button their role would refuse.
 *
 * The half that has to exist FIRST is the host's dispatch. `deep-link-screen`'s
 * one `onAction` switch used to know exactly four ids — `members.changeRole`,
 * `members.remove`, `invites.revoke`, `team.edit` — and had no default branch,
 * so a create id declared here rendered a button that did nothing: a dead end on
 * the one screen a brand-new team is guaranteed to meet, which is worse than the
 * plain empty state it replaced. The default branch resolves the id through
 * `createPanelFor` below, so the two halves cannot drift apart.
 *
 * The empty TEXT still carries its own weight: it says what the screen WILL hold
 * rather than naming an absence, so it reads correctly for the viewer who sees
 * no button at all. */

/** The add-panel a `<module>.create` action id opens — the ONE place that maps a
 * recipe's create action to a URL, so the recipes here and the host's dispatcher
 * can never disagree about what a button does.
 *
 * The module comes from the id's prefix, not from the recipe it sits on: the
 * Members list's way out is an INVITE (`invites.create`), because inviting is
 * how a person joins a team. Anything that isn't a create resolves to null and
 * opens nothing, rather than a blank panel. */
export function createPanelFor(actionId: string): ScreenQuery | null {
  const [module, verb] = actionId.split(".")
  if (verb !== "create" || !module) return null
  return { panel: "add", module }
}

/** A list collection config with Layer-1 (client-side, in-memory) search ON —
 * the library search/filters have landed (SEARCH.md · UI-GAPS #7), so every
 * bounded list searches its already-cached rows with zero new requests. The
 * engine auto-points the search at the recipe `fields` columns (the shaped text:
 * name / detail / email), so flipping `searchable` is all the wiring needed.
 *
 * `filterFacets` adds the user-facing FILTER bar (`userFilter`): each facet's
 * `field` must be a real column on the SHAPED rows (a chosen value becomes an
 * `is` Rule on it); options are auto-derived from the data. Threaded per-call
 * like the search placeholder. */
function listCollection(
  emptyText: string,
  searchPlaceholder: string,
  filterFacets: FilterFacet[] = [],
  opts: { paged?: boolean } = {}
): CollectionConfig {
  return {
    ...defaultCollectionConfig,
    searchable: true,
    searchPlaceholder,
    headerLayout: "inline",
    userFilter: filterFacets.length > 0,
    filterFacets,
    emptyText,
    // R14 meets R16: on a PAGED collection the frame's own "Showing X of Y" is
    // wrong in both numbers — it counts the loaded PREFIX, so it reads
    // "Showing 50 of 50" beside a badge that correctly says 55. The count is
    // shown exactly once, above, through the formatCount seam.
    showCount: !opts.paged,
  }
}

/** The permission module a friendly URL segment maps to. URLs stay readable
 * (members / roles / invites / team) while rights + gates use the real module
 * key the server enforces. */
export const MODULE_PERMISSION: Record<string, string> = {
  team: "teams",
  members: "team_members",
  roles: "member_roles",
  invites: "team_members",
  dropdowns: "selectable_data",
  // The content modules' URL segment IS their permission module (no alias).
  learning: "learning",
  help: "help",
}

/* --------------------------------- team --------------------------------- */

/** Team overview — the team's metadata (Overview) + its activity feed, the
 * landing screen at /t/<teamId>. Edit team is gated by teams:edit. */
export const teamDetailRecipe: ScreenRecipe = {
  type: "detail",
  binding: { module: "team" },
  gate: { module: "teams", right: "read" },
  fields: [],
  actions: [
    {
      id: "team.edit",
      label: "Edit team",
      action: "team.edit",
      variant: "outline",
      gate: { module: "teams", right: "edit" },
    },
  ],
  header: { title: "name", avatar: "image" },
  tabs: [
    {
      key: "overview",
      label: "Overview",
      icon: CONCEPT_ICON.overview,
      block: {
        kind: "description",
        columns: 1,
        rows: [
          { label: "Created", column: "created" },
          { label: "Created by", column: "createdBy" },
          { label: "Last updated", column: "updated" },
        ],
      },
    },
    {
      key: "activity",
      label: "Activity",
      icon: CONCEPT_ICON.activity,
      block: { kind: "activity", source: "activity" },
    },
  ],
}

/* -------------------------------- members -------------------------------- */

/** Members list — clean rows (name + a role · joined summary line), tap a row to
 * open the member's detail. Mutating actions live on the detail (so the list
 * stays clean and we never show a self/last-admin action that would be refused). */
export const membersListRecipe: ScreenRecipe = {
  type: "list",
  display: "list",
  surface: "none",
  binding: { module: "members" },
  gate: { module: "team_members", right: "read" },
  fields: [field("name", "Member"), field("detail", "Details")],
  // The way out is an INVITE, not a "new member": a person joins a team by
  // accepting one, so `invites.create` is the id (see createPanelFor) and
  // team_members:create is the right that governs it.
  actions: [
    {
      id: "invites.create",
      label: "Invite",
      action: "invites.create",
      gate: { module: "team_members", right: "create" },
    },
  ],
  emptyAction: "invites.create",
  collection: listCollection("Everyone on your team appears here, with the role each one holds.", "Search members…", [
    { field: "role", label: "Role", control: "select" },
  ]),
}

/** Member detail (Overview + Activity). Actions change-role + remove are gated by
 * team_members edit/delete; the host hides them on your own row. */
export const memberDetailRecipe: ScreenRecipe = {
  type: "detail",
  binding: { module: "members" },
  gate: { module: "team_members", right: "read" },
  fields: [],
  actions: [
    {
      id: "members.changeRole",
      label: "Change role",
      action: "members.changeRole",
      variant: "outline",
      gate: { module: "team_members", right: "edit" },
    },
    {
      id: "members.remove",
      label: "Remove from team",
      action: "members.remove",
      variant: "destructive",
      gate: { module: "team_members", right: "delete" },
    },
  ],
  header: { title: "name", subtitle: "email", avatar: "image" },
  tabs: [
    {
      key: "overview",
      label: "Overview",
      icon: CONCEPT_ICON.overview,
      block: {
        kind: "description",
        columns: 1,
        rows: [
          { label: "Role", column: "role" },
          { label: "Joined", column: "joined" },
          { label: "Email", column: "email" },
        ],
      },
    },
    {
      key: "activity",
      label: "Activity",
      icon: CONCEPT_ICON.activity,
      block: { kind: "activity", source: "activity" },
    },
  ],
}

/* --------------------------------- roles --------------------------------- */

/** Roles list — clean rows (title + a members/description summary line). Tapping
 * a role opens its detail (the permission grid + edit/deactivate live there). */
export const rolesListRecipe: ScreenRecipe = {
  type: "list",
  display: "list",
  surface: "none",
  binding: { module: "roles" },
  gate: { module: "member_roles", right: "read" },
  fields: [field("name", "Role"), field("detail", "Details")],
  actions: [
    {
      id: "roles.create",
      label: "New role",
      action: "roles.create",
      gate: { module: "member_roles", right: "create" },
    },
  ],
  emptyAction: "roles.create",
  collection: listCollection("A role decides what a member can see and do. Your team's roles appear here.", "Search roles…", [
    { field: "state", label: "Status", control: "select" },
  ]),
}

/* -------------------------------- invites -------------------------------- */

/** Invites list — clean rows (email + a role · status line). Tapping an invite
 * opens its detail, where Revoke lives (pending only). */
export const invitesListRecipe: ScreenRecipe = {
  type: "list",
  display: "list",
  surface: "none",
  binding: { module: "invites" },
  gate: { module: "team_members", right: "read" },
  fields: [field("email", "Email"), field("detail", "Details")],
  actions: [
    {
      id: "invites.create",
      label: "Invite",
      action: "invites.create",
      gate: { module: "team_members", right: "create" },
    },
  ],
  emptyAction: "invites.create",
  collection: listCollection("Invites you send appear here, so you can see who hasn't joined yet.", "Search invites…", [
    { field: "status", label: "Status", control: "select" },
  ]),
}

/** Invite detail — who/what/when, plus Revoke (gated team_members:delete; the
 * host shows it only while the invite is still pending). */
export const inviteDetailRecipe: ScreenRecipe = {
  type: "detail",
  binding: { module: "invites" },
  gate: { module: "team_members", right: "read" },
  fields: [],
  actions: [
    {
      id: "invites.revoke",
      label: "Revoke invite",
      action: "invites.revoke",
      variant: "destructive",
      gate: { module: "team_members", right: "delete" },
    },
  ],
  header: { title: "email" },
  tabs: [
    {
      key: "overview",
      label: "Overview",
      icon: CONCEPT_ICON.overview,
      block: {
        kind: "description",
        columns: 1,
        rows: [
          { label: "Role", column: "role" },
          { label: "Status", column: "status" },
          { label: "Invited by", column: "invitedBy" },
          { label: "Invited", column: "invited" },
          { label: "Expires", column: "expires" },
          { label: "Accepted", column: "accepted" },
        ],
      },
    },
    {
      key: "activity",
      label: "Activity",
      icon: CONCEPT_ICON.activity,
      block: { kind: "activity", source: "activity" },
    },
  ],
}

/* -------------------------------- learning ------------------------------- */

/** Learning list — clean rows (title + a category / description summary line).
 * Tapping a row opens the article (its body + the done toggle + edit/deactivate
 * live there). "New article" is host-rendered above, gated by learning:create. */
export const learningListRecipe: ScreenRecipe = {
  type: "list",
  display: "list",
  surface: "none",
  binding: { module: "learning" },
  gate: { module: "learning", right: "read" },
  fields: [field("name", "Article"), field("detail", "Details")],
  actions: [
    {
      id: "learning.create",
      label: "New article",
      action: "learning.create",
      gate: { module: "learning", right: "create" },
    },
  ],
  emptyAction: "learning.create",
  collection: listCollection("Your team's how-to articles appear here, ready for anyone to read.", "Search learning…", [
    { field: "category", label: "Category", control: "select" },
    { field: "state", label: "Status", control: "select" },
  ]),
}

/* ---------------------------------- help --------------------------------- */

/** Help list — clean rows (a truncated description + a type · status line). The
 * My/All scope is a host-owned toggle (the server filters by raiser); tapping a
 * row opens the ticket thread. "Raise ticket" is host-rendered above, gated by
 * help:create. */
export const helpListRecipe: ScreenRecipe = {
  type: "list",
  display: "list",
  surface: "none",
  binding: { module: "help" },
  gate: { module: "help", right: "read" },
  fields: [field("name", "Ticket"), field("detail", "Details")],
  actions: [
    {
      id: "help.create",
      label: "Raise ticket",
      action: "help.create",
      gate: { module: "help", right: "create" },
    },
  ],
  emptyAction: "help.create",
  collection: listCollection(
    "Questions and requests your team raises appear here, each with its status.",
    "Search tickets…",
    [{ field: "status", label: "Status", control: "select" }],
    { paged: true }
  ),
}

/* ------------------------------ the registry ------------------------------ */

/** The in-code BASE recipe for each screen key — the shipped default every team
 * inherits. A team can OVERRIDE one via the config store (per-team `screens`
 * table); the resolver merges override-over-base. Keys are `<module>.<view>`.
 * Roles DETAIL has no recipe — its permission grid has no engine block, so the
 * host composes it from the library PermissionMatrix (see role-detail.tsx). */
export const BASE_RECIPES: Record<string, ScreenRecipe> = {
  "team.detail": teamDetailRecipe,
  "members.list": membersListRecipe,
  "members.detail": memberDetailRecipe,
  "roles.list": rolesListRecipe,
  "invites.list": invitesListRecipe,
  "invites.detail": inviteDetailRecipe,
  "learning.list": learningListRecipe,
  "help.list": helpListRecipe,
}

/** A structural guard for a parsed override. The config store treats a recipe as
 * OPAQUE JSON (it only checks it parses + is bounded), so the WEB app owns the
 * shape check. Without this, valid-but-malformed JSON (e.g. `{}`, `42`, a recipe
 * missing its `actions`/`fields` arrays) would reach the engine and throw when it
 * reads `recipe.actions`/`recipe.fields` — blanking the screen team-wide. */
export function isScreenRecipe(value: unknown): value is ScreenRecipe {
  if (typeof value !== "object" || value === null) return false
  const r = value as Record<string, unknown>
  return (
    typeof r.type === "string" &&
    Array.isArray(r.fields) &&
    Array.isArray(r.actions) &&
    typeof r.binding === "object" &&
    r.binding !== null
  )
}

/** Resolve the recipe for a screen key: a team's JSON override (if present AND a
 * structurally-valid recipe) wins over the in-code base. Defensive — a missing,
 * unparseable, OR shape-incomplete override falls back to the base, so a bad
 * override can never break the screen. */
/** The recipe for a screen.
 *
 * It used to take a per-team OVERRIDE map and merge it over the base. That
 * subsystem — a table, a migration, a gate, a validator, a permission row, a
 * renderer and this merge — had no way to be written to on any surface, so every
 * team's override map was permanently empty and this function's second argument
 * was always undefined. The owner decided on 2026-08-25 not to build the missing
 * caller, so the whole subsystem went rather than gaining one.
 *
 * What that bought, beyond the deleted code: one fewer network request on every
 * screen in the team area, and four permission switches an admin could see and
 * set that governed nothing. */
export function resolveRecipe(key: string): ScreenRecipe | null {
  return BASE_RECIPES[key] ?? null
}

/** Tune a list recipe's collection chrome to the DATA it's about to show, so we
 * never render dead UI: no rows → hide search + filters entirely (the empty
 * state stands alone); rows present → keep search, and keep a facet only when at
 * least one of its rows carries a value (an all-empty facet is a useless
 * dropdown). A fresh copy — the base recipe is never mutated. */
export function withDataDrivenCollection(
  recipe: ScreenRecipe,
  rows: Record<string, unknown>[]
): ScreenRecipe {
  const collection = recipe.collection
  if (!collection) return recipe
  if (rows.length === 0) {
    return { ...recipe, collection: { ...collection, searchable: false, userFilter: false } }
  }
  const facets = collection.filterFacets.filter((f) =>
    rows.some((row) => {
      const v = row[f.field]
      return v != null && String(v).trim() !== ""
    })
  )
  return {
    ...recipe,
    collection: { ...collection, searchable: true, userFilter: facets.length > 0, filterFacets: facets },
  }
}

/** Drop the named actions from a recipe (a fresh copy — the base is never
 * mutated). The host uses this to hide an action for a specific record, e.g. you
 * can't change your own role or remove yourself from the member detail. */
export function withoutActions(recipe: ScreenRecipe, ids: string[]): ScreenRecipe {
  // Defensive: an override could omit `actions` (resolveRecipe now guards this,
  // but don't blindly trust the shape here either).
  const actions = Array.isArray(recipe.actions) ? recipe.actions : []
  if (actions.length === 0) return recipe
  const drop = new Set(ids)
  return { ...recipe, actions: actions.filter((a: RecipeAction) => !drop.has(a.id)) }
}
