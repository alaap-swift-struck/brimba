"use client"

// AgentView — a TEMPORARY screen the co-pilot can conjure: an in-memory recipe +
// ScreenData rendered by the library ScreenRenderer directly, WITHOUT saving it to
// BASE_RECIPES or the team's `screens` override table. It's a throwaway view (e.g.
// "show me everyone who joined this month") the agent builds on the fly; closing
// it discards it. The recipe is validated with the same structural guard the
// override store uses (isScreenRecipe) so a malformed agent recipe degrades to a
// clear message instead of throwing inside the engine.
//
// The agent producing recipes is a later step. For now this component exists +
// compiles + is ready: a code path can render whatever recipe the agent returns,
// and until it does, the panel simply never mounts an AgentView.

import * as React from "react"

import {
  ScreenRenderer,
  type ScreenData,
  type ScreenActionContext,
  type ScreenIntent,
} from "@swift-struck/ui/registry/collections/screen-renderer/screen-renderer"
import type { ScreenRecipe, ScreenRights } from "@swift-struck/ui/lib/recipe"

import { isScreenRecipe } from "@/lib/screens"

export function AgentView({
  recipe,
  data,
  rights,
  onAction,
  onIntent,
}: {
  /** An in-memory recipe the agent produced — validated before it reaches the
   * engine. Typed `unknown` because it comes from the model, not our code. */
  recipe: unknown
  data: ScreenData
  rights: ScreenRights
  onAction?: (actionId: string, ctx: ScreenActionContext) => void
  onIntent?: (intent: ScreenIntent) => void
}) {
  if (!isScreenRecipe(recipe)) {
    return (
      <p className="text-muted-foreground text-sm">
        The assistant tried to build a view, but it wasn&apos;t in a shape we can show.
      </p>
    )
  }
  return (
    <ScreenRenderer
      recipe={recipe as ScreenRecipe}
      data={data}
      rights={rights}
      onAction={onAction ?? (() => {})}
      onIntent={onIntent}
    />
  )
}
