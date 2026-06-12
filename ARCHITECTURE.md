# Brimba — Architecture (the 20 locked decisions)

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
- **Sharding: build EVERYTHING up front** (user confirmed twice): daily size
  checks alarming at 80% of D1's 10GB cap, the module-to-its-own-database
  mover, AND the merged-reads splitter for a single oversized table.
- Every row: globally-unique, team-stamped IDs (rows can move homes without
  collisions). Every worker reads/writes through ONE data-access layer.

## 2 · The machine — workers (LOCKED)

Five domain workers, each small enough for an AI agent to hold fully in its head:

| Worker | Owns |
|---|---|
| **auth** | Google OAuth (direct — NO Clerk), 6-digit email login codes via Resend, sessions, email-change flow (code to the NEW email) |
| **tenancy** | teams, team members, roles & permissions, invites |
| **content** | learning, help + help threads, selectable data (+ types) |
| **data-ops** | import sessions, export, the AI import agent (Workers AI, behind ONE swappable interface so the brain can change in one config edit) |
| **gateway / MCP** | the single front desk: ONE master catalog of every action (name, purpose, what to call before/after, inputs), exposed as one MCP server. UI and agents call the SAME doors |

## 3 · Tenancy & security rules (LOCKED)

- **One team session at a time** (Glide-style team-hop button on every page).
- **Every server request validates active-team membership + role rights.**
  A deep link to another team's record gets blocked/booted server-side —
  security is never just hiding UI.
- **Permissions: tall sheet** per team — `role | module | read/create/edit/delete`.
  New module = new rows, never a schema change. Members point at one role;
  editing a role applies instantly to every holder.
- Any write right (create/edit/delete) **auto-flips READ on**, visibly.
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

- Sign-in: Google or email + 6-digit code (Resend sends ALL email). All user
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
