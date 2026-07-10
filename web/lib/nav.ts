"use client"

// The ONE soft-navigation bus. The whole post-auth app is a single client-resolved
// shell (deep-link-screen.tsx mounts once and never unmounts), so EVERY in-app move must
// go through its History-API `go()` — a framework `router.push` into a deep /t path is a
// hard reload in the static export (EDGE-CASES §1) that tears the shell (and a running
// agent) down. Deep components (the profile menu, team switcher, invite inbox) can't
// easily reach the host's `go()`, so the host registers it here and they call
// `softNavigate` — no prop-threading, no context provider. If the host isn't mounted yet
// (a pre-auth screen, or the very first paint) it falls back to a real navigation.

let hostGo: ((path: string) => void) | null = null

/** The deep-link host registers its `go()` here on mount; returns an unregister fn. */
export function registerHostGo(fn: (path: string) => void): () => void {
  hostGo = fn
  return () => {
    if (hostGo === fn) hostGo = null
  }
}

/** Navigate WITHOUT a reload when the shell is mounted (History-API `go()`); otherwise a
 * plain navigation (pre-auth, or before the host mounts). Use this everywhere instead of
 * `router.push` for in-app links. */
export function softNavigate(path: string): void {
  if (hostGo) hostGo(path)
  else if (typeof window !== "undefined") window.location.assign(path)
}
