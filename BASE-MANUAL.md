# The Brimba Base — how it works, and why

This is the narrative that ties the whole base together. Every other doc is a
close-up: [ARCHITECTURE.md](ARCHITECTURE.md) is the locked decisions,
[DATA-MODEL.md](DATA-MODEL.md) is every table, [CACHING.md](CACHING.md) is the
live layer, [RULES.md](RULES.md) is the law-book. **This** is the map that shows
how those pieces fit and why they were cut the way they were — enough for a new
developer (or an AI agent with no prior context) to rebuild the base from zero
and extend it without breaking its invariants.

Read the two prime directives in [CLAUDE.md](CLAUDE.md) first. Everything below
is downstream of them: **stay lean**, and **obey the Laws of the Base**.

---

## 1 · The shape

Brimba is seven Cloudflare Workers, a two-tier database, and a static web app the
workers serve. Nothing more. The count does not grow with the number of teams or
users — it grows only when you add a genuinely new capability.

### The seven workers, and why each exists

A worker here is one small, single-purpose service, "small enough for an AI
agent to hold fully in its head" (ARCHITECTURE.md §2). The split is by
**domain**, not by convenience, and the seams between them are all
service-binding calls (never a public hop).

| Worker | Cloudflare name | Owns | Why it's its own worker |
|---|---|---|---|
| **auth** | `brimba-auth` | Email-OTP login (6-digit codes via Resend, no Clerk/Google), sessions, the email-change flow, profile, `/api/auth/me`, and `/internal/send-email` | Identity is the one thing every other worker trusts. It's the single session authority: everyone else asks it "who is this?" (`whoAmI`) rather than parsing cookies themselves. |
| **tenancy** | `brimba-tenancy` | Teams, members, Member roles (`member_roles`) + the permission sheet, invites, per-team dropdown values, the screen-recipe config store, and the team-DB migration/sharding admin endpoints | This is the multi-tenancy engine — it owns the global "who's in which team, in which role" catalog and the per-team database lifecycle. The permission seam that every module gates against lives here. |
| **realtime** | `brimba-realtime` | The live switchboard — one `TeamChannel` Durable Object per channel, fanning out row-level `{resource,id,op}` change pings over WebSockets | Live-sync is a cross-cutting concern with a stateful runtime (open sockets). It holds **no app data** — the databases stay the source of truth — so it can be a thin, hibernatable coordinator instead of a second copy of everything. |
| **content** | `brimba-content` | **Learning** (how-to articles + per-user "done" progress) and **Help** (tickets + threaded replies) | These are the base's two real content modules. They're grouped because they share the same shape (team-DB CRUD gated on a permission module, deactivate-not-delete, R2 media) and neither is big enough to deserve its own worker. |
| **data-ops** | `brimba-data-ops` | **CSV import** (the 3-stage single-target session + the agentic multi-file batch import, AGENTIC-IMPORT.md) and **the AI agent** | Both are "operations over the other modules' data" rather than modules of their own. Import writes act-as-user through a target's create endpoint; the agent acts-as-user through every gated endpoint. Neither owns a table of user content — they orchestrate. |
| **gateway** | `brimba` / `brimba-staging` | The single public door: serves the web screens (static assets), serves uploaded media from R2, and routes `/api/*` to the right worker | **The only worker with a public URL.** Everything else sets `workers_dev: false` and is reachable *only* via service bindings. This is what makes `/internal/send-email` and the agent's act-as-user surface safe — no public route can reach them. |

The seventh worker, **mcp** (personal access tokens → a team-pinned session
bridge → an opt-in tool catalogue for external machines), is **BUILT (2026-07-07)**
— and it proves the point of the door design: it slots onto the same gated
endpoints the agent already uses, so it added zero new trust surface beyond the
token itself. How an outside tool connects + the cost model: **MCP.md**.

**Why the gateway is the only door.** UI and agents call the *same* endpoints.
If any domain worker had its own public URL, you'd have two doors to secure and
two behaviours to keep in sync. Instead there is one origin: login cookies work
everywhere (including an installed iOS PWA), and the internal-only surface is
internal by physics — see `workers/gateway/src/index.ts`, which simply forwards
`/api/auth/*` → `env.AUTH`, `/api/tenancy/*` → `env.TENANCY`, `/api/content/*` →
`env.CONTENT`, `/api/data-ops/*` → `env.DATAOPS`, `/api/realtime` →
`env.REALTIME`, `/media/*` from R2, and everything else from the static assets.

### The two-tier database, and why it's split

There are two kinds of database, and the split is deliberate.

**One global core DB (`brimba-core`), reached natively via `env.DB`.** It holds
everything that is about *identity and billing across teams*:

| Table | Holds | Migration |
|---|---|---|
| `users` | email, name, photo, `current_team_id` | `db/core/0001` |
| `teams` | name, logo, `database_id`, `db_status`, `schema_version` | `db/core/0002` |
| `team_members` | the card catalog: user → team → `role_id` | `db/core/0002` |
| `email_change_logs` + `email_change_codes` | the email-change security record + hashed OTP | `db/core/0005` |
| `account_activity` | a person's own identity history | `db/core/0007` |
| `importable_databases` | the owner-maintained import target catalogue | `db/core/0008` |
| `agent_usage` | per-team free daily AI counter | `db/core/0009` |
| `agent_credits` | per-team purchasable AI balance | `db/core/0010` |
| `agent_usage_log` | per-command usage trail (when · who · credits · why; confirm folds in) | `db/core/0011` |

**One isolated D1 database per team, reached over the D1 REST door.** Each team
gets its *own* database holding all of that team's content: `member_roles` +
`role_permissions`, `selectable_data`, `learning` + `learning_progress`, `help` +
`help_threads`, `invite_logs`, `activity`, `data_import_sessions`,
`agent_threads` + `agent_messages`. The master definition of what lives in a team
DB — and the seed rows a newborn team starts with — is
`workers/tenancy/src/team-schema.ts` (`TEAM_MIGRATIONS`).

**Why this split.** Two invariants pull in opposite directions:

- **Hard tenant isolation.** Another team's rows are never in the same database —
  isolation "by physics, not by query discipline" (ARCHITECTURE.md §1). A missing
  `WHERE team_id = ?` can't leak across tenants because the other tenant's rows
  aren't reachable from that connection at all. It also means a team's data can be
  moved, exported, or shard-split without touching anyone else.
- **Central identity and billing.** "Which teams am I in?", "am I still a
  member?", "does this team have AI credits left?" must be answerable *before* you
  open any team database — and must be answerable in one place for billing. So
  users, memberships, invites (the routing copy), and the AI quota live in the one
  global core.

The two tiers are reached through two different doors, and the code makes this
explicit. The core DB is the native binding `env.DB` (fast, `.prepare().bind()`).
Team DBs are reached over the Cloudflare **D1 REST API** using `CF_D1_TOKEN`,
through one data-access layer: `shared/workers/d1-rest.ts` (`d1Query`,
`d1ExecScript`, `sqlString`, plus `d1QueryAcross` for the shard read-path). Every
worker reads and writes team data through that one layer — never ad-hoc.

### The web app

`web/` is a Next.js app exported to **static** assets, served by the gateway
alongside `/api/*` on the same origin. It is "lego assembled from a library": all
UI primitives and collections come from `@swift-struck/ui` (a separate repo);
`web/` only composes *recipes* from them. **You do not edit the library from
here** — if a primitive needs changing, surface it as a gap (UI-GAPS.md), don't
fork it into the host. Screens are one client-resolved shell
(`web/components/deep-link-screen.tsx`) rendering recipes from `web/lib/screens.ts`
at `/t/<teamId>/<module>/<id>` URLs.

---

## 2 · The spine — permissions

Everything in Brimba routes through one gate. This is the single most important
thing to understand, because it is what makes the AI agent safe, what makes deep
links safe, and what a new module plugs into on day one.

### teamContext → requireRight

The shared gating seam is `shared/workers/gating.ts`. Every team-scoped handler
opens the same way:

```ts
export async function getLearning(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)   // who + which team + which DB
  await requireRight(cfg, guard, "learning", "read")        // does their role hold this right?
  const items = await listLearning(cfg, guard)
  return json({ learning: items })
}
```

`teamContext` does four things, in order, throwing a `GuardError` (mapped
centrally to a clean HTTP status) at the first failure:

1. `whoAmI(request, env)` — asks the **auth** worker who the caller is (401 if
   signed out). Nobody parses cookies but auth.
2. Reads the caller's **active team** (`user.currentTeamId`) — one team session at
   a time (409 if none).
3. `d1ConfigFrom(env)` — the D1 REST config for reaching that team's DB.
4. `requireMember` — confirms the caller is an **active** member of that team, and
   returns the `guard` carrying their `roleId` and the team's `databaseId` (403
   `not_member` otherwise).

Then `requireRight(cfg, guard, module, right)` reads the role's **tall permission
sheet** (`role_permissions`: `role_id × module × {read,create,edit,delete}`) in
that team's DB and throws 403 `forbidden` if the bit isn't set.

**Why a tall sheet.** Permissions are `role | module | read/create/edit/delete`
rows, not columns. A new module is *new rows*, never a schema change
(DATA-MODEL.md — Glide's 24-boolean WIDE table became this TALL one). Members
point at one role; editing a role applies instantly to every holder. The seeded
modules today are in `TEAM_MODULES` (`workers/tenancy/src/team-schema.ts`):
`teams`, `team_members`, `member_roles`, `learning`, `help`, `selectable_data`,
`screens`, `agent`. Every team is born with an **Admin** (locked, full rights) and
a **Viewer** (read-only) role.

### The locked security rules the gate enforces

- **Every server request validates active-team membership + role rights.** A deep
  link to a team you're not in doesn't switch your active team — the server
  refuses; you get a no-access screen, never a partial switch. Security is never
  just hiding UI.
- **Block at every step.** UI overlays are permission-gated on open *and* every
  action re-checks `requireRight` on the server. The client guard is a courtesy;
  the server guard is the guarantee.
- **Export needs READ; import needs CREATE.** Import has no permission of its own —
  it's gated on the *target's* `create` right.
- **Deactivate, never delete.** Master records are retired (`deactivated_at` set),
  never hard-deleted, so history and access survive.

### The AI agent acts AS the signed-in user

**The co-pilot rides above every screen.** The assistant panel is mounted ONCE at the root layout (`web/components/agent-host.tsx`), not inside any per-route shell, so navigating — including the agent's own screen-trace — moves the page *underneath* it and never closes it. Its open flag is mirrored to `sessionStorage`, so it even survives the static-export hard reload when you cross into `/t` (it reopens and resumes the saved thread — EDGE-CASES §1). The launcher is gated by `agent:create`, on a reactive session cache so it appears the instant you sign in (no reload).

**Screen tracing.** While the agent works, its steps DRIVE the real screen to where the change is now VISIBLE — the affected record's detail, or the collection list where row-level live-sync makes the new/changed row appear — then rings it. The engine soft-drives the screen when you're **already inside** that team's screens; from a top-level route it **narrates the step in the panel instead of yanking the page** (crossing into `/t` from there is a hard reload that would tear down the running agent — EDGE-CASES §1). A trace **never opens an input form** (`?panel=add|edit`): the agent writes directly through the gated API, so re-opening the manual form would just leave a blank, stale dialog sitting open after the record already exists (the "created the role but left an empty new-role form open" bug). `TraceTarget` has no query field at all, so that class of bug can't be expressed. The tool→screen map is pure (`web/lib/agent-trace.ts`) and machine-checked: `trace-parity.test.ts` fails the build if a write tool ships without a result screen, or if a trace tries to carry a dialog query.

This is the payoff of the spine, and the reason there is **no separate agent
role**. The agent (`workers/data-ops/src/lib/`) does not have its own powers. Its
tool catalogue (`tools.ts`) is an **opt-in** list where every tool maps to a
gated endpoint the UI already uses, and the executor runs each tool AS the caller
by **forwarding their session cookie**:

```ts
// workers/data-ops/src/lib/tools.ts — executeTool
const res = await fetcher.fetch(`https://internal${tool.path}${query}`, {
  method: tool.method,
  headers: { Cookie: request.headers.get("Cookie") ?? "" },  // the caller's own session
  ...
})
```

So the real door — the same `teamContext → requireRight` — re-checks the caller's
permission and validates the input on **every** agent call. The agent can never
exceed what the invoker could do by hand, because it *is* the invoker as far as
the endpoint can tell. The system prompt says it plainly ("You always act AS the
signed-in user, capped by their permissions; the system enforces this on every
call"), but the safety is structural, not a prompt promise.

Four more structural guards layer on top (all in `agent.ts` / `tools.ts`):

- **Confirm rule (destructive-only)** — a write pauses for a yes/no panel ONLY
  when it's **destructive**: the two removals (remove a member, revoke an invite)
  and the three **deactivations** (a role / article / dropdown value, *only* when
  switching OFF — an input-aware predicate), plus the high-blast **bulk / import**
  tools (whose summary carries the row COUNT). Every **constructive** write —
  create, edit, invite, grant a role, set permissions, (re)activate, a single
  status change — runs straight away (the server still gates each call by the
  caller's rights, and every write is reversible + audited). `requiresConfirm`
  (`tools.ts`) is the single place this is decided. The proposal is stored
  server-side, so `/confirm` runs exactly what the model proposed — a client can't
  approve a call it was never shown. (This deliberately relaxes the earlier
  privilege-write confirm for a smoother agent; the fence + act-as-user gating
  remain the primary defense against a prompt-injected write. Owner call,
  2026-07-10.)
- **Catastrophic blocks** — controlling device sessions and deleting the team are
  simply *not in the catalogue*; `identityBlocked` is the belt-and-braces backstop
  in `executeTool`.
- **Fenced tool results** — a tool's output goes back to the model as DATA
  (`role:"tool"`), never as instructions.
- **A step cap** (`MAX_STEPS`) and a **credit quota** (a free daily allowance via
  `agent_usage` — default 25/day, per-env via the `AGENT_FREE_DAILY` var, staging
  runs 50 — + a purchasable balance in `agent_credits`) bound runaways and
  abuse. Every turn is saved to `agent_threads`/`agent_messages` — the audit
  trail — and each user COMMAND writes one `agent_usage_log` row (when · who ·
  credits · why) that powers the usage view behind the panel's quota badge. A
  command that pauses for a confirm folds the confirm turn's units back into that
  one row (`foldUsageIntoLatest`), so the history reconciles with the balance.

---

## 3 · How a module and the base influence each other

Adding a module and changing the base are the two directions of the same
relationship. A module *plugs into* a handful of foundational seams; changing a
foundational seam *ripples* to every module. Understanding both is what lets you
extend the base safely.

### What a new module plugs into (module → base)

To add, say, a `products` module, you touch these seams and nothing else:

1. **Permissions.** Add `"products"` to `TEAM_MODULES`, give it a `MODULE_LABELS`
   entry (the compiler forces you to — `MODULE_LABELS` is `Record<TEAM_MODULES,…>`),
   and a team-DB migration for its table(s). Every role's matrix now has a
   `products` row; `requireRight(cfg, guard, "products", "create")` just works.
2. **Live-sync.** Every mutation route calls `publishChange(env.REALTIME,
   guard.teamId, "products", id, op)` after the write. Screens patch just that
   row. This is a **Law** (R1) — see §4.
3. **Activity.** Call the one generic writer `logActivity(cfg, databaseId, actor,
   {type, description, relatedTable: "products", relatedRowId: id})`
   (`shared/workers/activity.ts`). It writes a row into that team's `activity`
   table with a generic `(related_table, related_row_id)` pair — and the SAME read
   path (`workers/tenancy/src/lib/activity-read.ts`, `scope=record&table=&id=`)
   surfaces your module's history with **zero new read SQL** (Law R5).
4. **The screen engine.** Describe the list + detail as a recipe in
   `web/lib/screens.ts`, map its URL segment to its permission module in
   `MODULE_PERMISSION`, and the deep-link shell renders it at
   `/t/<teamId>/products/<id>`. The record detail gets **Overview + Activity tabs**
   from the library for free (Law R2).
5. **The glossary.** Any new product term goes in `shared/glossary.ts` — one clear,
   brief definition — and UI copy uses that exact word (Law R6). The agent's system
   prompt injects the whole glossary, so the assistant speaks the same dictionary.
6. **Input validation.** Parse the request body through
   `shared/workers/validate.ts` (`requireText` / `optionalText`) so bad input is a
   clean 400, never a 500.
7. **The agent (optional).** Add read/write tools to the catalogue in `tools.ts`,
   each pointing at your new gated endpoints. Because the executor forwards the
   cookie, the agent automatically inherits your module's exact permission checks —
   you write no new authz for it.

Notice what you *don't* touch: no new worker, no new database, no new auth, no new
live layer. That's the base working.

### What ripples when you change a foundational seam (base → module)

The same seams, seen from the other side. Changing one is powerful *and* loud —
the machine-checked Laws (§4) turn a careless change red before it ships.

| Change this seam | …and it ripples to | What `npm run check` catches |
|---|---|---|
| `shared/workers/gating.ts` (how gating works) | Every handler in tenancy/content/data-ops opens with `teamContext`/`requireRight` | TypeScript across all workers; a signature change won't compile |
| `shared/workers/realtime.ts` (the publish seam) | Every mutation route in three workers | `publish-seam.test.ts` reads route handlers off disk and fails if a mutation stops publishing (R1) |
| `activity-read.ts` / `activity.ts` (the one activity path) | Every module's history feed | `generic-activity-path` (R5) — no per-module read SQL allowed |
| The screen engine / recipe shape | Every screen | `record-detail-tabs` (R2), `no-handrolled-toggles` (R3), `forms-use-formshell` (R4), `tab-counts-derived` (R8) |
| `shared/glossary.ts` (a term's wording) | All UI copy + the agent's system prompt | `glossary-wellformed` (R6) |
| `TEAM_MODULES` / `MODULE_LABELS` | The permission matrix, seeds, the Roles screen | `team-schema.test.ts` asserts the module list + seed row counts; `MODULE_LABELS` won't compile without a label |

### How to change foundational code safely

1. **Change the seam in one place.** There is one master copy of every rule, doc,
   and shared helper — reuse over recode. Don't fork a shared function into a
   module.
2. **Run `npm run check`** — it type-checks `web` + the seven workers and runs the
   full test suite, including the rule + seam tests. It is the gate; keep it green.
3. **If you changed a table**, add a **migration**, never an edit-in-place. Core
   migrations live in `db/core/*`; team migrations are appended to
   `TEAM_MIGRATIONS` and rolled to every team DB by `POST
   /api/tenancy/admin/migrate-teams` (owner, `x-admin-key`).
4. **If you changed a worker**, respect the **deploy order**: realtime → auth →
   tenancy → content → data-ops → gateway. Realtime is FIRST because every other
   worker service-binds it to publish change pings, and deploying a binder before
   its target fails with "Worker not found." Data-ops binds content + tenancy, so
   both must exist before it; the gateway is last because it routes to all of them.
5. **If you added a Law**, you must add it to RULES.md *and* the registry *and* a
   check together (see §4) — the build fails otherwise.

---

## 4 · The safety net — the Laws of the Base

The reason a stranger can extend this base without quietly breaking its
invariants is that the invariants are **machine-checked**, not documented-and-
hoped. This is the mechanism.

A Law lives in three linked places:

- **`RULES.md`** — the human-readable law-book (R1–R8), one row per law.
- **`shared/rules/registry.ts`** — the same laws *as data* (`RULES_REGISTRY`),
  each carrying the `checkId` of the test that enforces it. Deny-lists (the
  reviewed exceptions) also live here as data, so every exception is a visible,
  conscious line — never a silent bypass (e.g. `RECORD_DETAIL_EXCEPTIONS`,
  `TAB_COUNT_EXCEPTIONS`, `HOUSEKEEPING`).
- **A test that reads source straight off disk** — a per-worker
  `publish-seam.test.ts` or a case in `web/test/rules.test.ts`. Break a law and
  `npm run check` turns **red**.

The laws today:

| ID | Law | Enforced by |
|---|---|---|
| R1 | Every mutation route publishes a live change ping | `publish-seam` (per-worker) |
| R2 | Every record-detail screen exposes Overview + Activity tabs | `record-detail-tabs` |
| R3 | Collection tab strips use the library `TabsView` — no hand-rolled toggles | `no-handrolled-toggles` |
| R4 | Every form/dialog renders through the shared `FormShell` | `forms-use-formshell` |
| R5 | Record activity is read through ONE generic `(table, id)` path | `generic-activity-path` |
| R6 | Product terms live in ONE glossary, clear and brief | `glossary-wellformed` |
| R7 | Every form dialog persists its draft per session (`useFormDraft`) | `forms-persist-drafts` |
| R8 | Every team collection tab derives its count from its loaded rows | `tab-counts-derived` |

**Why "read off disk" matters.** The publish-seam test
(`workers/content/test/publish-seam.test.ts`) doesn't trust the ROUTES table's
labels — it pulls each handler's *source text* and checks that a `mutation`
handler actually contains a `publishChange`/`publishUserChange`/`publishSignOut`
call. You can't dodge live-sync by mislabelling a route, and you can't add a
state-changing route without consciously classifying it `read` / `mutation` /
`housekeeping`. The classification *is* the reminder.

**The registry can't drift from the doc.** A meta-check (`registry-integrity` in
`web/test/rules.test.ts`) asserts RULES.md lists *exactly* the law ids in the
registry. So: **you cannot add a Law without its check, and you cannot add a
check without its Law.** To add one, do all three steps (registry row + test +
RULES.md row) or the build fails — which is precisely the property that keeps an
agreed rule from silently slipping over time.

A natural next Law, once the tool catalogue stabilises, is `R9 (ai): every agent
tool maps to a gated route` — the invariant §2 relies on, made machine-checked.

---

## 5 · Fork the base for a new product (ERP, portal, CRM…)

Brimba is not an app — it's the **foundation** you start a new product on. When you
build, say, an ERP or a client portal, you inherit login, teams, member roles +
permissions, invites, emails, live-sync, the screen engine, the CSV import, and the
AI agent **for free** — and you add your product's own modules on top. Here's the
whole story.

**What you keep, untouched.** The seven workers, the two-tier database, the gate
(`teamContext → requireRight`), the realtime layer, the auth/email flow, the agent,
and the Laws. These are the base. You do not re-solve multi-tenancy, permissions, or
live updates — they're done.

**What you rename (once).** The product's identity, not its plumbing: the app name +
brand (in the web app's config + the `PUBLIC_APP_URL`/URLs), the worker name prefix
if you want your own (`brimba-*` → `<yourapp>-*` in the `wrangler.jsonc` files and the
deploy scripts), and the GitHub/Cloudflare project names (the `/new-app` skill
automates the scaffold + backup + staging + production wiring). Everything the base
does keeps working because none of the *seams* changed.

**Where your product lives.** Every product-specific thing users work with is a
**module** — an ERP's `invoices`, `products`, `purchase_orders`; a portal's `tickets`,
`documents`. Each is one team-scoped table + a permission row + gated CRUD + a screen,
added exactly as **BUILD-A-MODULE.md** describes. Your ERP is "the base + N modules."
Because a module plugs into the same six seams (§3), your `invoices` module gets
live-sync, activity, the Overview/Activity detail, search/filters, and **agent
control** (the AI can act on invoices AS the user) without extra work — you just
follow the golden path.

**The order to build a new product.**
1. Stand up the base on your own account — **BOOTSTRAP.md**, end to end.
2. Rename the identity (or run `/new-app` to scaffold a fresh one on this base).
3. Add your first module — **BUILD-A-MODULE.md** (`invoices`, say). Ship it. Repeat
   per module.
4. Add agent tools for your module (an entry in `data-ops`'s tool catalog per
   endpoint) so the AI can drive it — same act-as-user, same confirm rule.
5. Keep `npm run check` green and obey the Laws; they're what stop a fast-growing
   product from drifting.

**What a new product must NOT do.** Don't fork the UI library into the app (fix it in
`@swift-struck/ui`), don't add a public worker (only the gateway is public), don't add
a per-module database (one D1 per *team*, not per module — modules are tables inside
it), and don't relitigate the locked decisions in ARCHITECTURE.md without a deliberate
reason. Staying inside the seams is what keeps a big product lean and secure.

---

## 6 · How each part scales

The base is built to grow along every axis the owner asked about. Here's the growth
path for each subsystem — what's already in place, and what you turn on when you get
bigger.

- **Teams (tenants).** Each team has its **own D1 database**, so teams are isolated by
  *physics*, not by a `WHERE team_id =` filter — one noisy tenant can't touch another,
  and a team's data can move databases without collisions (every id is a ULID). Growth
  path: today every team DB is created on demand; the D1 REST door
  (`shared/workers/d1-rest.ts`) already supports **fanning a query across shard
  databases** (`d1QueryAcross`), so a single logical team can be split across databases
  when one hits D1's size cap. A nightly cron sizes every team DB and alarms at 80% of
  the 10 GB cap (OPERATIONS.md), so you see the ceiling coming.

- **Member roles + permissions.** The permission model is a **tall sheet**
  (`role_permissions`: `role_id · module · read/create/edit/delete`). Adding a module
  or a role is **new rows, never a schema change** — so permissions scale to any number
  of modules and roles with zero migrations. Editing a role applies instantly to every
  holder (members point at a role id, not a copy of the rights). The one invariant to
  respect as you grow: a team always keeps **≥1 admin** (enforced race-safely —
  CONCURRENCY.md).

- **Invites.** An invite is a global index row (`invite_index`) + a per-team audit log.
  Accepting is **race-safe** (email-ownership + pending + unexpired, UPSERT so a
  re-joining removed member reactivates cleanly). Scales to any invite volume because
  the accept path opens no team database until it writes. Emails are sent through the
  one sender (below); the link uses `PUBLIC_APP_URL`.

- **Emails.** Every outbound email goes through **one worker** (auth's
  `/internal/send-email`, guarded by `INTERNAL_KEY`), so the provider is swappable in
  one place and rate/retry policy lives in one place. Scale by swapping Resend for a
  higher-tier provider (or adding a queue in front of that one seam) — no caller
  changes.

- **Live updates.** The realtime layer fans a **tiny `{resource, id, op}` ping** (never
  row data), so a busy team costs bandwidth in bytes, not kilobytes. Each team is its
  **own `TeamChannel` Durable Object**, hibernatable (idle channels cost ~nothing), so
  ten thousand teams don't cost ten thousand always-on processes. The one hot-team
  ceiling (a single team fanning thousands of writes/sec) is a known axis — DURABLE-
  OBJECTS.md documents when to reach for a different DO.

- **The AI agent.** Bounded by a **per-team credit quota** (free daily allowance +
  purchasable balance) and a **step cap** — so cost and abuse scale with a knob, not
  with hope. The brain is a **swappable model seam** (`selectModel`): move to a cheaper
  or stronger model with one var as your volume/needs change. The tool catalog is
  opt-in, so the agent's power grows only as fast as you add tools.

- **The data layer's cost.** Every per-team query is an **HTTP round-trip** (the REST
  door), so the base is built to **batch** (multi-statement `d1ExecScript`) and
  **parallelise** independent reads (`Promise.all` / `d1QueryAcross`). As a screen grows
  data-heavy, those are the levers (EDGE-CASES.md). The client cache-first + row-level
  live-sync means more data does **not** mean more refetching.

- **The web app.** A **static export** served from Cloudflare's edge — it scales like a
  CDN asset (no server render per request). The whole `/t/*` tree is one shell, so
  adding screens adds recipes, not routes.

The through-line: every axis scales by a **seam or a knob that already exists**, not by
a rewrite. That's the payoff of the locked architecture.

---

### 6.5 · When a team database approaches the cap — the shard runbook

The nightly cron (tenancy, 03:10 UTC) measures every team database and writes a
`db_alerts` row at **80% of D1's 10 GB cap** — so you see the ceiling coming months
out, not the day writes fail. When an alarm fires, this is the path, in order:

1. **Find the weight.** One module's table is almost always the bulk (a products or
   events table, not roles). `SELECT name, SUM(pgsize) FROM dbstat GROUP BY name`
   on the team DB names it.

2. **Stage 1 — split by MODULE (the designed first move).** Every read and write in
   the app flows through ONE seam: the data door (`d1Query`/`d1ExecScript` with
   `guard.databaseId`). Nothing else touches a team database — not the UI, not the
   agent, not MCP, not the import engine (they all call the gated endpoints, which
   call the door). So moving one module's tables to a NEW D1 database for that team
   is a **routing change at that seam**: create the database, copy the module's rows
   (ULIDs are globally unique — no collisions), and teach the door a per-module
   database map (`databaseIdFor(guard, module)` instead of the single
   `guard.databaseId`). Every caller above the seam is untouched — that is why the
   base bans raw DB access everywhere else.

3. **Stage 2 — split ONE table across two databases (same-table sharding).** Only
   when a single module outgrows a whole database. Shard by time: **ULIDs sort by
   creation time**, so "shard 1 = rows before cutoff, shard 2 = after" needs no new
   key. Writes go to the newest shard (one-line routing); reads use
   `d1QueryAcross(cfg, [shard1, shard2], sql)` — already in
   `shared/workers/d1-rest.ts` — which queries the shards IN PARALLEL and merges.
   Performance: a fanned read costs the LATENCY OF THE SLOWEST SHARD (they run
   concurrently), not the sum; sorting/paging happens on the merged rows, so keep
   per-shard LIMITs generous and page in the worker.

4. **Who has to know?** Nobody above the door. The developer API, the MCP tools and
   the agent all call the same gated endpoints; the endpoints call the door; the
   door owns routing. A human/agent doing the split follows THIS section; a
   consumer of the app never sees it.

**What's built today vs what's a documented path:** the alarm cron, `db_alerts`,
`d1QueryAcross`, ULID time-ordering, the single-door discipline AND stage 1 itself
are BUILT and tested: `POST /api/tenancy/admin/move-module` (x-admin-key; table and
module names validated as strict SQL identifiers at the boundary) copies a module's
tables to a fresh database, verifies row counts BEFORE touching the source, records
the routing override in `team_module_databases`, empties the old home, and resolves
the alarm; `databaseIdsFor(teamId, module)` then answers override-first + main so
merged reads see both homes. Only the stage-2 same-table cutover script stays a
documented path until a single module outgrows a whole database (Prime Directive 1).

**Organizing many apps in Cloudflare:** Cloudflare has no folders. The base's
convention is (a) a name prefix per product — every worker, database and bucket
starts `brimba-` (a fork renames the prefix, BASE-MANUAL §5), and (b) for real
isolation, **one Cloudflare account per product** (BOOTSTRAP assumes this): separate
billing, separate limits, separate blast radius. Within one account, the prefix IS
the project grouping — search boxes in the dash filter on it.

## The base in one breath

Seven workers behind one public door. A global core DB for identity + billing, one
isolated D1 per team for its content. One gate (`teamContext → requireRight`) that
every request — UI *and* agent — passes through, so the AI can do anything the
user can and nothing they can't. A module plugs into six seams (permissions,
live-sync, activity, the screen engine, the glossary, validation); changing a
seam ripples to every module, and the machine-checked Laws catch the ripple before
it ships. Add the least code that solves the problem, reuse the existing seams,
and keep `npm run check` green.
