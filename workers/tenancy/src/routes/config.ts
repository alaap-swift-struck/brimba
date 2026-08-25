// Config routes — the screen-engine recipe store. Serve a team's per-screen
// overrides (any member: they drive what the member sees; each screen's DATA is
// still permission-checked at its own endpoint), and set one (team-admin, also
// agent-callable so an agent can author/reshape a screen at runtime).

import { fail, json } from "../../../../shared/workers/http"
import { publishChange } from "../../../../shared/workers/realtime"
import { getScreenOverrides, setScreenOverride } from "../lib/screens-config"
import { gatedBody } from "../../../../shared/workers/route"
import { teamContext } from "../context"
import type { Env } from "../env"

export async function getScreens(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  return json({ screens: await getScreenOverrides(cfg, guard) })
}

export async function postScreen(request: Request, env: Env): Promise<Response> {
  // GATED ON `screens`, not `teams`. It gated on `teams:edit` — the right that
  // renames a team and changes its logo — so granting someone "edit the team"
  // silently also granted "rewrite every screen, for everyone in it". The
  // `screens` module has its own row in the permission matrix and four switches
  // an admin can already see and set; they simply governed nothing.
  // (Security sentry + dead-end reviews, 2026-08-25.)
  const { actor, cfg, guard, body } = await gatedBody<{ module?: string; recipe?: unknown }>(
    request, env, "screens", "edit"
  )
  if (!body.module || typeof body.recipe === "undefined")
    return fail(400, "invalid_input", "module and recipe are required.")
  const recipeJson =
    typeof body.recipe === "string" ? body.recipe : JSON.stringify(body.recipe)
  await setScreenOverride(cfg, guard, actor, body.module, recipeJson)
  await publishChange(env.REALTIME, guard.teamId, "screens", body.module)
  return json({ screens: await getScreenOverrides(cfg, guard) })
}
