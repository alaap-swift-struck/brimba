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
- **Gateway — `/api/log/client`** logs the beacon (`console.error`, capped) AND —
  when the browser carries a session cookie (an anonymous drive-by can't fill the
  table) — forwards it to auth's `/internal/log-error` (INTERNAL_KEY-guarded), so
  the error also lands in the central store below.
- **Workers** `console.error` in their `catch` blocks → observability, AND every
  core-bound worker's central catch calls `recordWorkerError(env.DB, …)`
  (`shared/workers/error-log.ts`) so the crash lands in the store below —
  machine-checked by `workers/data-ops/test/error-seam.test.ts`, so a worker
  can't quietly stop recording. `GuardError`s map to clean 4xx and are NEVER
  logged (an expected refusal is not an error); unexpected errors become a
  generic 500 (never leak internals to the user).

## The central error store (BUILT 2026-07-03 — core migration `0012_error_logs`)

Beyond the console lines (which Cloudflare keeps only ~a week), every unexpected
failure is RECORDED in **`error_logs`** in the global core DB — one table per
environment (staging and production errors never mix), cross-team by design
(system health is global; `team_id`/`user_id` are optional context).

- **Captured per row:** `id`, `at`, `source` (auth / tenancy / content /
  data-ops / web), `place` (the route `POST /api/…`, or the client's `where`),
  `message`, `stack` (capped), `team_id` / `user_id` / `url` when known, and the
  resolve-workflow fields: `status` (`open` → `resolved`), `resolved_at`,
  `resolution_note`.
- **NOT captured:** clean `GuardError` refusals (4xx — working as designed).
  Recording is best-effort by contract — a logging hiccup never changes a
  response.
- **View (owner-only, x-admin-key — the maintenance key):**
  `GET /api/data-ops/admin/errors?status=open|resolved|all&limit=N` — newest
  first. In practice: ask Claude to read it, or curl it.
- **Resolve (the what-went-wrong / how-fixed trail):**
  `POST /api/data-ops/admin/errors/resolve { id, note }` — flips the row to
  `resolved`, stamps `resolved_at`, stores your note. Re-resolving overwrites
  the note (idempotent). An unknown id returns `updated: 0`.
- **Why owner-gated, not a team screen:** stack traces are maintainer material,
  not tenant data. An in-app owner console is a later milestone — it needs a
  "platform owner" identity concept the base deliberately doesn't have yet.
- **User-reported bugs stay in Help** (tickets); this store is the system's own
  telemetry. The two meet when you resolve an error and answer the ticket.

## Analysing the store — the `error_analyst` skill

The store is the data; **`error_analyst`** (a global skill) is how you read it at
scale. It's platform-aware (it finds where errors live — this table on Brimba,
Supabase/CloudWatch/etc. on another app), **clusters rows by root cause** (ten rows
with one signature = one bug seen ten times), flags **first-of-its-kind vs
recurring** (and, for a recurrence after a fix, digs up the prior `resolution_note`
to escalate a patch into a structural fix), shows trends per module, and — for the
fixes it's confident about — applies them, runs `npm run check`, ships to **staging**,
and resolves the errors with a note. Production stays owner-gated. Run it when you
want to understand + fix what's breaking, not patch one row. It is the operational
sibling of the pre-ship trio (`lean_mean_check` · `story_checks_out` ·
`security_sentry`).

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
