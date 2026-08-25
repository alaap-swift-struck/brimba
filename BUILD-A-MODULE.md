# BUILD-A-MODULE.md — how to add a module to Brimba, end to end

A **module** is one team-scoped thing users work with: a collection of records
that live in the team's own database, are gated by the role matrix, publish live
changes, log activity, and show up as a screen. `learning` and `help` are
modules. So are `member_roles`, `team_members` and `selectable_data`. This
document is the golden path for adding the next one — read it top to bottom, then
follow the checklist at the end.

It is grounded in the real code. The worked example is **Learning**
(`workers/content/**/learning.ts`, `web/components/learning-detail.tsx`), because
it exercises every layer: a per-team table, a permission row, gated CRUD, boundary
validation, an audit block, deactivate-not-delete, an activity write, `publishChange`,
a screen recipe, a bespoke detail with Overview + Activity tabs, and a count badge.

Keep the **prime directive** in view the whole way: add the *least* code that
solves the problem, and reuse the seams below. Every seam already exists — you are
filling in a module-shaped hole, not inventing plumbing.

Assume, for the walkthrough, you are adding a module called **`notes`** (a team's
shared notes). Substitute your real name everywhere you see `notes` / `note`.

---

## The shape of a module (what you will touch)

| Layer | File(s) | What you add |
|---|---|---|
| 1. Table + migration | `workers/tenancy/src/team-schema.ts` | a `CREATE TABLE`, appended as a new `TEAM_MIGRATIONS` entry |
| 2. Register + permissions | `shared/team-modules.ts` — `TEAM_MODULES`, `MODULE_LABELS`, `MODULE_RIGHTS_BY_MODULE` (+ `buildTeamSeed` in `team-schema.ts`, usually untouched) | one module key, one label, its real rights; the two default roles seed themselves |
| 3. Worker handler | `workers/content/src/{routes,lib}/notes.ts` + `index.ts` `ROUTES` | gated CRUD → validate → audit → activity → `publishChange` |
| 4. Web client + screen | `web/lib/api.ts`, `web/lib/screens.ts`, `web/lib/pages.ts`, `web/components/deep-link/shape.ts`, `web/lib/use-screen-data.ts`, `web/lib/use-screen-actions.ts`, `web/components/deep-link/module-content.tsx`, `deep-link-screen.tsx` | api wrapper, a list recipe, a nav section, a shaper, the cache-first read, the create handler, the render branches, the count wiring |
| 5. Record detail | `web/components/note-detail.tsx` | Overview + Activity tabs (Law R2) — the filename MUST equal the string you register in `RECORD_DETAIL_COMPONENTS` (the R2 check reads `web/components/<that-string>.tsx` off disk) |
| 6. Tests | the existing seam/rule tests + `shared/rules/registry.ts` | register the detail component; the tests then force you to comply |

The workers involved: **content** (`workers/content`) is the right home for a
content-shaped module (records users author). Every team-DB read/write goes through
the one REST door (`shared/workers/d1-rest.ts`); the gateway
(`workers/gateway/src/index.ts`) forwards `/api/content/*` to it. You do **not**
add a worker for a new module — you add routes to an existing one.

---

## Layer 1 — the per-team table + migration

Every team has its **own** D1 database (locked, ARCHITECTURE.md). The one master
definition of what lives inside it is `TEAM_MIGRATIONS` in
`workers/tenancy/src/team-schema.ts`. A new table is a **new entry appended to that
array** — never an edit to an existing migration (existing databases have already
run them). The runner stamps each applied version into the per-team `_migrations`
table and only applies what's missing.

Look at how Learning did it (migration `0004_modules`, team-schema.ts):

```sql
CREATE TABLE learning (
  id TEXT PRIMARY KEY,
  category TEXT,
  content_title TEXT NOT NULL,
  content_description TEXT,
  content_type TEXT,
  content_link TEXT,
  content_body TEXT,
  sequence INTEGER NOT NULL DEFAULT 0,
  is_required INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT,
  deactivated_at TEXT, deactivator_id TEXT, deactivator_email TEXT, deactivator_name TEXT
);
```

The **shape rules**, every one visible above and non-negotiable:

- **`id TEXT PRIMARY KEY`** — a ULID (`shared/workers/id.ts`). Every row everywhere
  gets one, so rows can move between databases during sharding without collisions.
- **Three audit blocks** — `created_*`, `updated_*`/`editor_*`, `deactivated_*`/
  `deactivator_*` (actor id + email + name + timestamp). This is what powers the
  Overview tab and satisfies "keep an audit block on every write" (CLAUDE.md).
- **Deactivate, never delete** — the `deactivated_at` column *is* your delete. There
  is no `DELETE`. Retiring a row sets `deactivated_at`; reactivating clears it. Data
  and history survive (ARCHITECTURE.md §4).
- **Indexes** for the columns you'll filter/join on (e.g. Learning's
  `learning_progress` has `UNIQUE (learning_id, user_id)`; Help has
  `idx_help_status`).

Append your migration. The version prefix is monotonic:

```ts
// workers/tenancy/src/team-schema.ts — appended to TEAM_MIGRATIONS
{
  version: "0006_notes",
  sql: `
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT,
  category TEXT,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT,
  deactivated_at TEXT, deactivator_id TEXT, deactivator_email TEXT, deactivator_name TEXT
);
CREATE INDEX idx_notes_category ON notes (category);
`,
},
```

**How it rolls out.** A *brand-new* team runs every migration on creation
(`applyTeamSchema`, `workers/tenancy/src/lib/teams.ts`). *Existing* teams get it
from the migration robot: `POST /api/tenancy/admin/migrate-teams`
(`workers/tenancy/src/routes/admin.ts`), guarded by `ADMIN_KEY`, which finds
every ready team, diffs its `_migrations` against `TEAM_MIGRATIONS`, and applies
the gap. After you ship a new migration, the owner runs migrate-teams once. That is
the whole story — no per-table binding, no wrangler migration file.

---

## Layer 2 — register the module + its permissions

**Permissions are the spine.** A module the matrix doesn't know about can't be
gated, so the server would refuse every request. Registering is three edits, all in
**`shared/team-modules.ts`**, all beside each other. (`team-schema.ts` re-exports
`TEAM_MODULES` so tenancy code keeps one habitual import site, but the list itself
lives in shared: data-ops builds the import and export permission columns from the
same file, so the matrix a Roles screen shows and the matrix a CSV carries can
never drift apart.)

### 2a. Add the module key

```ts
// TEAM_MODULES (shared/team-modules.ts) — one row per module
export const TEAM_MODULES = [
  "teams", "team_members", "member_roles", "learning", "help",
  "selectable_data", "agent",
  "notes",                       // ← new
] as const
```

### 2b. Give it a matrix label

`MODULE_LABELS` is keyed off `TEAM_MODULES`, so TypeScript **forces** you to add a
label — you cannot register a module without a human-readable row for the Roles
screen:

```ts
const MODULE_LABELS: Record<(typeof TEAM_MODULES)[number], string> = {
  // …
  notes: "Notes",              // ← new; shown as a row in the permission matrix
}
```

`TEAM_MODULE_CATALOG` (the matrix rows) is derived from these two — one source for
both the worker gate and the Roles UI.

### 2c. Say which rights the module actually has

`MODULE_RIGHTS_BY_MODULE` (same file) is keyed off `TEAM_MODULES` too, so
TypeScript forces this edit as well. It narrows the four rights down to the ones a
door really opens on. A right left out renders "—" in the grid, instead of an off
switch that enforces nothing:

```ts
const MODULE_RIGHTS_BY_MODULE: Record<(typeof TEAM_MODULES)[number], readonly ModuleRight[]> = {
  // …
  notes: ["read", "create", "edit", "delete"],   // ← new; list only the rights a door gates on
}
```

The rule for editing it: a right belongs in a module's list when a door opens on it
(`requireRight` / `gated` / `gatedBody` with that pair), or when a screen recipe's
`gate` genuinely hides something on it. Ship a door for a right that isn't listed
here and the door is gated by a switch nobody can turn on.

### 2d. Seed the two default roles

`buildTeamSeed` (team-schema.ts) writes the starter permission sheet every new
team gets: **Admin** (full) and **Viewer** (read-only). The loop already iterates
`TEAM_MODULES`, so your module is seeded automatically — Admin gets
`read/create/edit/delete = 1,1,1,1`, Viewer gets `1,0,0,0`. You only touch this if
your module needs a *different* Viewer default (Learning left it as read-only;
`agent` is the one special case — everyone may use it, so Viewer gets `1,1,0,0`).
For a normal module, do nothing here.

The four rights are the **tall permission sheet** `role_permissions`
(`role_id`, `module`, `can_read`, `can_create`, `can_edit`, `can_delete`, with
`UNIQUE (role_id, module)`). Future modules add **rows, never columns**.

> After this layer, the module exists and is gate-able, but nothing reads or writes
> it yet.

---

## Layer 3 — the worker handler

Content modules follow one handler shape, and Learning is the template. Two files:
`lib/notes.ts` (the CRUD + business rules, unit-testable, no HTTP) and
`routes/notes.ts` (the thin HTTP handlers: open context → gate → validate →
delegate to lib → publish → return). Then one line per route in `index.ts`.

### 3a. The lib: CRUD through the one door

`lib/learning.ts` is the pattern. Team-DB access is **only** through
`shared/workers/d1-rest.ts`:

- **Reads** use `d1Query(cfg, guard.databaseId, sql, params)` — parameterised, so
  values are bound, not interpolated.
- **Writes** use `d1ExecScript(cfg, guard.databaseId, script)` — the REST API
  forbids params on multi-statement scripts, so you build the SQL with **`sqlString(...)`**
  (single-quote doubling; it also `String()`-coerces any non-string so the one door
  never 500s). Never string-concatenate a raw value into SQL.

A create, distilled from `createLearning` (learning.ts):

```ts
export async function createNote(
  cfg: D1Rest, guard: MemberGuard, actor: Actor, input: NoteInput
): Promise<string> {
  const title = requireText(input.title, "Title", TEXT_LIMITS.short)     // ← boundary validation
  const body  = optionalText(input.body, "Body", TEXT_LIMITS.long) ?? null
  const category = optionalText(input.category, "Category", TEXT_LIMITS.short) ?? null

  const id = ulid()
  const now = new Date().toISOString()
  await d1ExecScript(cfg, guard.databaseId,
    `INSERT INTO notes (id, title, body, category, created_at, creator_id, creator_email, creator_name)
     VALUES (${sqlString(id)}, ${sqlString(title)}, ${sqlString(body)}, ${sqlString(category)},
             ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`)

  await logActivity(cfg, guard.databaseId, actor, {                       // ← activity write
    type: "Note created",
    description: `${actor.name} added the "${title}" note`,
    relatedTable: "notes", relatedRowId: id,
  })
  return id
}
```

**Deactivate, not delete** — copy `setLearningActive` (learning.ts): one
`UPDATE` that either stamps the `deactivator_*` block + `deactivated_at`, or clears
them to reactivate. Never write a `DELETE`. Fetch-or-404 first (`learningOrThrow`,
learning.ts) so a bad id is a clean 404, not a silent no-op.

Return rows shaped into a **shared type** (`shared/types.ts`), not raw DB columns —
`toLearning` (learning.ts) maps `content_title → title`, `deactivated_at === null
→ active`, etc. The client and the AI agent both consume the shared type. Add
`export type Note = { … }` to `shared/types.ts` alongside `Learning`.

### 3b. Boundary validation — bad input is a 400, never a 500 (Law)

Never trust the request body. Route bodies are `as`-cast, so a field typed `string`
can arrive as a number, array, object, or a multi-MB string, or carry NUL bytes D1
rejects. Use `shared/workers/validate.ts` at the top of every write:

- `requireText(value, field, max)` — required; throws a `GuardError(400,…)` on a
  non-string, blank, or over-long value.
- `optionalText(value, field, max)` — null/blank → `undefined`; otherwise validated.
- `TEXT_LIMITS` — `short: 200` (titles/labels), `link: 2048`, `long: 20000`
  (bodies/descriptions), `message: 10000` (chat).

Both strip NULs, trim, cap length, and throw the `GuardError` the worker's central
catch maps to a clean 400. This seam is **locked** by
`workers/content/test/validate.test.ts`.

### 3c. The route: open → gate → validate → publish

The handler is thin. Every team-scoped handler opens with `teamContext` and gates
with `requireRight` (`shared/workers/gating.ts`). This is
`postCreateLearning` (routes/learning.ts):

```ts
export async function postCreateNote(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)      // who + team + db, or throws
  await requireRight(cfg, guard, "notes", "create")                  // the permission gate
  const body = (await request.json().catch(() => ({}))) as NoteInput
  requireText(body.title, "Title", TEXT_LIMITS.short)                // 400 on bad input
  const id = await createNote(cfg, guard, actor, body)
  await publishChange(env.REALTIME, guard.teamId, "notes", id, "add") // ← LAW R1: live-sync
  return json({ notes: await listNotes(cfg, guard) })
}
```

`teamContext` (gating.ts) returns `{ user, actor, cfg, guard }`: it asks the auth
worker who you are (401 if signed out), reads your active team (409 if none),
confirms you're an **active member** of it (403 `not_member`, gating.ts), and
hands back the guard carrying your `roleId` + the team's `databaseId`.
`requireRight` (gating.ts) reads the tall sheet and throws `403 forbidden` if
your role lacks that right on `"notes"`. The check is on the **real module key** —
security is never just hiding UI, and the **AI agent goes through these same gated
endpoints** as the signed-in user, so it can never exceed your rights.

Map right → HTTP verb consistently, exactly as Learning does:

| Action | Right | Route |
|---|---|---|
| list / read one | `read` | `GET /api/content/notes` |
| create | `create` | `POST /api/content/notes` |
| edit | `edit` | `POST /api/content/notes/update` |
| deactivate / reactivate | `delete` | `POST /api/content/notes/active` |

Throw, don't catch: any rule failure is a `throw new GuardError(status, code, msg)`
(gating.ts); the worker's central `try/catch` (`index.ts`) turns it into the
response. You never build error responses by hand inside a handler.

### 3d. The live-sync law (R1) — `publishChange`

**Every mutation publishes a live change.** After a successful write, call
`publishChange(env.REALTIME, guard.teamId, resource, id, op)`
(`shared/workers/realtime.ts`). The payload carries only `{resource, id, op}` —
**never row data** — so every open screen re-pulls *just that one row* through the
permission-checked endpoint (row-level live-sync; nothing can leak). `op` is
advisory (`add` | `edit` | `remove`); the client re-pulls and decides keep-or-drop.
Publishing is best-effort — a live-layer hiccup never breaks the write. For a bulk
endpoint, publish **one ping per changed row** (see `postBulkSetLearningActive`),
not one list-wide ping. (The only sanctioned id-less coarse pings are CSV import
and the `agent_usage` quota meter — listed in CACHING.md; a new module doesn't
add one.)

### 3e. Register the routes

Add a line per route to the `ROUTES` table in `workers/content/src/index.ts`.
Every non-GET route is **classified** — `mutation` (must publish) or `housekeeping`
(the reviewed deny-list of writes that intentionally broadcast nothing, e.g. the R2
file upload). This classification is not decoration: `publish-seam.test.ts` reads it
and fails CI if a `mutation` handler's source doesn't contain a `publishChange` call.

```ts
"GET  /api/content/notes":        { handler: getNotes,        kind: "read" },
"POST /api/content/notes":        { handler: postCreateNote,  kind: "mutation" },
"POST /api/content/notes/update": { handler: postUpdateNote,  kind: "mutation" },
"POST /api/content/notes/active": { handler: postSetNoteActive, kind: "mutation" },
```

The gateway already forwards `/api/content/*` to this worker
(`workers/gateway/src/index.ts`) — no gateway change needed.

> **Optional: file uploads.** If your module attaches files (as Learning does),
> follow `postUploadLearningFile` (routes/learning.ts): accept a base64 data
> URL, `parseUploadDataUrl` it with a byte cap, `env.<BUCKET>.put(\`${teamId}/${ulid()}\`, …)`,
> and return a `/media/<module>/…` URL. It's classified **`housekeeping`** (it
> writes a file, not a record — no row to patch) and needs a matching R2 bucket
> binding + a gateway serving branch (gateway index.ts).

---

## Layer 4 — the web side

The web app never fetches ad hoc. All four pieces below are small and formulaic.

### 4a. The api client wrapper (`web/lib/api.ts`)

Add your calls to the `content` namespace. Same-origin `/api` calls; the shared
`api<T>()` helper throws a typed `ApiFailure` on non-OK. Mirror the Learning block
(api.ts):

```ts
export const content = {
  // …existing learning/help…
  notes:       () => api<{ notes: Note[] }>("/api/content/notes"),
  notesOne:    (id: string) =>
    api<{ notes: Note[] }>(`/api/content/notes?id=${enc(id)}`).then((r) => r.notes[0] ?? null),
  createNote:  (input: Partial<Note>) =>
    api<{ notes: Note[] }>("/api/content/notes", post(input)),
  updateNote:  (input: Partial<Note> & { id: string }) =>
    api<{ notes: Note[] }>("/api/content/notes/update", post(input)),
  setNoteActive: (id: string, active: boolean) =>
    api<{ notes: Note[] }>("/api/content/notes/active", post({ id, active })),
}
```

### 4b. The nav entry + the count badge (`web/lib/pages.ts`, Law R8)

Add a `TeamSection` (pages.ts). `module` is the read-right that reveals it;
`segment` is the URL segment; `placement` is `"sidebar"` (a first-class page, like
Learning/Help), `"tab"` (an admin section in the team tab strip), or `"contextual"`
(reached from a button). Learning/Help are `"sidebar"`.

**Law R8 — the count badge is derived.** Any `placement:"tab"` section that leads
with a collection **must** declare a `countCacheKey` — the cache-key prefix whose
loaded rows *are* the badge count, so a new tab can't ship a forgotten or
hand-listed count. Sidebar sections don't need one.

```ts
{ key: "notes", title: "Notes", module: "notes", segment: "notes",
  placement: "sidebar", countCacheKey: "notes" },
```

**Widen the `TeamSection["key"]` union first.** `key` in `pages.ts` is a CLOSED
hand-maintained union (`"overview" | "members" | …`), so adding `{ key: "notes", … }`
is a TypeScript error until you add `"notes"` to that union — `npm run check` fails at
the `web` typecheck otherwise. Add your key to the union, then add the section.

Also give the concept one icon in `CONCEPT_ICON` (pages.ts) — the single icon
vocabulary, reused at page/tab/button level. If it's a top-level URL like
`/notes`, add `"notes"` to `TOP_LEVEL_MODULES` (`web/components/deep-link/route.ts`)
and the gateway's top-level shell loop (gateway index.ts).

**Importable? Declare a target + a sample.** If your module accepts CSV import, add a `TargetDef` in `workers/data-ops/src/lib/targets.ts` (columns, the gated create endpoint, optional `references`, a `sample` example row, and `exportPath` if the module also has a CSV export door) — see AGENTIC-IMPORT.md. The downloadable sample file is then automatic (tests enforce every target yields one AND that the sample itself imports cleanly), and — because the agent's capability brief is generated from the same catalog (Law R9) — the assistant automatically knows your module can be imported/exported the moment you declare it. Nothing else to teach it.

**Add your product words to the glossary (Law R6).** Any new term your UI shows —
`invoices`, `purchase order`, `SKU` — goes in `shared/glossary.ts` (one term, one
clear ≤140-char definition), and UI copy must use exactly that word, never a synonym.
`web/test/rules.test.ts` checks the glossary is well-formed (`glossary-wellformed`).

### 4c. The screen recipe (`web/lib/screens.ts`)

A **list** is described as *data* — a `ScreenRecipe` the library engine renders. Copy
`learningListRecipe` (screens.ts). `listCollection(...)` turns on client-side
search over the shaped columns and adds a filter bar per facet:

```ts
export const notesListRecipe: ScreenRecipe = {
  type: "list", display: "list", surface: "none",
  binding: { module: "notes" },
  gate: { module: "notes", right: "read" },
  fields: [field("name", "Note"), field("detail", "Details")],
  actions: [],
  collection: listCollection("No notes yet.", "Search notes…", [
    { field: "category", label: "Category", control: "select" },
    { field: "state",    label: "Status",   control: "select" },
  ]),
}
```

Register it in `BASE_RECIPES` under `"notes.list"` (screens.ts), and map the URL
segment to its permission module in `MODULE_PERMISSION` (screens.ts) — for a
content module the segment *is* the module: `notes: "notes"`. Each facet `field`
must be a real column on the *shaped* rows (next step). `resolveRecipe(key)` is a
plain lookup in `BASE_RECIPES`, so the recipe you register here is the one every
team gets — there is no per-team override (that subsystem was removed on
2026-08-25; see UI-CONVENTIONS.md §2a). Changing a screen means changing its
recipe and shipping.

> The **detail** screen for Learning has no engine block (its Article body + Done
> toggle are bespoke), so it's a host-composed component, not a recipe — see Layer 5.
> A purely metadata detail *can* be a recipe (see `memberDetailRecipe`, screens.ts,
> whose `tabs` carry the Overview + Activity blocks as data).

### 4d. The shaper (`web/components/deep-link/shape.ts`)

Pure functions turn the loaded shared-type rows into the flat rows the recipe reads.
Copy `shapeLearningList` (shape.ts). `name`/`detail` are what the row renders;
any extra key is a **facet column** the filter engine reads (it must match the
recipe's facet `field`):

```ts
export function shapeNotesList(items: Note[]): ScreenData {
  return {
    rows: items.map((n) => ({
      id: n.id,
      name: n.active ? n.title : `${n.title} (inactive)`,   // inactive stays visible (deactivate-not-delete)
      detail: n.category || "—",
      category: n.category || "—",                            // facet column
      state: n.active ? "Active" : "Inactive",                // facet column
    })),
  }
}
```

### 4e. Wire it into the host

The `/t/*` tree is backed by one shell in three parts, and a new module touches all
three. `web/lib/use-screen-data.ts` holds the cache-first reads;
`web/components/deep-link/module-content.tsx` is the render switch (the list branch
and detail branch for each module); `web/components/deep-link-screen.tsx` is the
routing, state, effects and dialogs host that ties them together. Mirror Learning
through each one — and refer to things by name, not by line number, because the
line moves and the name does not.

- **Cache-first read** with `useCached(key, fetcher)` (`web/lib/store.ts`), added to
  `useScreenData`: it returns cached data instantly and revalidates in the
  background, and a live ping patches the one row in place. Key by team so a team
  switch re-fetches, and fetch through a `listFetch` entry
  (`web/lib/live-resources.ts`) so the collection's exact `total:` sidecar is primed
  by the same load:

  ```ts
  const notesQ = useCached(enabled && module === "notes" ? `notes:${teamId}` : null,
    () => listFetch.notes(teamId as string))
  ```

  The cache-key prefix (`notes`) is exactly the `countCacheKey` from 4b. The number
  on the badge, though, is **not** the loaded rows' length — a capped list's length
  is a ceiling, not a total (Law R16). Add the exact total your list door returns to
  `totalByCacheKey` (deep-link-screen.tsx); the badge renders it through
  `formatCount`.

- **List branch** (module-content.tsx) — shape, apply `withDataDrivenCollection`
  (hides dead search/facets when there are no rows), render `<ScreenRenderer>`
  inside a `SectionWithCreate` gated by `can("notes", "create")`.

- **Detail branch** (module-content.tsx) — delegate to your bespoke component:
  `if (module === "notes") return <NoteDetailScreen teamId={teamId} noteId={recordId} />`.

- **Create handler** — a small `createNote` callback in
  `web/lib/use-screen-actions.ts` that calls the api, folds the ONE returned row
  into the cache with `applyCreated({ listKey, created, total, totalCacheKey })`,
  and returns `created?.id` so `FormShell` opens the new record (R22). See
  `createLearning`, which is the exact template.

**The cache/live contract in one line:** the mutating door returns the affected row
(R21 for a create, R23 for an edit or a status move) and the actor's client patches
that one row into its cache; other devices get the `publishChange` ping and re-pull
the one changed row. Nobody refetches the whole collection on a change. (CACHING.md.)

---

## Layer 5 — the record detail: Overview + Activity tabs (Law R2)

**Every record-detail screen exposes Overview + Activity tabs**, via the library
`TabsView` + `ActivityFeed`. For a bespoke detail this is on you to render;
`learning-detail.tsx` is the exact template.

Three data reads, all cache-first (learning-detail.tsx):

```ts
const learningQ  = useCached(`learning:${teamId}`, () => content.learning().then(r => r.learning))
const activityQ  = useCached(`activity:record:learning:${learningId}`,
                    () => tenancy.recordActivity("learning", learningId))   // ← the ONE generic path
const selectableQ = useCached(`selectable:${teamId}`, () => tenancy.selectable().then(r => r.values))
```

The activity read is the **one generic (table, id) path** — Law R5. You do **not**
write a per-module history query; `tenancy.recordActivity("notes", id)`
(`web/lib/api.ts`) reads it, gated server-side by the module's read right.

The Overview tab is a `DescriptionList` built from `auditItems(...)`
(`web/lib/audit-overview.ts`) — the shared audit block (created by/when, edited
by/when, status) that keeps Overviews consistent across the app. The tabs render
through the library `TabsView` (learning-detail.tsx):

```tsx
const tabsConfig = { ...defaultTabsConfig, variant: "line", tabs: [
  { value: "overview", label: "Overview", icon: "info",    badge: "", badgeVariant: "" },
  { value: "activity", label: "Activity", icon: "history", badge: "", badgeVariant: "" },
]}
// renderPanel: overview → <DescriptionList items={overviewItems}/>,
//              activity → <ActivityFeed items={activityItems}/>
```

After an edit or (de)activate, prime the list cache with the returned rows and
re-pull the record's activity so the Activity tab reflects the new row
(`invalidateActivity`, learning-detail.tsx). Action buttons carry their lucide
icon (CLAUDE.md): edit = `Pencil`, deactivate = `Power`, destructive actions get the
red colour + a confirm.

> Note the two R2 flavours: a **recipe** detail (like `memberDetailRecipe`) carries
> the tabs as recipe *data* and gets them for free; a **bespoke** detail (Learning,
> Help, and your Notes) must render `TabsView` + `ActivityFeed` itself and is checked
> by the `record-detail-tabs` test.

---

## Layer 6 — the tests each Law makes you write

The laws are machine-checked; they read source off disk, so you can't fool them. You
mostly don't *write* tests — you make existing ones pass, and register your module
where a test looks for it.

| Law | What it checks | What you do |
|---|---|---|
| **R1** publish-seam | `workers/content/test/publish-seam.test.ts` reads `ROUTES` + handler source: every `mutation` must contain a `publishChange` call; non-GET routes must be classified. | Classify each route (3e) and actually publish (3d). A `housekeeping` route (e.g. upload) must be added to the test's reviewed `HOUSEKEEPING` set. |
| **R2** record-detail-tabs | `web/test/rules.test.ts` reads each name in `RECORD_DETAIL_COMPONENTS` and asserts the file contains `TabsView` + `ActivityFeed`. | Add `"note-detail"` to `RECORD_DETAIL_COMPONENTS` in `shared/rules/registry.ts`; the test then forces Layer 5. |
| **R3** no-handrolled-toggles | No component fakes a tab strip with `variant={x === y ? …}`. | Use `TabsView` for any tab strip (Learning's Articles/Team-progress does). |
| **R4/R7** forms | Every dialog in `FORM_DIALOGS` imports `FormShell` and `useFormDraft`. | If you add a `note-form-dialog`, add it to `FORM_DIALOGS` (registry.ts) and build it on `FormShell` + `useFormDraft`. |
| **R5** generic-activity-path | The activity read has a generic `record` scope; the web reads via `recordActivity`. | Read history only via `tenancy.recordActivity(...)` (Layer 5). No new SQL. |
| **R8** tab-counts-derived | Every `placement:"tab"` collection section declares a `countCacheKey`, derived generically. | Declare `countCacheKey` (4b) — or, if your tab isn't a collection, add a reviewed `TAB_COUNT_EXCEPTIONS` line (registry.ts). |
| **boundary** validate | `workers/content/test/validate.test.ts` locks `requireText`/`optionalText`. | Validate every write at the top (3b). Bad input → 400, never 500. |

Also add a plain unit test for your lib's business rules (see how Learning's
pick-or-create and deactivate paths are exercised) — the lib functions are pure and
HTTP-free precisely so this is easy.

Then, before you commit: **`npm run check`** (TypeScript across every workspace + the
full test suite, including the rule + seam tests). It is the gate. A broken law turns
it red.

---

## The copy-paste checklist

```
LAYER 1 — table + migration  (workers/tenancy/src/team-schema.ts)
[ ] Append a NEW entry to TEAM_MIGRATIONS (version "NNNN_<module>"); never edit an old one
[ ] Table has: id TEXT PRIMARY KEY (ULID); the 3 audit blocks (created_/editor_/deactivator_)
[ ] Deactivate-not-delete: a deactivated_at column, NO DELETE anywhere
[ ] Indexes for the columns you filter/join on

LAYER 2 — register + permissions  (shared/team-modules.ts)
[ ] Add the module key to TEAM_MODULES
[ ] Add its label to MODULE_LABELS (TS forces this)
[ ] Add its real rights to MODULE_RIGHTS_BY_MODULE (TS forces this too) — only rights a door gates on
[ ] buildTeamSeed (team-schema.ts) already seeds it (Admin 1111 / Viewer 1000) — only touch for a special Viewer default

LAYER 3 — worker handler  (workers/content/src/{lib,routes}/<module>.ts + index.ts)
[ ] Add the shared type to shared/types.ts; shape DB rows → it (toX mapper)
[ ] lib CRUD via d1Query (reads) / d1ExecScript + sqlString (writes) + ulid ids
[ ] Boundary-validate every write: requireText / optionalText + TEXT_LIMITS → GuardError(400)
[ ] Audit block on every write (actor id/email/name + timestamp)
[ ] Deactivate/reactivate handler (stamp/clear deactivator_*), fetch-or-404 first
[ ] logActivity(...) with relatedTable/relatedRowId on state changes
[ ] Route handlers: teamContext → requireRight(module, right) → validate → lib → publishChange → json
[ ] CREATE door returns the CREATED ROW, never the list: json({ created: await one<Module>(...), total }) — R21
[ ] EDIT / STATUS / DEACTIVATE door returns the AFFECTED ROW, never the list: json({ updated, total? }) — R23
[ ] publishChange(env.REALTIME, teamId, "<module>", id, op) after EVERY mutation (R1); one ping per row for bulk
[ ] Add each route to ROUTES with kind read | mutation | housekeeping

LAYER 4 — web client + screen
[ ] web/lib/api.ts: add the content.<module> wrappers
[ ] web/lib/pages.ts: add the TeamSection (+ countCacheKey if a collection tab, R8) + CONCEPT_ICON
[ ] web/lib/screens.ts: add <module>ListRecipe, BASE_RECIPES["<module>.list"], MODULE_PERMISSION
[ ] web/components/deep-link/shape.ts: add shape<Module>List (name/detail + facet columns)
[ ] web/lib/use-screen-data.ts: useCached read (key "<module>:${teamId}") via a web/lib/live-resources.ts listFetch entry
[ ] web/components/deep-link/module-content.tsx: the list branch + the detail branch
[ ] deep-link-screen.tsx: add the door's exact total to totalByCacheKey (R8 picks the tab, R16 owns the number)
[ ] web/lib/use-screen-actions.ts: create handler folds the created row in with applyCreated + returns created?.id (R21/R22)
[ ] (a SIDEBAR section? R20 — THREE lists, all three or it 404s/reloads:)
      [ ] web/app/<segment>/[[...rest]]/page.tsx        — or /<segment> 404s in a fresh tab
      [ ] MODULE_SHELLS in workers/gateway/src/index.ts — or /<segment>/<id> 404s in a fresh tab
      [ ] TOP_LEVEL_MODULES in web/components/deep-link/route.ts — or soft nav RELOADS the page
[ ] After an edit/status/deactivate, fold the returned row in via applyUpdated(...) — a null row means drop it (R23)

LAYER 5 — record detail  (web/components/<module>-detail.tsx)
[ ] Bespoke detail renders TabsView + Overview (DescriptionList via auditItems) + Activity (ActivityFeed) — R2
[ ] Activity via tenancy.recordActivity("<module>", id) — the ONE generic path (R5); no new history SQL
[ ] Actions carry lucide icons (Pencil edit, Power deactivate); destructive = red + confirm

LAYER 6 — tests + ship
[ ] Register "<module>-detail" in RECORD_DETAIL_COMPONENTS (shared/rules/registry.ts) — R2 check
[ ] (form dialog?) register in FORM_DIALOGS; build on FormShell + useFormDraft — R4/R7
[ ] (form dialog?) decide R22: CREATE_OPENS_RECORD (pass opensRecord + `return createdId`,
      and guard the close with `if (!createdId)`) OR a reasoned CREATE_OPENS_RECORD_EXEMPT line
[ ] Add a unit test for the lib's business rules
[ ] npm run check is GREEN

AFTER SHIP
[ ] Owner runs POST /api/tenancy/admin/migrate-teams (x-admin-key) to roll the migration to existing teams
```

---

## Bulk: what LAW R24 asks of you

For every single-record write door you add, decide one thing and write it down in
`shared/workers/bulk-doors.ts`, keyed by your handler's name: either it has a
bulk twin, or it has a reason it cannot. Deciding is mandatory; choosing "no
twin" is a perfectly good answer and the check accepts it, as long as the reason
is real. If you add a twin you must also declare its ORDERING. `together` means
the rows are independent and could run in any order — a flag flip, a status move,
anything where row four does not care what row three did. `in-order` means each
row's result is computed from what the previous row left behind: a running
balance, a sequence number, a queue position. Get that wrong in the `together`
direction and you get a ledger where every line is individually plausible and the
total is wrong, which nobody can untangle afterwards. The check proves you
decided, and proves an `in-order` twin never reaches `Promise.all` — but it
cannot prove a `together` twin is really independent, because that needs the
meaning of your code rather than its shape. So an `in-order` twin also owes a
behavioural test in the shape of `workers/tenancy/test/bulk-ordering.test.ts`:
run it with rows whose correct answer depends on sequence, and assert the final
state.

## Anti-patterns (each breaks a Law or a locked decision)

- **A `DELETE` statement.** There is no delete — deactivate. (ARCHITECTURE.md §4.)
- **Raw string interpolation into SQL.** Use `d1Query` params or `sqlString(...)`.
- **A mutation with no `publishChange`.** Fails `publish-seam.test.ts` (R1).
- **`body.field.trim()` without `requireText`/`optionalText`.** A non-string 500s;
  bad input must be a 400 (locked by validate.test.ts).
- **A detail without Overview + Activity tabs.** Fails `record-detail-tabs` (R2).
- **A create door returning `list<Module>()`.** Fails `create-returns-row` (R21) —
  return the created row and its exact total; the client patches that one row in.
- **A sidebar entry with no page behind it.** Fails `static-destinations` (R20).
  It will look perfect until somebody opens the url in a new tab.
- **A per-module activity query.** Read history only via the generic `record` path (R5).
- **A collection tab with a hand-listed count.** Declare a `countCacheKey` (R8).
- **Refetching the whole list on a change.** Row-level live-sync only. (CACHING.md.)
- **A new worker for a new module, or editing `@swift-struck/ui`.** Add routes to an
  existing worker; the library is lego you assemble, not fork. (CLAUDE.md.)
```

## The hardening checklist (R13–R26 — a new module must satisfy these)
Beyond the golden path, a module that ships without these turns the build red:

- **Import story (R13):** declare a `TargetDef` in `workers/data-ops/src/lib/targets.ts`
  OR add a reasoned `CATALOG_EXEMPT` line in `shared/rules/registry.ts`.
- **Bounded reads — or real paging (R14):** every `list*` in the module's lib
  carries a hard cap from `shared/workers/limits.ts` with its comment. Ask first
  whether the collection GROWS with ordinary use (rows accumulate and are never
  curated away — tickets, orders, events, a feed). If it does, it must PAGE
  instead: add it to `GROWING_COLLECTIONS` in the registry, page by key through
  `shared/workers/paging.ts`, answer through `pagedJson` (rows + exact total +
  `hasMore` + an opaque cursor), and render `<LoadMore>` on its screen — the
  check verifies all three ends, including that the client can reach page two.
  A bounded collection (roles, members, dropdown values) may still just cap.
- **Live listener (R15):** add a `TEAM_RESOURCES` row-level entry in
  `web/lib/live-resources.ts` (or a `SIMPLE_INVALIDATIONS` / reasoned `DEAF_EXEMPT`
  entry) for every resource the module publishes; a paged screen calls
  the same cache key the shell patches (`live-resources` → `use-screen-data`).
- **Count (R16):** the list door returns an exact `total`; the screen renders the
  badge through `formatCount` and, if it's a sidebar page, a `CollectionHeading`.
- **Idempotent transitions (R17):** any deactivate/reactivate/status write carries
  the current-status predicate + `RETURNING id` and publishes only when a row moved.
- **Activity gate (R18):** every `relatedTable` the module writes is in
  `ACTIVITY_GATE_MAP` (or a pinned `ACTIVITY_TABLE_EXEMPT` reason).
- **Filter parity (R19):** any GET agent/MCP tool exposes + forwards every param
  its door parses.
- **Reachable in a fresh tab (R20):** a SIDEBAR section needs all THREE — its
  `web/app/<segment>/[[...rest]]/page.tsx`, an entry in the gateway's
  `MODULE_SHELLS`, and one in `TOP_LEVEL_MODULES`. Each lives in a different
  workspace and each failure is invisible from inside the app: clicking the nav
  always works, because the client router never leaves the page. You find out
  when somebody pastes the url — or, for the third one, when the whole shell
  reloads mid-session. The check derives all three from the nav registries.
- **A create returns the created ROW (R21):** `{ created, total }`, not the
  collection — and the client patches it in with `applyCreated`. Derived from the
  `create` gate, so your door is covered the moment it is gated.
- **A create through a form OPENS the record (R22):** pass `opensRecord` to
  `FormShell`, `return createdId` from the dialog's submit, and guard its close
  with `if (!createdId)` — the navigation IS the close. If the table genuinely
  shouldn't open (an accessory row with no detail screen), say so in
  `CREATE_OPENS_RECORD_EXEMPT` with the reason.
- **A mutation returns the affected ROW (R23):** every edit, status and deactivate
  door answers `{ updated, total? }` — never the collection. The client folds it in
  with `applyUpdated`; a NULL row is the answer, not a miss, and means the record
  left the list, so drop it. Derived from the `edit` and `delete` gates, so your
  doors are covered the moment they are gated. A count (`{ updated, skipped }` from
  a bulk) or a bare `{ ok: true }` is fine — what is banned is the collection.
- **A bulk twin, or a written reason (R24):** every single-record write door either
  has a bulk twin or says in `shared/workers/bulk-doors.ts` why it cannot — and
  every twin declares whether its rows may run TOGETHER or must run IN ORDER.
  Deciding is what's mandatory: a door missing from that file fails the check.
  Say IN ORDER when a row's result depends on the row before it.
- **A whole life in the activity table (R25):** created, edited, deactivated,
  reactivated — a master record is never hard-deleted, so deactivation is death and
  it is logged like the rest. The rule is stated in exactly one place,
  `shared/workers/activity.ts`; point at it rather than restating it. The table is
  append-only — nothing in the request path may update or delete an activity row.
- **The name stays sweepable (R26):** anything your module ships that carries the
  product name must be a file `scripts/fork.mjs` already rewrites, so a fork renames
  the whole base in one command and `npm run check` stays green. A file the sweep
  can't reach needs the sweep taught its type, not an excuse.
