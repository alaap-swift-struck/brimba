# Roadmap — members, roles & settings build-out (Phase C)

> **Where things stand (2026-07-02).** Everything below SHIPPED, and a whole
> further era shipped after it: learning + help + CSV import + the streaming AI
> agent co-pilot (branch `agent-modules`, staging). This file is the Phase-C
> HISTORY + its still-open tail (see "Remaining"); for the current system read
> README.md → BASE-MANUAL.md, and for what's next: the owner's staging verdict,
> ~~the external `mcp` worker~~ (BUILT 2026-07-07 — ARCHITECTURE.md), the two deferred perf
> wins (EDGE-CASES.md), and the `lean-mean-report.md` fix list.

Decided 2026-06-13 with the user. Built **sequentially, phase by phase**, each
shipped to staging. This file is the contract — keep the seams stable so phases
don't drift.

## Phase 0 · Performance + Live data — SHIPPED (2026-06-13)

Done first (the Foundation was shelved behind it). Diagnosed staging: every
screen refetched session+data (~1s D1-REST calls) with no caching → a spinner on
every navigation, and hashed assets were `must-revalidate`. Fixes, all
cross-cutting so every screen + future phase inherits them:
- **Immutable asset caching** — gateway marks `/_next/static/**`
  `max-age=1yr, immutable`.
- **Cache-first data layer** (`web/lib/store.ts` + module-cached session in
  `use-active-team.ts`) — screens paint instantly, revalidate in the background.
- **Live layer** — new `realtime` worker (`TeamChannel` Durable Object,
  hibernatable), `web/lib/realtime.ts` client hook wired in `AppShell`. See
  ARCHITECTURE.md (workers table, LOCKED 2026-06-13).
  **UPDATED 2026-06-22 — now ROW-LEVEL + two channels:** pings carry
  `{resource, id, op}`; the client re-pulls just the changed row and patches it
  in place (never invalidate-the-whole-collection). Two channel scopes —
  `team:<id>` and the per-user `user:<id>` (identity/membership events + forced
  sign-out) — published via `publishChange` / `publishUserChange` /
  `publishSignOut`. "Every mutation publishes" is now a guard-tested invariant.
  See CACHING.md rules 3–8 + the ARCHITECTURE realtime row.
- **Skeletons** replace spinners. The "Roles & permissions" screen is renamed
  **Member roles**.

Then the Foundation phase (below) resumes.

## Decisions (locked this round)

- **Navigation:** left **sidebar** on desktop, **bottom tab bar** on mobile.
  Top-level pages for now: **Home** and **Settings**.
- **Settings** holds two areas: **Account** (your own profile) and **Teams** (a
  list). Opening a team shows a **detail screen** with a header (team name ·
  member count · image · an access-gated *Edit team* button) and **tabs:
  Members · Member roles · Invites**.
  - **SUPERSEDED 2026-06-21 →** the team area (Overview · Members · Member roles ·
    Invites) no longer lives at `/settings` + `/settings/team`; it moved onto the
    screen ENGINE deep links `/t/<teamId>/<module>/<id>`. The `/settings/team/*`
    routes were retired (deleted). Navigation between team sections + records is the
    section switcher + URL-derived collapsing breadcrumbs, not Settings tabs. See
    SCREEN-ENGINE-PLAN §10 + CACHING.md "Navigation never reloads (single-shell SPA)".
- The current top-level `/members` and `/roles` screens **move into** Settings →
  Teams → [team] tabs — they're no longer top-level.
  - **SUPERSEDED 2026-06-21 →** top-level `/members` and `/roles` are now thin
    redirects to `/t/<teamId>/members` and `/t/<teamId>/roles` (the engine), not
    Settings tabs. See SCREEN-ENGINE-PLAN §10.
- Rename **"Roles & permissions" → "Member roles"** everywhere (label, route
  `/member-roles` where still routed, nav, screen titles). The module key stays
  `member_roles` (no data change).
- **Profile:** edited in Settings → Account; the avatar menu links into it.
- **Pages are a registry** (`web/lib/pages.ts`): each page declares
  `{ slug, path, title, module?, right?, visibility? }`. One source that drives
  the nav, breadcrumbs, AND the permission guard.
- **Page visibility / guard:** if you lack a page's required read-right for the
  active team, you're redirected to **Home** — including when you deep-link to it.
  The client guard reads your rights from `GET /api/tenancy/my-permissions`;
  every API endpoint still enforces server-side too (defence in depth).
  - **UPDATED 2026-06-21:** the guard still applies, but inside the single `/t`
    shell it is enacted via History-API URL state (`pushState`/`replaceState`),
    NOT a framework-router push — so a blocked deep link swaps shell state without
    a full-page reload (canon: CACHING.md "Navigation never reloads"). The router
    is only used for ENTERING/LEAVING the shell (Home, Settings). Deep-linking to a
    team you are NOT a member of: the server refuses the switch, the active team
    does not change (no partial switch), and you see a no-access screen;
    logged-out → login.
- **Branded email:** ONE template reads `shared/brand.ts` (name, motto, logo,
  accent + secondary) → rich HTML + plain-text fallback. Used by the login code,
  invites, and email-change. Re-skins automatically with the brand, across apps.
  - **UPDATED 2026-06-21:** the same `brandedEmail` template also sends the new
    **member-notification emails** — role changed, removed from a team, pending
    invite revoked (sent via auth `/internal/send-email`). These are best-effort
    notifications, distinct from the activity-log writer: the state change commits
    first and is the authority; a failed/bounced email is logging-only and never
    rolls it back.
- **Invites:** create / list / revoke; states **pending · accepted · revoked
  ("redacted") · expired**; per-row shelf life (`shelf_life_in_hours`, default 168h
  ≈ 7 days — see DATA-MODEL); branded email; accepting auto-joins (reuses the
  existing bootstrap invite-accept path). **UPDATED 2026-06-21:** revoking a pending
  invite emails the invitee (member-notification, best-effort).
- **Email change:** enter a new email → 6-digit code to the **new** email →
  verify → update `users.email` + write an `email_change_logs` row.

## Contracts (the seams — stable so features plug in)

**Types** (`shared/types.ts`):
- `MyPermissions = Record<moduleKey, { read; create; edit; delete }>` — the
  caller's effective rights for the active team.
- `PageDef = { slug; path; title; module?; right?; visibility? }`.
- `Invite = { id; email; roleId; roleTitle; status; createdAt; expiresAt; invitedByName }`.

**Endpoints:**
- `GET  /api/tenancy/my-permissions`     — caller's effective rights (active team)
- `POST /api/tenancy/invites`            — create an invite (needs `team_members:create`)
- `GET  /api/tenancy/invites`            — list invites incl. revoked/expired (`team_members:read`)
- `POST /api/tenancy/invites/revoke`     — revoke ("redact") an invite (`team_members:delete`)
- `POST /api/tenancy/teams/update`       — edit team name/logo (`teams:edit`)
- `POST /api/auth/email/change/start`    — send a 6-digit code to the NEW email
- `POST /api/auth/email/change/verify`   — verify + switch email + log

**Web seams:** `web/lib/pages.ts` (registry) · `web/components/app-shell.tsx`
(sidebar + bottom tabs) · a `<PageGuard>` wrapper used by guarded screens.

**Product rules locked 2026-06-21 (apply to Members / Member roles / Invites):**
- **Count badges:** when a section/tab leads with a collection (Members, Invites,
  …) it shows a count = what the collection displays, compacted via
  `abbreviateCount` (6 / 189 / 1.18M), HIDDEN when 0.
- **CONCEPT_ICON vocabulary:** one distinct lucide icon per concept, centralised in
  `web/lib/pages.ts`, reused at page / section-tab / button level.
- **Block at every step:** the `?panel` / `?confirm` overlays (e.g. invite, role
  change, remove member) are permission-gated on open (client) AND each action
  re-checks `requireRight` on the SERVER — the guarantee is never UI-only.
- **Member-notification emails:** a member is emailed when their role changes, they
  are removed from a team, or their pending invite is revoked. Best-effort via
  `brandedEmail` + auth `/internal/send-email`; the state change commits first and
  is authoritative (a failed email never rolls it back).

## Phases (sequential; ship each to staging)

- **F · Foundation** — SHIPPED (2026-06-15): sidebar + bottom-tab shell
  (Home / Settings), breadcrumbs, real slugs (`/settings`, `/settings/team`),
  the page registry (`web/lib/pages.ts`), the page-visibility guard +
  `GET /api/tenancy/my-permissions`, the Member-roles rename, and Settings →
  Teams → [team] with tabs (Members + Member-roles panels moved in; Invites tab
  placeholder). Old `/members` `/roles` now redirect into the tabs.
  - **SUPERSEDED 2026-06-21 → screen-engine adoption SHIPPED (M1/M2/M3).** The team
    area moved off `/settings/team/*` onto the engine at `/t/<teamId>/<module>/<id>`
    (see SCREEN-ENGINE-PLAN §10). **M1:** deep-link foundation + member detail via
    engine. **M2:** per-team screen-recipe config store, served by the TENANCY
    worker at `GET/POST /api/tenancy/config/screens` (there is NO separate
    `workers/config` worker — that planned worker was folded into tenancy). **M3:**
    members / roles / invites lists + detail + actions migrated onto the engine at
    `/t` URLs, team Overview, the section switcher, and collapsing breadcrumbs. The
    role permission grid is host-composed (no engine block yet). `/members` `/roles`
    are now thin redirects to the `/t` URLs.
- **1 · Branded email** — SHIPPED (2026-06-15): one `brand.ts`-driven template
  (`shared/workers/email-template.ts`); login code + invite emails use it; sent
  through auth (it owns the Resend key) via the service-binding-only
  `/internal/send-email` route.
- **2 · Profile + email-change** — SHIPPED (2026-06-17): Settings → Account
  profile editing (name/photo, `ProfileDialog`) + avatar-menu link, AND the
  **email-change flow** — `POST /api/auth/email/change/start` (6-digit code to
  the NEW email) + `/verify` (switch `users.email`, write an `email_change_logs`
  row). New global-core migration `db/core/0005_email_change.sql` adds
  `email_change_codes` (pending, hashed, separate from `login_codes` so it can't
  be replayed as a login) + `email_change_logs` (audit). Reuses `brandedEmail`.
  `web/components/email-change-dialog.tsx` (two-step, reuses the `CodeInput`
  temp) lives in Settings → Account. **Two security sub-decisions locked this
  round (do not relitigate):** on a successful change we (a) **sign out the
  user's other devices** (`signOutOtherSessions`, keeps the current one) and
  (b) **warn the OLD email** with a masked notice (`sendEmailChangedNotice`).
- **3 · Invites** — SHIPPED (2026-06-15): create/list/revoke
  (`workers/tenancy/src/lib/invites.ts`, global `invite_index`), the Invites tab,
  branded invite email, auto-join via the existing bootstrap path.
  - **Received-invites inbox — SHIPPED (2026-06-18).** The bootstrap auto-accept
    only covers teamless users at onboarding; an already-onboarded user now has
    `GET /api/tenancy/invitations` + `POST /api/tenancy/invitations/accept`
    (`acceptInvite` in `teams.ts`, race-safe, join + switch) surfaced in the team
    switcher, top of Settings, and the `/invitations` route the email deep-links
    to. `web/components/invitations.tsx`. No schema change (reuses `invite_index`).
- **4 · Team header + edit** — SHIPPED (2026-06-15): team header + access-gated
  `TeamEditDialog` (name + logo → R2 `/media/teams/<id>`), `teams:edit` guarded.

## Shipped 2026-06-17 (staging QA round + finish-the-base)

- **Hardening:** client permission gating (`web/lib/perms.ts` `can()`), opaque
  dropdown menus (stopgap; library flagged), restyled role selection + visible
  icons, an `ErrorBoundary` + global error reporting (`web/lib/log.ts` → the
  gateway's `/api/log/client` → Cloudflare observability). Rule: ERROR-HANDLING.md.
- **Concurrency (race-safety):** atomic last-admin writes (`members.ts`, no DO
  needed) + a partial unique index for pending invites (`db/core/0006`). Rule:
  CONCURRENCY.md.
- **Activity + metadata:** one reusable writer logs created/edited/role-changed/
  invite/removed events to each team's `activity` table; a read endpoint
  (`GET /api/tenancy/activity?scope=team|user|role|invite`) + `GET /api/tenancy/team-meta`;
  reusable `MetadataOverview` + `ActivityFeed`; team-detail **Overview** + **Activity**
  tabs and a **member-detail dialog** (Overview + Activity). Email-change flow live.

## Remaining (for the next session)

1. **Role detail Overview/Activity** — reuse `MetadataOverview` + `ActivityFeed`
   (scope=role) on the selected role in the Member-roles tab (the endpoint + both
   components already support it — small wiring job).
2. **One-row-three-places (optional polish):** to show a member-role-change on the
   role's detail too (not just the user's + team feed), add `subject_role_id` to the
   per-team `activity` table (a team-schema migration + a `migrate-teams` roll).
3. **Nice-to-haves:** extract a reusable `<PageGuard>`; graduate the
   `auth-card`/`code-input` temps into the library (UI-GAPS.md #1–#2 — the
   dropdown-opacity + selectable-list items shipped 2026-06-18 and their
   stopgaps are already removed).

## Pace (why sequential, not parallel)

Chosen: **sequential but fast**, shipped per phase — not parallel sessions, not a
worktree workflow. These features share too many files (`api.ts`, shared types,
the tenancy router, the nav shell, docs) for safe parallelism; the integration +
babysitting cost would outweigh the wall-clock saving. Background phase-builds
keep the owner free without supervising multiple chats.
