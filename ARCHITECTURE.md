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

Domain workers, each small enough for an AI agent to hold fully in its head.
**UPDATED 2026-07-07:** **all 7 are built & on disk** — auth, tenancy, realtime,
gateway, **content**, **data-ops**, and **mcp** (the external machine surface:
personal access tokens → a team-pinned session bridge → the opt-in tool catalog;
routed through the gateway at `/mcp` + `/api/mcp/*`). (The planned `workers/config` recipe store was folded into
**tenancy**, not built separately.) `npm run check` type-checks web + the built
workers and runs the full unit/integration suite (web + the workers).

| Worker | Owns |
|---|---|
| **auth** | Strict email-OTP login — 6-digit codes via Resend (NO Clerk, NO Google; parked 2026-06-12), sessions, email-change flow (code to the NEW email) |
| **tenancy** | teams, team members, Member roles (module key `member_roles`) + permissions, invites; also the per-team screen-recipe config store (`GET/POST /api/tenancy/config/screens`) |
| **content** *(BUILT 2026-06-23; `brimba-content`)* | **Learning** (how-to articles, in-app body, manual sequence, pick-or-create category → `selectable_data`, per-user `mark done` progress, deactivate-not-delete) + **Help** (team-wide tickets + threaded replies, fixed status lifecycle `open/in_progress/resolved/reopened`, raiser-can-reopen, @mention + reply email notify, source screen/record capture). Routes under `/api/content/*`. Binds AUTH (whoami) + REALTIME (live pings) + the core DB (gating) + per-module R2 (`LEARNING_MEDIA`, `HELP_MEDIA`). Gated by the `learning` / `help` permission modules; not public (`workers_dev:false`) |
| **data-ops** *(BUILT 2026-06-23; `brimba-data-ops`)* | **(a) CSV import** — the 3-stage session (file → mapping → confirm) against the GLOBAL owner-maintained `importable_databases` catalog, **INSERT-ONLY**, gated by the **target's `create` right** (no key of its own), writing **act-as-user** through the gated create endpoints (three targets today: `selectable_data` + `member_roles` + `learning`), PLUS the agentic multi-file **batch** import (AGENTIC-IMPORT.md — analyze → plan → ordered run with foreign-key resolution). **(b) the AI agent** — a swappable model seam, an opt-in tool catalog, an act-as-user executor, the confirm rule, identity-act blocks, fenced tool results, a step cap, saved per-team threads (audit), and a credit-based quota (the quota tables + rules live in DATA-MODEL.md `agent_usage`/`agent_credits` + EDGE-CASES.md §8). Routes under `/api/data-ops/*`. Binds AUTH/REALTIME/CONTENT/TENANCY + Workers AI (`AI`) + the core DB; not public (`workers_dev:false`) |
| **realtime** | the live "switchboard" (LOCKED 2026-06-13; ROW-LEVEL 2026-06-22): one **TeamChannel Durable Object** per channel holds its open WebSockets (hibernatable → idle channels cost ~nothing) and fans out tiny **row-level** change pings `{resource, id, op}` so screens patch just the changed row — no refetch. Holds NO app data — the databases stay the source of truth. **Two channel scopes**, both gated like the API: `team:<id>` (every active member; gated by active membership of THAT team) and `user:<id>` (one person's devices — identity/membership events + a forced sign-out; gated to your OWN id, open even when teamless). Channels are created on-demand by name, unlimited, reusable as-is. Workers publish via `publishChange` / `publishUserChange` / `publishSignOut`; the client re-pulls the one changed row through the normal permission-checked endpoint. The ping carries no row CONTENT (just `{resource,id,op}`), and the socket is gated at connect, so a listener never receives data it couldn't already fetch. |
| **gateway / MCP** | the single front desk: serves the web screens (and marks `/_next/static/**` immutable so repeat loads don't re-validate), routes `/api/*` to the workers (incl. `/api/content/*`, `/api/data-ops/*`, and the `/api/realtime` WebSocket), and serves uploaded media from R2. Routes `/mcp` + `/api/mcp/*` to the mcp worker (the ONE master MCP catalog — BUILT, below). UI and agents call the SAME doors |
| **mcp** *(BUILT 2026-07-07; `brimba-mcp`)* | the external machine surface: personal access tokens (hashed, shown-once, revocable, pinned to ONE team; core `mcp_tokens`, mig 0013) verified on EVERY request and bridged (auth `/internal/mcp-session`, INTERNAL_KEY) to a short-lived session PINNED to the token's team (`sessions.team_pin` — /me answers with the pinned team, so the whole gating chain re-checks live membership + role per call and the token can never act outside its team). Exposes the OPT-IN tool catalog over JSON-RPC at `/mcp` (Bearer auth): reads, full-field CSV exports, the agentic import (start/add/plan/run — plan METERED on the team's AI quota), and the assistant itself (agent_chat/agent_confirm). Every tool is a thin forward to an existing gated door; `catalog.test.ts` machine-checks each forwarded path against the target worker's own ROUTES + that every declared exportPath is a tool. Token management (create show-once / list / revoke) is session-gated under `/api/mcp/tokens` with a Settings card. Not public (`workers_dev:false`) — only the gateway routes to it |


### Durable Objects — code vs runtime, and how they scale (LOCKED 2026-06-15)

The confusion to retire: **a worker count and a Durable-Object count are different things.**

- A **Worker** is deployed *code*. We have **7 built today** (auth, tenancy,
  realtime, gateway, content, data-ops, mcp — UPDATED 2026-07-07). This number
  does **not** grow with teams.
- A **Durable Object class** is also code — a class *inside* a worker (e.g.
  `TeamChannel` in the realtime worker). We have very few (the 500-classes cap is
  irrelevant).
- A **Durable Object instance** is a *runtime* entity addressed by name
  (`team:<id>` or `user:<id>`). Instances are **unlimited** and created on demand
  — addressing one by name conjures it; idle ones hibernate (≈ free). **An
  instance is not a worker.**

So 10,000 teams + their members = still 7 workers + one `TeamChannel` class, but
that many *instances* (one per team **and** one per signed-in user), almost all
hibernating. Exactly like OOP: one `class` (code), millions of objects (runtime).

**What gets a DO instance — and what does NOT:**
- **Live channels — one instance per team AND one per user** (`TeamChannel`,
  addressed `team:<id>` or `user:<id>`). A team change pings that team's channel
  (every active member); an identity / cross-team-membership / sign-out event pings
  that user's channel (their devices). Each ping is **row-level** (`{resource, id,
  op}`), NOT one-DO-per-record.
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
| GET /api/auth/activity | auth | the caller's OWN account history (name/photo/email changes) — identity-level, not team-tied |
| POST /api/auth/profile | auth | onboarding names + photo (R2) |
| POST /api/auth/logout | auth | end session |
| POST /api/tenancy/bootstrap | tenancy | accept invites OR create the personal team (+ its database) |
| GET /api/tenancy/teams | tenancy | my teams (switcher/home) |
| POST /api/tenancy/teams/update | tenancy | edit the active team's name + logo (teams:edit) |
| GET /api/tenancy/members | tenancy | the active team's members (+ identity + role) |
| POST /api/tenancy/members/role | tenancy | change a member's role (guards: not self, ≥1 admin); also emails the member a branded role-change notification via auth `/internal/send-email` (best-effort — see below) |
| POST /api/tenancy/members/remove | tenancy | remove (deactivate) a member; also emails the member a branded "removed from team" notification via auth `/internal/send-email` (best-effort — see below) |
| GET /api/tenancy/my-permissions | tenancy | the caller's own rights for the active team (drives the page-visibility guard) |
| GET /api/tenancy/roles | tenancy | the team's roles (+ member counts) |
| POST /api/tenancy/roles | tenancy | create a new role (starts with no rights) |
| POST /api/tenancy/roles/update | tenancy | rename / re-describe a role (not the locked Admin) |
| GET /api/tenancy/roles/permissions | tenancy | a role's permission matrix (tall sheet) |
| POST /api/tenancy/roles/permissions | tenancy | save a role's matrix (server re-applies auto-flip-read; Admin locked) |
| GET /api/tenancy/activity | tenancy | the team's activity feed, or one record's (`?scope=team\|user\|role\|invite&id=`) |
| GET /api/tenancy/invites/audit | tenancy | one invite's `invite_logs` audit (inviter snapshot + acceptance) for the detail (`?id=`) |
| GET /api/tenancy/team-meta | tenancy | the active team's Overview metadata (created by/when, last updated) |
| GET /api/tenancy/invites | tenancy | the team's invites (pending/accepted/revoked/expired) |
| POST /api/tenancy/invites | tenancy | invite by email to a role (branded email via auth) |
| POST /api/tenancy/invites/revoke | tenancy | revoke ("redact") a pending invite; also emails the invitee a branded "invite revoked" notification via auth `/internal/send-email` (best-effort — see below) |
| GET /api/tenancy/invitations | tenancy | invites the caller has RECEIVED (by email) — the inbox; works for any signed-in user, not just teamless ones |
| POST /api/tenancy/invitations/accept | tenancy | accept one received invite → join + switch to that team (validates email-ownership + pending + unexpired; race-safe) |
| POST /internal/send-email | auth | send a branded email composed by another worker (service-binding only) |
| POST /api/tenancy/admin/migrate-teams | tenancy | roll team-schema migrations to every team DB (x-admin-key) |
| GET /api/tenancy/admin/db-sizes | tenancy | size check + open 80% alarms (x-admin-key) |
| POST /api/tenancy/admin/move-module | tenancy | the mover: relocate a module to its own DB (x-admin-key) |
| GET /api/content/learning | content | list the team's learning items (caller's own `done` state merged in); `?id=` → one item |
| GET /api/content/learning/progress | content | curator dashboard — every member's done state across items |
| POST /api/content/learning | content | create a learning item (`learning:create`; pick-or-create category → `selectable_data`) |
| POST /api/content/learning/update | content | edit a learning item (`learning:edit`) |
| POST /api/content/learning/active | content | deactivate/reactivate an item (`learning:delete`; never hard-deleted, progress survives) |
| POST /api/content/learning/done | content | mark an item done/not-done for the caller (own progress; `learning:read`) |
| GET /api/content/help | content | list the team's tickets (`?scope=mine\|all`; `?id=` → one) |
| GET /api/content/help/thread | content | one ticket's reply thread, oldest-first (`?id=`) |
| POST /api/content/help | content | raise a ticket (`help:create`; always opens `open`) |
| POST /api/content/help/update | content | edit a ticket (`help:edit`) |
| POST /api/content/help/status | content | move along the fixed lifecycle (`help:edit`; raiser may reopen without it) |
| POST /api/content/help/reply | content | add a reply (`help:read`); @mention + raiser get a best-effort email |
| GET /api/data-ops/import/targets | data-ops | list active, code-supported import targets from the global catalog |
| POST /api/data-ops/import | data-ops | start a 3-stage import session (gated on the target's `create` right) |
| POST /api/data-ops/import/file | data-ops | upload CSV text; auto-map columns + build a preview |
| POST /api/data-ops/import/mapping | data-ops | adjust the column mapping; re-build the preview |
| GET /api/data-ops/import/preview | data-ops | the session's current preview (`?id=`) |
| POST /api/data-ops/import/confirm | data-ops | write every mapped row INSERT-ONLY through the gated create endpoint; one list-ping |
| POST /api/data-ops/import/batch(/file) | data-ops | start an agentic multi-file batch; attach a parsed CSV (AGENTIC-IMPORT.md) |
| POST /api/data-ops/import/batch/plan | data-ops | the agent builds the plan (targets, mappings, order, references) — METERED on the credit pool |
| POST /api/data-ops/import/batch/confirm | data-ops | run the plan in dependency order; per-row report; one ping per changed module |
| GET /api/content/learning/export · GET /api/tenancy/roles/export · GET /api/tenancy/selectable/export | content/tenancy | full-field CSV export (EXPORT NEEDS READ; team-bound) |
| GET /api/data-ops/import/sample | data-ops | a downloadable sample CSV for a target — a good-file template (AGENTIC-IMPORT §10) |
| GET /api/data-ops/import/batches | data-ops | the team's import history, newest first — summaries only (who, when, files → tables, totals) |
| POST /api/data-ops/admin/seed-targets | data-ops | seed the global import catalog (owner-only, x-admin-key) |
| POST /api/data-ops/admin/grant-credits | data-ops | top up a team's AI credits (owner-only, x-admin-key) |
| GET /api/data-ops/agent/usage | data-ops | the team's AI quota snapshot (free + credits) |
| POST /api/data-ops/agent/chat | data-ops | run one agent turn (answer, or propose/take an action act-as-you); accepts attached CSVs — planned through the import batch engine, run via run_import_batch behind the confirm panel (AGENTIC-IMPORT §8.5) |
| POST /api/data-ops/agent/confirm | data-ops | approve/decline a proposed dangerous action; resume the turn |
| GET /api/data-ops/agent/threads | data-ops | the caller's saved agent conversations |
| GET /api/data-ops/agent/thread | data-ops | one conversation's messages (`?id=`) |
| GET /media/* | gateway | serve uploaded files from R2 |
| (WebSocket) /api/realtime?team= | realtime | join a team's live channel; receive row-level `{resource,id,op}` pings (gated by active membership of THAT team) |
| (WebSocket) /api/realtime?user= | realtime | join your OWN identity channel (account/membership events + forced sign-out); gated to your own id, open even when teamless |

## 3 · Tenancy & security rules (LOCKED)

- **One team session at a time** (Glide-style team-hop button on every page).
- **Every server request validates active-team membership + role rights.**
  A deep link to another team's record gets blocked/booted server-side —
  security is never just hiding UI.
  - *The reviewed exception (FLAGGED 2026-07-02, owner to confirm):* `GET
    /media/*` is served by the gateway **without a session check** (R2 has no
    directory listing, so only someone holding a file's exact key can fetch it).
    Two key shapes, two risk levels: **learning media** is `learning/<teamId>/<random
    ULID>` — the per-file ULID is unguessable, so cross-tenant access is
    infeasible (this is the sensitive content, and it's protected). **Team logos
    (`teams/<teamId>`) and profile photos (`users/<userId>`)** use PREDICTABLE
    keys — the team/user id is visible in normal URLs — so anyone who knows an id
    can fetch that logo/photo without being a member. Accepted today because
    logos/avatars are low-sensitivity, display-only images; if any future upload
    is sensitive, give it a random-ULID key (like learning) or a membership
    check / signed URL BEFORE shipping it.
- **Deep-link access story (UPDATED 2026-06-21).** Deep links now use the
  `/t/<teamId>/<module>/<id>` grammar, rendered by the screen engine. A deep link
  to a team you are **NOT** a member of does **NOT** switch your active team — the
  server refuses the switch, so there is **no partial switch**; you see a
  no-access screen. A logged-out hit on a deep link → login. (The old
  `/settings/team` + `/settings/team/member` routes are RETIRED/deleted; top-level
  `/members` and `/roles` are thin redirects to `/t/<teamId>/members` and
  `/t/<teamId>/roles`. In-shell navigation uses the History API, never the
  framework router — see CACHING.md "Navigation never reloads".)
- **Block at every step (LOCKED 2026-06-21).** `?panel` / `?confirm` overlays are
  permission-gated on open (client) AND each action re-checks `requireRight` on the
  SERVER, so the guarantee is never UI-only.
- **Permissions: tall sheet** per team — `role | module | read/create/edit/delete`.
  New module = new rows, never a schema change. Members point at one role;
  editing a role applies instantly to every holder.
- Any write right (create/edit/delete) **auto-flips READ on**, visibly.
- The enforcement seam is BUILT — it lives in **`shared/workers/gating.ts`**
  (requireMember + requireRight reading the tall sheet; the ONE seam every
  worker uses — `workers/tenancy/src/lib/permissions.ts` is a thin re-export
  kept for old imports) — every module endpoint starts with it the day the
  first module lands.
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
  surfaces four ways — the whole team, one user, one role, or one invite.
- **Every record screen has an Overview tab + an Activity tab** (LOCKED
  2026-06-17): Overview = the audit block (created/edited/deactivated + who);
  Activity = that record's slice of the log. Both tabs render from LIBRARY
  collections (`RecordDetail` / `DescriptionList` / `ActivityFeed` in
  `@swift-struck/ui`) through the screen engine — never a hand-built app
  component (UI comes only from the library, §6). See the activity read path in
  `workers/tenancy/src/lib/activity-read.ts`.
- Race-safety for invariant writes follows [CONCURRENCY.md](CONCURRENCY.md);
  failures follow [ERROR-HANDLING.md](ERROR-HANDLING.md).

## 5 · Users, onboarding, invites (LOCKED)

- Sign-in: email + 6-digit code ONLY (strict OTP; Resend sends ALL email). Google login is parked. All user
  data lives in OUR database — no auth vendor holds anything.
- Onboarding: first name, last name, optional photo.
- Invites are by email, with a shelf life. At onboarding, **all active invites
  auto-accept** (the user lands in those teams). A personal "Chris' team" is
  auto-created **only if there are no active invites**.
- **Member-notification emails (LOCKED 2026-06-21).** A member is emailed when
  their role changes, they are removed from a team, or their pending invite is
  revoked — a branded email (shared `brandedEmail` template) via auth
  `/internal/send-email`. **Best-effort:** the STATE CHANGE commits first and is the
  authority; a failed/bounced email is logging-only and NEVER rolls it back (same
  pattern as best-effort activity writes in §4). (email-change already warns the
  old address — §2 auth.)
- **Invitations inbox (BUILT 2026-06-18).** An ALREADY-onboarded user (who has a
  team) is not covered by the onboarding auto-accept, so they get an in-app
  **inbox** (`GET /api/tenancy/invitations` by their email; reachable from the
  team switcher, the top of Settings, and the `/invitations` route the invite
  email deep-links to). Accepting (`POST .../invitations/accept`) **joins +
  switches** to that team. This makes an invite recoverable even if the email
  never arrives — no invite is ever a dead end.

## 6 · App shell (LOCKED)

- **PWA, online-only — install prompt BUILT (2026-06-18).** The app ships a web
  manifest (`web/app/manifest.ts`, name/description from `shared/brand.ts`) +
  brand-monogram icons (`web/public/icons/*`, swappable via `brand.logoUrl`) +
  per-mode `theme-color`, so it is installable to a home screen / dock. A library
  bottom `Sheet` (`web/components/install-prompt.tsx`) drives it: Chrome / Edge /
  Android use the captured `beforeinstallprompt` (a real "Install" button); iOS
  Safari (which fires no such event) gets the guided "Share → Add to Home Screen"
  walkthrough. **Trigger rules:** never when already installed; never on a
  browser that can't install (don't nag where the action is impossible); show
  once on the first visit (any page), then only on the **login page** and at most
  once per **14 days** after a dismissal (a dismissal or install stamps the
  cooldown, kept in `localStorage`). No service worker — online-only;
  installability is manifest-based (Chrome ≥90 needs no SW). A reusable
  `pwa-install-prompt` library collection is flagged in UI-GAPS.md for later.
- **Mobile is not desktop-shrunk (LOCKED 2026-06-18).** Controls placed
  side-by-side on desktop must NOT blindly stay side-by-side on mobile: a
  multi-control row stacks (`flex-col`) by default and becomes a row only at
  `sm:` (`sm:flex-row`); every control gets enough width to show its
  placeholder / its content (`w-full` when stacked). Canon lives in the library
  `UI-RULES.md` (the twin of the no-horizontal-scroll / no-pinch-zoom rule).
- **UI comes ONLY from `@swift-struck/ui`.** Gaps go INTO the library first
  (known gaps: 6-digit code input, step wizard). Never one-off components here.
- Anti-bloat is law: one master copy of every rule/doc/component; reuse over
  recode; keep every piece small enough for an agent to reason about.
