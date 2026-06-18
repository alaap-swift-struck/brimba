# Brimba — Architecture (the 20 locked decisions)

The gateway is also the app's public address: it serves the web screens as
static assets AND routes /api/* to the domain workers (service bindings), so
screens and brains share one origin — login cookies work everywhere, including
installed iPhone apps.

Decided with the user on 2026-06-12 across 20 targeted questions. This is the
**master decision document** — every worker, table, and screen must follow it.
Do not relitigate any "LOCKED" item without the user.

> Brimba is a real product meant to run at scale immediately — never call it a
> "v1" or "MVP". Reference data model: the user's Glide "Base v3" exports
> (users, teams, team members, member roles, learning, help + help threads,
> invite logs, email change logs, all activity, selectable data + types,
> importable databases, data import sessions).

## 1 · Data — where things live (LOCKED)

- **Per-team databases.** A small GLOBAL D1 core holds: `users`, `teams`,
  `team_members` (the card catalog: user → team → role id), `email_change_logs`,
  and the import registry. Every team then gets **its own D1 database** holding
  all its tables: roles + permissions, learning, help + threads, invite logs,
  selectable data, activity, import sessions. Another team's rows are never in
  the same database — isolation by physics, not by query discipline.
- **Sharding machinery: BUILT (2026-06-12)** per the locked build-everything
  call: a nightly cron sizes every team database and alarms at 80% of D1's
  10GB cap (`db_alerts`); the **mover** relocates a heavy module to its own
  database (`team_module_databases` routing); reads merge across locations
  via `d1QueryAcross` + `resolveModuleDatabases` — the splitter read-path
  modules will use. Maintenance via x-admin-key endpoints.
- Every row: globally-unique, team-stamped IDs (rows can move homes without
  collisions). Every worker reads/writes through ONE data-access layer.

## 2 · The machine — workers (LOCKED)

Six domain workers, each small enough for an AI agent to hold fully in its head:

| Worker | Owns |
|---|---|
| **auth** | Strict email-OTP login — 6-digit codes via Resend (NO Clerk, NO Google; parked 2026-06-12), sessions, email-change flow (code to the NEW email) |
| **tenancy** | teams, team members, member roles & permissions, invites |
| **content** | learning, help + help threads, selectable data (+ types) |
| **data-ops** | import sessions, export, the AI import agent (Workers AI, behind ONE swappable interface so the brain can change in one config edit) |
| **realtime** | the live "switchboard" (LOCKED 2026-06-13): one **TeamChannel Durable Object** per team holds that team's members' WebSockets (hibernatable → idle teams cost ~nothing) and broadcasts coarse "X changed" pings so screens update with no refresh. Holds NO app data — the databases stay the source of truth. Channels are created on-demand by name (`team:<id>`), unlimited, and reusable as-is by any app on this base. Workers publish via `publishChange`; the client subscribes and refetches through the normal permission-checked endpoints (pings carry no data, so nothing leaks). |
| **gateway / MCP** | the single front desk: serves the web screens (and marks `/_next/static/**` immutable so repeat loads don't re-validate), routes `/api/*` to the workers (incl. the `/api/realtime` WebSocket), exposes ONE master MCP catalog. UI and agents call the SAME doors |


### Durable Objects — code vs runtime, and how they scale (LOCKED 2026-06-15)

The confusion to retire: **a worker count and a Durable-Object count are different things.**

- A **Worker** is deployed *code*. We have ~6 (auth, tenancy, realtime, content,
  data-ops, gateway). This number does **not** grow with teams.
- A **Durable Object class** is also code — a class *inside* a worker (e.g.
  `TeamChannel` in the realtime worker). We have very few (the 500-classes cap is
  irrelevant).
- A **Durable Object instance** is a *runtime* entity addressed by name
  (`team:<id>`). Instances are **unlimited** and created on demand — addressing
  one by name conjures it; idle ones hibernate (≈ free). **An instance is not a
  worker.**

So 10,000 teams = still ~6 workers + one `TeamChannel` class, but 10,000
*instances* (one per team), almost all hibernating. Exactly like OOP: one
`class` (code), millions of objects (runtime).

**What gets a DO instance — and what does NOT:**
- **Live channel — one instance per team** (`TeamChannel`). Every change in a
  team (its name, a product, stock…) publishes one ping to that team's single
  channel. NOT one-DO-per-record.
- **Transactional entity — one instance per *contended* thing** (an inventory
  cell, a ledger account, a booking slot), and ONLY where serialized
  read-modify-write matters. Reserved for hot counters/balances. Race-free
  because one instance handles its requests one at a time (single-threaded);
  apply the *operation* inside it ("decrement by 2"), persist before you ack;
  cross-entity transactions use a coordinator + idempotency keys.
- **Everything else = plain D1 rows.** Team name, member list, roles, a product's
  descriptive fields → written by a worker to the per-team D1, no DO. (Renaming a
  team is a D1 write + a channel ping; it does **not** get its own DO.)

**Scale + sharding:** DO instances are addressed by key and scale horizontally
*independent* of D1 sharding (which only decides where relational rows live).
Both scale by key to very large numbers; they're orthogonal. Client read-caching
on top follows [CACHING.md](CACHING.md).

### The actions today (each becomes an MCP-catalogued tool)

| Action | Worker | What it does |
|---|---|---|
| POST /api/auth/email/start | auth | send a 6-digit login code |
| POST /api/auth/email/verify | auth | check code, start session |
| POST /api/auth/email/change/start | auth | send a 6-digit code to the NEW email (signed-in) |
| POST /api/auth/email/change/verify | auth | check code → switch `users.email`, log it, sign out other devices, warn the old email |
| GET /api/auth/me | auth | who am I? |
| POST /api/auth/profile | auth | onboarding names + photo (R2) |
| POST /api/auth/logout | auth | end session |
| POST /api/tenancy/bootstrap | tenancy | accept invites OR create the personal team (+ its database) |
| GET /api/tenancy/teams | tenancy | my teams (switcher/home) |
| POST /api/tenancy/teams/update | tenancy | edit the active team's name + logo (teams:edit) |
| GET /api/tenancy/members | tenancy | the active team's members (+ identity + role) |
| POST /api/tenancy/members/role | tenancy | change a member's role (guards: not self, ≥1 admin) |
| POST /api/tenancy/members/remove | tenancy | remove (deactivate) a member |
| GET /api/tenancy/my-permissions | tenancy | the caller's own rights for the active team (drives the page-visibility guard) |
| GET /api/tenancy/roles | tenancy | the team's roles (+ member counts) |
| POST /api/tenancy/roles | tenancy | create a new role (starts with no rights) |
| POST /api/tenancy/roles/update | tenancy | rename / re-describe a role (not the locked Admin) |
| GET /api/tenancy/roles/permissions | tenancy | a role's permission matrix (tall sheet) |
| POST /api/tenancy/roles/permissions | tenancy | save a role's matrix (server re-applies auto-flip-read; Admin locked) |
| GET /api/tenancy/activity | tenancy | the team's activity feed, or one record's (`?scope=team\|user\|role&id=`) |
| GET /api/tenancy/team-meta | tenancy | the active team's Overview metadata (created by/when, last updated) |
| GET /api/tenancy/invites | tenancy | the team's invites (pending/accepted/revoked/expired) |
| POST /api/tenancy/invites | tenancy | invite by email to a role (branded email via auth) |
| POST /api/tenancy/invites/revoke | tenancy | revoke ("redact") a pending invite |
| POST /internal/send-email | auth | send a branded email composed by another worker (service-binding only) |
| POST /api/tenancy/admin/migrate-teams | tenancy | roll team-schema migrations to every team DB (x-admin-key) |
| GET /api/tenancy/admin/db-sizes | tenancy | size check + open 80% alarms (x-admin-key) |
| POST /api/tenancy/admin/move-module | tenancy | the mover: relocate a module to its own DB (x-admin-key) |
| GET /media/* | gateway | serve uploaded files from R2 |
| (WebSocket) /api/realtime?team= | realtime | join your team's live channel; receive "X changed" pings (server-gated by membership, same as the API) |

## 3 · Tenancy & security rules (LOCKED)

- **One team session at a time** (Glide-style team-hop button on every page).
- **Every server request validates active-team membership + role rights.**
  A deep link to another team's record gets blocked/booted server-side —
  security is never just hiding UI.
- **Permissions: tall sheet** per team — `role | module | read/create/edit/delete`.
  New module = new rows, never a schema change. Members point at one role;
  editing a role applies instantly to every holder.
- Any write right (create/edit/delete) **auto-flips READ on**, visibly.
- The enforcement seam is BUILT (`workers/tenancy/src/lib/permissions.ts`:
  requireMember + requireRight reading the tall sheet) — every module
  endpoint starts with it the day the first module lands.
- **Export needs READ only. Import needs CREATE.**
- Default roles seeded per team: **Admin** (locked, full rights) + **Viewer**
  (read-only). Default selectable-data values seeded on team creation.

## 4 · Records & history (LOCKED)

- Every table carries the audit block: created/edited/deactivated timestamps +
  actor id/email/name snapshots (exactly like Base v3).
- **Master records are NEVER hard-deleted** — deactivate/activate only
  (the words are "deactivate"/"activate", not archive). The delete right stays
  in the grid for future child-table cases; base modules don't expose it.
- **Activity log records meaningful changes** — created, edited, role changed,
  invite sent/revoked, member removed (deletes don't happen). One reusable writer
  (`shared/workers/activity.ts`) writes to each team's own `activity` table; each
  row carries a relation (`related_table`/`related_row_id`) so the SAME feed
  surfaces three ways — the whole team, one user, or one role.
- **Every record screen has an Overview tab + an Activity tab** (LOCKED
  2026-06-17): Overview = the audit block (created/edited/deactivated + who);
  Activity = that record's slice of the log. Built from two reusable components
  (`web/components/metadata-overview.tsx`, `activity-feed.tsx`). See the activity
  read path in `workers/tenancy/src/lib/activity-read.ts`.
- Race-safety for invariant writes follows [CONCURRENCY.md](CONCURRENCY.md);
  failures follow [ERROR-HANDLING.md](ERROR-HANDLING.md).

## 5 · Users, onboarding, invites (LOCKED)

- Sign-in: email + 6-digit code ONLY (strict OTP; Resend sends ALL email). Google login is parked. All user
  data lives in OUR database — no auth vendor holds anything.
- Onboarding: first name, last name, optional photo.
- Invites are by email, with a shelf life. At onboarding, **all active invites
  auto-accept** (the user lands in those teams). A personal "Chris' team" is
  auto-created **only if there are no active invites**.

## 6 · App shell (LOCKED)

- **PWA, online-only.** Real install prompt on Android/desktop; iPhone gets a
  guided "Share → Add to Home Screen" walkthrough (Apple allows no auto-prompt).
- **UI comes ONLY from `@swift-struck/ui`.** Gaps go INTO the library first
  (known gaps: 6-digit code input, step wizard). Never one-off components here.
- Anti-bloat is law: one master copy of every rule/doc/component; reuse over
  recode; keep every piece small enough for an agent to reason about.
