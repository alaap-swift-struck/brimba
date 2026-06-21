# Error handling & logging — the ruleset (LOCKED 2026-06-17)

How Brimba (and every app on this base) handles failures: **never swallow an
error silently**; capture it *with context* and send it somewhere queryable, so
a crash is visible without the user having to report it.

## The one seam

There is ONE swappable reporter. Today it logs to Cloudflare's **Workers
observability** (already enabled on every worker); to send errors to
Sentry/Datadog later, change ONLY the seam's body — call sites never move (same
trick as the swappable AI-import interface).

- **Client — `web/lib/log.ts`** → `reportError(where, error, extra?)`:
  - logs to the console (for the developer), and
  - beacons a compact `{where, message, stack, url, at}` to `POST /api/log/client`.
- **Client global handlers** — `installGlobalErrorReporting()` (mounted once by
  `<ErrorReporter/>` in the root layout) listens for `window.onerror` +
  `unhandledrejection`. These catch the **async** throws a React error boundary
  can't see — the ones that otherwise show the blank "a client-side exception
  has occurred" overlay.
- **Client render errors — `<ErrorBoundary>`** wraps risky subtrees (the team
  panels — UPDATED 2026-06-21: the team area is now the screen-engine-rendered
  `/t/<teamId>/<module>/<id>` subtree). On a render throw it shows the **real
  message inline** (no white screen) and calls `reportError` with the component
  stack.
- **Gateway — `/api/log/client`** logs the beacon (`console.error`, capped) so
  it lands in observability. No data store.
- **Workers** `console.error` in their `catch` blocks → observability. The
  tenancy worker maps `GuardError` to clean 4xx; unexpected errors become a
  generic 500 (never leak internals to the user).

## How planet-scale apps do it (what we're set up to grow into)
- **Capture everything with context** (request id, user, route, release/version).
- **Sample** at high volume — you don't store 100% of billions of events.
- **Alert** on spikes/new error types; **source maps** so a minified stack maps
  to real code.
- Our seam means adopting a service later is a one-file change, not a refactor.

## Rules for new code
1. Every `catch` either handles the error meaningfully or calls the reporter —
   never an empty `catch {}` that hides a failure (logging-only `catch` for
   best-effort side-effects like activity writes is fine, and is commented as such).
2. **Member-notification emails (new 2026-06-21)** are best-effort, same pattern
   as activity writes. When a role changes, a member is removed, or a pending
   invite is revoked, the **state change is the authority and commits FIRST**;
   the notification email is fired after and is logging-only on failure (bounce,
   Resend 4xx/5xx, or timeout). A failed or bounced email **NEVER blocks or rolls
   back the action** — the permission change stands regardless.
3. User-facing messages stay plain and safe; the detail goes to the logs.
4. Wrap any new risky UI subtree in `<ErrorBoundary>`.

See [CACHING.md](CACHING.md) for the loading/feedback side (what the user sees
*while* things are working) and [CONCURRENCY.md](CONCURRENCY.md) for write safety.
