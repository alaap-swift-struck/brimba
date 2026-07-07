// The shared route-handler OPENING — the fixed steps every team-scoped handler
// repeats (CONVENTIONS §2): teamContext (who + which team) → requireRight (may
// they?) → a defensive JSON body read. Collapsed to one awaited call so ~50
// handlers don't restate the same three lines. Deliberately NOT a
// wrap-the-whole-handler decorator: handlers stay plain `export async function`s
// (the publish-seam tests read each handler's source by name straight off disk)
// and a handler that gates unusually — two rights, a body-derived module, an
// admin-key check, no gate at all — simply doesn't use these and writes the
// steps out.
//
// The `as B` body cast stays a SHAPE HINT, not a promise the fields are valid —
// each handler still validates at the boundary (requireText / optionalText).

import { requireRight, teamContext, type GatingEnv, type Right, type TeamCtx } from "./gating"

/** The uniform gated opening for reads (and body-less routes):
 * teamContext → requireRight. */
export async function gated(
  request: Request,
  env: GatingEnv,
  module: string,
  right: Right
): Promise<TeamCtx> {
  const ctx = await teamContext(request, env)
  await requireRight(ctx.cfg, ctx.guard, module, right)
  return ctx
}

/** The uniform gated mutation opening: teamContext → requireRight → defensive
 * body read (a malformed body becomes {}, never a throw). */
export async function gatedBody<B = unknown>(
  request: Request,
  env: GatingEnv,
  module: string,
  right: Right
): Promise<TeamCtx & { body: B }> {
  const ctx = await gated(request, env, module, right)
  const body = (await request.json().catch(() => ({}))) as B
  return { ...ctx, body }
}

/** teamContext + the defensive body read WITHOUT a gate — for handlers whose
 * right depends on the body (e.g. import routes gate `create` on the TARGET
 * module named in the payload). The caller still gates; this just opens. */
export async function openTeam<B = unknown>(
  request: Request,
  env: GatingEnv
): Promise<TeamCtx & { body: B }> {
  const ctx = await teamContext(request, env)
  const body = (await request.json().catch(() => ({}))) as B
  return { ...ctx, body }
}
