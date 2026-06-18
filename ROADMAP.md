# Roadmap — members, roles & settings build-out (Phase C)

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
- **Live layer** — new `realtime` worker (`TeamChannel` Durable Object, one per
  team, hibernatable), `publishChange` on every tenancy write, `web/lib/realtime.ts`
  client hook wired in `AppShell` → invalidates the matching cache so data
  updates with no refresh. See ARCHITECTURE.md (workers table, LOCKED 2026-06-13).
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
- The current top-level `/members` and `/roles` screens **move into** Settings →
  Teams → [team] tabs — they're no longer top-level.
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
- **Branded email:** ONE template reads `shared/brand.ts` (name, motto, logo,
  accent + secondary) → rich HTML + plain-text fallback. Used by the login code,
  invites, and email-change. Re-skins automatically with the brand, across apps.
- **Invites:** create / list / revoke; states **pending · accepted · revoked
  ("redacted") · expired**; 7-day shelf life; branded email; accepting
  auto-joins (reuses the existing bootstrap invite-accept path).
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

## Phases (sequential; ship each to staging)

- **F · Foundation** — SHIPPED (2026-06-15): sidebar + bottom-tab shell
  (Home / Settings), breadcrumbs, real slugs (`/settings`, `/settings/team`),
  the page registry (`web/lib/pages.ts`), the page-visibility guard +
  `GET /api/tenancy/my-permissions`, the Member-roles rename, and Settings →
  Teams → [team] with tabs (Members + Member-roles panels moved in; Invites tab
  placeholder). Old `/members` `/roles` now redirect into the tabs.
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
  (`GET /api/tenancy/activity?scope=team|user|role`) + `GET /api/tenancy/team-meta`;
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
   `auth-card`/`code-input`/dropdown-opacity/selectable-list temps into the library
   (UI-GAPS.md).

## Pace (why sequential, not parallel)

Chosen: **sequential but fast**, shipped per phase — not parallel sessions, not a
worktree workflow. These features share too many files (`api.ts`, shared types,
the tenancy router, the nav shell, docs) for safe parallelism; the integration +
babysitting cost would outweigh the wall-clock saving. Background phase-builds
keep the owner free without supervising multiple chats.
