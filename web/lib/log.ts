"use client"

// The ONE client error-reporting seam. Today it logs to the console and beacons
// a compact report to the gateway (→ Cloudflare observability). To send errors
// to Sentry/Datadog later, change ONLY the body of `send` — call sites never
// move. This mirrors our swappable-AI-interface pattern. See ERROR-HANDLING.md.

type ErrorContext = {
  where: string
  message: string
  stack?: string
  extra?: Record<string, unknown>
}

function send(ctx: ErrorContext) {
  try {
    const body = JSON.stringify({
      ...ctx,
      url: typeof location !== "undefined" ? location.href : "",
      at: new Date().toISOString(),
    })
    if (typeof navigator !== "undefined" && navigator.sendBeacon)
      navigator.sendBeacon("/api/log/client", body)
    else void fetch("/api/log/client", { method: "POST", body, keepalive: true })
  } catch {
    /* logging must never throw and never break the app */
  }
}

/** A transient CONNECTIVITY failure, not a code bug: a fetch rejected because the
 * network dropped, went offline, or the request was aborted (a navigation cancels
 * in-flight requests). These flood the store with noise — the browser's generic
 * "Failed to fetch" / "Load failed" / an AbortError — so they're logged to the
 * console but NOT beaconed to the central store. A real bug has a real message. */
function isBenignNetworkError(e: Error): boolean {
  const m = e.message || ""
  return (
    e.name === "AbortError" ||
    /^(failed to fetch|load failed|networkerror when attempting to fetch resource\.?)$/i.test(m.trim())
  )
}

/** Report a handled error with context. Logs to the console (for the dev) and
 * beacons it to the central store — EXCEPT transient network blips (see above),
 * which stay console-only so the store keeps only real, actionable failures. */
export function reportError(where: string, error: unknown, extra?: Record<string, unknown>) {
  const e = error instanceof Error ? error : new Error(String(error))
  console.error(`[${where}]`, e, extra ?? "")
  if (isBenignNetworkError(e)) return
  send({ where, message: e.message, stack: e.stack, extra })
}

let installed = false
/** Catch errors that escape React's render tree — async callbacks and promise
 * rejections an ErrorBoundary can't see (e.g. a WebSocket handler). Call once at
 * the app root; idempotent. This is what captures the generic "client-side
 * exception" crashes with their real message + stack. */
export function installGlobalErrorReporting() {
  if (installed || typeof window === "undefined") return
  installed = true
  window.addEventListener("error", (ev) =>
    reportError("window.onerror", ev.error ?? ev.message)
  )
  window.addEventListener("unhandledrejection", (ev) =>
    reportError("unhandledrejection", ev.reason)
  )
}
