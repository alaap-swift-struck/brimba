// Base screen recipes — whole screens described as DATA, rendered by the library
// engine (@swift-struck/ui ScreenRenderer). The host (deep-link-screen.tsx)
// shapes app types into the flat rows/records these recipes reference, supplies
// the per-module rights, dispatches the named actions, and owns the router. A
// team can OVERRIDE any recipe at runtime via the config store (M2); the
// resolver merges override-over-base. Keyed by `<module>.<view>`, where the
// module is the friendly URL segment used in the deep-link grammar
// (/t/<teamId>/<module>/<id>).

import type { RecipeAction, RecipeField, ScreenRecipe } from "@swift-struck/ui/lib/recipe"
import {
  defaultCollectionConfig,
  defaultFieldConfig,
  type CollectionConfig,
} from "@swift-struck/ui/lib/config"

import { CONCEPT_ICON } from "@/lib/pages"

/** A plain text column/field for a recipe (label only — the host supplies the
 * already-formatted value in the row/record). */
function field(column: string, label: string): RecipeField {
  return { column, type: "text", field: { ...defaultFieldConfig, label } }
}

/** A list collection config (search off until the library search/filters land —
 * UI-GAPS #7; it's a recipe edit, not new plumbing, to turn on later). */
function listCollection(emptyText: string): CollectionConfig {
  return { ...defaultCollectionConfig, searchable: false, emptyText }
}

/** The permission module a friendly URL segment maps to. URLs stay readable
 * (members / roles / invites / team) while rights + gates use the real module
 * key the server enforces. */
export const MODULE_PERMISSION: Record<string, string> = {
  team: "teams",
  members: "team_members",
  roles: "member_roles",
  invites: "team_members",
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
  binding: { module: "members" },
  gate: { module: "team_members", right: "read" },
  fields: [field("name", "Member"), field("detail", "Details")],
  actions: [],
  collection: listCollection("No members yet."),
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
  binding: { module: "roles" },
  gate: { module: "member_roles", right: "read" },
  fields: [field("name", "Role"), field("detail", "Details")],
  actions: [],
  collection: listCollection("No roles yet."),
}

/* -------------------------------- invites -------------------------------- */

/** Invites list — clean rows (email + a role · status line). Tapping an invite
 * opens its detail, where Revoke lives (pending only). */
export const invitesListRecipe: ScreenRecipe = {
  type: "list",
  display: "list",
  binding: { module: "invites" },
  gate: { module: "team_members", right: "read" },
  fields: [field("email", "Email"), field("detail", "Details")],
  actions: [],
  collection: listCollection("No invites yet."),
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
  binding: { module: "learning" },
  gate: { module: "learning", right: "read" },
  fields: [field("name", "Article"), field("detail", "Details")],
  actions: [],
  collection: listCollection("No learning yet."),
}

/* ---------------------------------- help --------------------------------- */

/** Help list — clean rows (a truncated description + a type · status line). The
 * My/All scope is a host-owned toggle (the server filters by raiser); tapping a
 * row opens the ticket thread. "Raise ticket" is host-rendered above, gated by
 * help:create. */
export const helpListRecipe: ScreenRecipe = {
  type: "list",
  display: "list",
  binding: { module: "help" },
  gate: { module: "help", right: "read" },
  fields: [field("name", "Ticket"), field("detail", "Details")],
  actions: [],
  collection: listCollection("No tickets yet."),
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
export function resolveRecipe(
  key: string,
  overrides: Record<string, string> | undefined
): ScreenRecipe | null {
  const base = BASE_RECIPES[key] ?? null
  const raw = overrides?.[key]
  if (!raw) return base
  try {
    const parsed: unknown = JSON.parse(raw)
    return isScreenRecipe(parsed) ? parsed : base
  } catch {
    return base
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
