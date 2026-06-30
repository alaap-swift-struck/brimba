"use client"

// Keeps a long-lived tab honest across a deploy. Brimba is a static-export SPA
// with NO service worker, so an open tab holds the OLD shell + its hashed chunks
// indefinitely. Two failure modes follow a deploy, and this heals both:
//
//  1. A chunk the old shell asks for is gone (route the user hadn't visited yet,
//     or a lazy import). The dynamic import throws a ChunkLoadError. We catch it
//     and reload ONCE — the fresh shell names the new chunks. A sessionStorage
//     flag stops a reload loop if the reload itself can't recover.
//  2. Nothing is broken yet, but a newer build exists. On focus/return we ask
//     the origin for the current shell and compare its build fingerprint to the
//     one we booted with; if it moved, we offer a gentle "reload" toast rather
//     than yanking the page out from under the user mid-task.
//
// The fingerprint is the hashed `main-app` chunk src (App-Router static export
// has no __NEXT_DATA__ / buildId in the HTML). Renders nothing.

import * as React from "react"

import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"

// Reload-loop guard: set just before the chunk-error reload, cleared once a
// fresh load runs this module again. If it's still set, the reload didn't fix
// it — stop reloading and let the error surface normally.
const RELOAD_GUARD = "version_watch_reloaded"
// Don't poke the origin more than once a minute, however often focus fires.
const POLL_THROTTLE_MS = 60_000

// The build fingerprint = the hash on this build's `main-app` chunk. Pull it
// from a blob of HTML (our own document on mount, or the fetched shell on poll).
function buildIdFrom(html: string): string | null {
  const m = html.match(/\/_next\/static\/chunks\/main-app-[A-Za-z0-9]+\.js/)
  return m ? m[0] : null
}

// A failed dynamic import / missing chunk — the signature of a stale shell
// reaching for a deploy that's gone. Matches the modern bundler error shapes.
function isChunkError(err: unknown, message?: string): boolean {
  const name = err instanceof Error ? err.name : ""
  const msg = (err instanceof Error ? err.message : message) ?? ""
  return (
    name === "ChunkLoadError" ||
    /Loading chunk|dynamically imported module|importing a module script failed/i.test(
      msg
    )
  )
}

export function VersionWatch() {
  React.useEffect(() => {
    // A fresh load got here — the previous reload (if any) succeeded.
    sessionStorage.removeItem(RELOAD_GUARD)

    // (a) Heal a stale shell that hits a missing chunk: reload once.
    const onChunkError = (err: unknown, message?: string) => {
      if (!isChunkError(err, message)) return
      if (sessionStorage.getItem(RELOAD_GUARD)) return // already tried — don't loop
      sessionStorage.setItem(RELOAD_GUARD, "1")
      location.reload()
    }
    const onError = (ev: ErrorEvent) => onChunkError(ev.error, ev.message)
    const onRejection = (ev: PromiseRejectionEvent) => onChunkError(ev.reason)

    // (b) Notice a newer build on return-to-tab and offer a reload.
    const bootId = buildIdFrom(document.documentElement.outerHTML)
    let lastPoll = 0
    let notified = false

    const checkForUpdate = async () => {
      if (notified || document.visibilityState !== "visible") return
      const now = Date.now()
      if (now - lastPoll < POLL_THROTTLE_MS) return
      lastPoll = now
      try {
        const res = await fetch("/", { cache: "no-store" })
        if (!res.ok) return
        const liveId = buildIdFrom(await res.text())
        // Only act when we can compare two real ids and they differ.
        if (bootId && liveId && liveId !== bootId) {
          notified = true
          toast("A new version is available.", {
            duration: Infinity,
            action: { label: "Reload", onClick: () => location.reload() },
          })
        }
      } catch {
        // Offline / transient — the next focus will try again.
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === "visible") void checkForUpdate()
    }

    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onRejection)
    window.addEventListener("focus", checkForUpdate)
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      window.removeEventListener("error", onError)
      window.removeEventListener("unhandledrejection", onRejection)
      window.removeEventListener("focus", checkForUpdate)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [])

  return null
}
