// READING A DOOR OFF DISK — the one place a check learns what a route handler
// actually DOES, rather than what a catalogue says it does.
//
// Two checks in this folder need the same walk and needed it from opposite ends:
// filter parity asks "which query params does the handler on THIS path parse?"
// (path → handler → source), and the lost-update check asks "which handlers read
// expectedVersion, and which paths do they serve?" (source → handler → path). Both
// are the worker's ROUTES table naming a handler per route, plus the handler's own
// source in routes/*.ts — so the walk lives here once and each check states its
// question in a line.
//
// WHY OFF DISK. A check that derives its expectations from the TOOLS can only ever
// examine doors that already have a tool, which makes the missing tool — the whole
// thing it was written to catch — the one case it cannot see.

import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

export const ROOT = join(__dirname, "..", "..", "..")

/** The workers whose doors both machine surfaces forward to. */
export type Worker = "tenancy" | "content"

export type Door = {
  /** Exactly as the ROUTES table keys it: "GET /api/tenancy/members". */
  route: string
  /** The path alone, as a tool's `path` carries it. */
  path: string
  handler: string
  /** The handler's own source, from its `function` keyword to the next export. */
  body: string
}

/** Every route-handler file's source for a worker (kept per file so a handler
 * stays attributable to one of them). */
function routeSources(worker: Worker): string[] {
  const dir = join(ROOT, "workers", worker, "src", "routes")
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => readFileSync(join(dir, f), "utf8"))
}

/** Every route the worker's ROUTES table declares, paired with the source of the
 * handler that serves it. A route whose handler can't be located is skipped — so
 * every caller asserts its OWN tripwire on how many doors came back, because a
 * scan that silently found nothing reports "all clear" exactly like a passing one. */
export function doors(worker: Worker): Door[] {
  const index = readFileSync(join(ROOT, "workers", worker, "src", "index.ts"), "utf8")
  const sources = routeSources(worker)
  const out: Door[] = []
  for (const m of index.matchAll(/"((?:GET|POST) [^"]+)"\s*:\s*\{\s*handler:\s*(\w+)/g)) {
    const [, route, handler] = m
    for (const src of sources) {
      const at = src.indexOf(`function ${handler}(`)
      if (at === -1) continue
      const next = src.indexOf("\nexport ", at + 1)
      out.push({
        route,
        path: route.slice(route.indexOf(" ") + 1),
        handler,
        body: src.slice(at, next === -1 ? undefined : next),
      })
      break
    }
  }
  return out
}
