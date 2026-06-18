// Base screen recipes — screens described as DATA, rendered by the library
// engine (@swift-struck/ui ScreenRenderer). In-code for now; a config worker
// will store + serve these per-team for live editing in a later phase. Keyed by
// the URL module segment used in the deep-link grammar (/t/<teamId>/<module>/…).

import type { ScreenRecipe } from "@swift-struck/ui/lib/recipe"

/** Member detail (Overview + Activity) — the first screen migrated onto the
 * engine + the deep-link URL. The host (deep-link-screen.tsx) shapes a
 * TeamMember into the flat record these columns reference and supplies the
 * `activity` set. Gated by team_members:read (server re-checks too). */
export const memberDetailRecipe: ScreenRecipe = {
  type: "detail",
  binding: { module: "members" },
  gate: { module: "team_members", right: "read" },
  fields: [],
  actions: [],
  header: { title: "name", subtitle: "email", avatar: "image" },
  tabs: [
    {
      key: "overview",
      label: "Overview",
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
    { key: "activity", label: "Activity", block: { kind: "activity", source: "activity" } },
  ],
}

/** The permission module a URL segment maps to (URLs stay friendly; rights use
 * the real module key). */
export const MODULE_PERMISSION: Record<string, string> = {
  members: "team_members",
}
