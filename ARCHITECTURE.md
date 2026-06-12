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

Five domain workers, each small enough for an AI agent to hold fully in its head:

| Worker | Owns |
|---|---|
| **auth** | Strict email-OTP login — 6-digit codes via Resend (NO Clerk, NO Google; parked 2026-06-12), sessions, email-change flow (code to the NEW email) |
| **tenancy** | teams, team members, roles & permissions, invites |
| **content** | learning, help + help threads, selectable data (+ types) |
| **data-ops** | import sessions, export, the AI import agent (Workers AI, behind ONE swappable interface so the brain can change in one config edit) |
| **gateway / MCP** | the single front desk: ONE master catalog of every action (name, purpose, what to call before/after, inputs), exposed as one MCP server. UI and agents call the SAME doors |


### The actions today (each becomes an MCP-catalogued tool)

| Action | Worker | What it does |
|---|---|---|
| POST /api/auth/email/start | auth | send a 6-digit login code |
| POST /api/auth/email/verify | auth | check code, start session |
| GET /api/auth/me | auth | who am I? |
| POST /api/auth/profile | auth | onboarding names + photo (R2) |
| POST /api/auth/logout | auth | end session |
| POST /api/tenancy/bootstrap | tenancy | accept invites OR create the personal team (+ its database) |
| GET /api/tenancy/teams | tenancy | my teams (switcher/home) |
| POST /api/tenancy/admin/migrate-teams | tenancy | roll team-schema migrations to every team DB (x-admin-key) |
| GET /api/tenancy/admin/db-sizes | tenancy | size check + open 80% alarms (x-admin-key) |
| POST /api/tenancy/admin/move-module | tenancy | the mover: relocate a module to its own DB (x-admin-key) |
| GET /media/* | gateway | serve uploaded files from R2 |

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
- **Activity log records edits, deactivations, activations ONLY** — creation
  details already live on the row; deletes don't happen.

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
