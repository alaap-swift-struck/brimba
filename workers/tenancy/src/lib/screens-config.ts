// Screen-engine config store. The BASE recipes ship in app code (one definition
// every team inherits); this stores a team's per-screen OVERRIDES — the
// runtime-editable layer that lets an admin/agent reshape a screen with no
// deploy. The worker treats a recipe as OPAQUE JSON (the web app owns the
// ScreenRecipe shape + validates it); we only check it's valid, bounded JSON.

import { logActivity, type Actor } from "../../../../shared/workers/activity"
import { d1ExecScript, d1Query, sqlString, type D1Rest } from "../../../../shared/workers/d1-rest"
import { GuardError, type MemberGuard } from "./permissions"

const MAX_RECIPE_BYTES = 64 * 1024

/** Every screen override this team has set: { module: recipeJSON }. The web app
 * merges these over the in-code base recipes (override wins per screen). */
export async function getScreenOverrides(
  cfg: D1Rest,
  guard: MemberGuard
): Promise<Record<string, string>> {
  const rows = await d1Query<{ module: string; recipe: string }>(
    cfg,
    guard.databaseId,
    "SELECT module, recipe FROM screens"
  )
  const out: Record<string, string> = {}
  for (const r of rows) out[r.module] = r.recipe
  return out
}

/** Upsert this team's override for one screen (agent/admin-callable). `recipe`
 * is a JSON string the web app already validated; stored opaque + bounded. */
export async function setScreenOverride(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  module: string,
  recipe: string
): Promise<void> {
  const key = module.trim()
  if (!key) throw new GuardError(400, "invalid_input", "A screen module is required.")
  try {
    JSON.parse(recipe)
  } catch {
    throw new GuardError(400, "invalid_recipe", "That screen recipe isn't valid JSON.")
  }
  if (recipe.length > MAX_RECIPE_BYTES)
    throw new GuardError(400, "recipe_too_large", "That screen recipe is too large.")

  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO screens (module, recipe, created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(key)}, ${sqlString(recipe)}, ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)})
ON CONFLICT(module) DO UPDATE SET
  recipe = excluded.recipe, updated_at = ${sqlString(now)},
  editor_id = ${sqlString(actor.id)}, editor_email = ${sqlString(actor.email)}, editor_name = ${sqlString(actor.name)};`
  )
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Screen configured",
    description: `${actor.name} customized the ${key} screen`,
    relatedTable: "screens",
    relatedRowId: key,
  })
}
