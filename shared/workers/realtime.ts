// Publish a "something changed" ping to a team's live channel — the ONE call any
// worker makes after a successful write so every open screen on that team
// refreshes itself. Best-effort: a live-layer hiccup must never break the write
// it describes (callers don't await-throw). Reusable by every Brimba-based app.
//
// The realtime worker (workers/realtime) receives this on its /publish route and
// fans `event` out to everyone connected to `team:<teamId>`. `resource` is a
// coarse tag (e.g. "members", "member_roles") so clients refresh only what they
// hold — the payload never carries data, so nothing can leak.

import type { Fetcher } from "@cloudflare/workers-types"

export async function publishChange(
  realtime: Fetcher,
  teamId: string,
  resource: string
): Promise<void> {
  try {
    await realtime.fetch("https://realtime/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: `team:${teamId}`, event: { resource } }),
    })
  } catch (e) {
    console.error("realtime publish failed:", e)
  }
}
