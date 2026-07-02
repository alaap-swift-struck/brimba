# CONVENTIONS.md — code + comment conventions

The house style of the Brimba server. This is the *how we write code here* companion
to [ARCHITECTURE.md](ARCHITECTURE.md) (the locked decisions) and [RULES.md](RULES.md)
(the machine-checked laws). Everything below is grounded in code that already exists —
where a rule has a canonical file, it's named. A new developer (or an AI agent like
Claude Code) should be able to read this once and write a new worker route that looks
like it was always here.

The prime directive sits above every convention: **stay lean**. This codebase is
deliberately small and well-layered. Add the least code that solves the problem, reuse
the existing seams, and don't introduce a dependency, a worker, a table, or an
abstraction you don't need. **"Too much code" is a defect** — a bloated diff fails the
`lean_mean` ship gate the same way a broken test fails `npm run check`.

---

## 1 · The worker handler shape

Every domain worker (`auth`, `tenancy`, `content`, `data-ops`, `realtime`, `gateway`)
has the **same skeleton**. Once you've read one, you've read them all. The canonical
example is `workers/content/src/index.ts`.

### The switchboard: `index.ts` is a `ROUTES` table + one try/catch

`index.ts` does exactly two things — map each route to a handler, and centrally turn
thrown errors into clean responses. It contains **no business logic**.

```ts
// workers/content/src/index.ts
type RouteKind = "read" | "mutation" | "housekeeping"
type Handler = (request: Request, env: Env) => Promise<Response>

export const ROUTES: Record<string, { handler: Handler; kind: RouteKind }> = {
  "GET  /api/content/learning":         { handler: getLearning,        kind: "read" },
  "POST /api/content/learning":         { handler: postCreateLearning, kind: "mutation" },
  "POST /api/content/learning/update":  { handler: postUpdateLearning, kind: "mutation" },
  "POST /api/content/learning/upload":  { handler: postUploadLearningFile, kind: "housekeeping" },
  // …
}
```

The route key is the literal `"METHOD /path"` string, so dispatch is a single map
lookup — no router library, no regex, no path params in the door (ids arrive as
`?id=` query params or in the JSON body). `export const ROUTES` is exported **on
purpose**: the seam test (`test/publish-seam.test.ts`) reads it straight off disk.

### Route kinds — the can't-forget classifier (Law R1)

Every route carries a `kind`. This is not decoration; it is the structural guarantee
that live-sync can't be silently skipped:

| kind | meaning |
|------|---------|
| `read` | a GET; changes nothing, broadcasts nothing. |
| `mutation` | changes state → **must** broadcast a change ping (`publishChange` / `publishUserChange`). |
| `housekeeping` | the reviewed deny-list: a write that intentionally broadcasts nothing (a private session pointer, a file-only R2 write with no row to patch). Adding one is a conscious choice. |

A new non-GET route with no `kind` fails the type-check; a new `mutation` that forgets
to publish fails `publish-seam.test.ts`; adding a `housekeeping` route means editing a
locked deny-list set in the test, which is a visible, reviewed line. See the actual
comment block at the top of `ROUTES` in `workers/content/src/index.ts` and
[CACHING.md](CACHING.md).

### The one try/catch that maps `GuardError` → response

The `fetch` handler is small and identical across workers:

```ts
// workers/content/src/index.ts
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)
    const route = `${request.method} ${pathname}`
    try {
      if (route === "GET /api/content/health") return json({ ok: true })
      const def = ROUTES[route]
      if (!def) return fail(404, "not_found", "No such content action.")
      return await def.handler(request, env)
    } catch (e) {
      if (e instanceof GuardError) return fail(e.status, e.code, e.message)
      console.error("content worker error:", e)
      const message = e instanceof Error ? e.message : ""
      if (message.startsWith("cloud_key_missing:"))
        return fail(503, "cloud_key_missing", `${brand.name}'s cloud key isn't set up yet — content is paused.`)
      return fail(500, "internal", "Something went wrong on our side. Try again.")
    }
  },
} satisfies ExportedHandler<Env>
```

The rules that follow from this:

- **Handlers throw; the door catches.** A handler never builds its own 4xx/5xx for a
  rule failure — it throws `GuardError(status, code, message)` and lets the central
  catch turn it into a response. There is exactly one place that formats an error body.
- **Every response goes through `json` / `fail`** from `shared/workers/http.ts` — the
  *one* pair of helpers, so the shape (`{ error, message }`, matching `ApiError` in
  `shared/types.ts`) is defined once:

  ```ts
  // shared/workers/http.ts
  export const fail = (status: number, error: string, message: string): Response =>
    json({ error, message } satisfies ApiError, status)
  ```
- **The catch never leaks internals.** An unexpected throw logs the real error server-side
  (`console.error`) and returns a generic `500 internal` with a warm, user-safe message.
  A missing cloud key is the one special-cased operator condition. This mirrors the
  never-swallow rule in [ERROR-HANDLING.md](ERROR-HANDLING.md).

### `GuardError` is the currency of failure

Defined once, in `shared/workers/gating.ts`:

```ts
export class GuardError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message) }
}
```

`status` is the HTTP status, `code` is a stable machine string the client can branch on
(`not_member`, `forbidden`, `invalid_input`, `learning_not_found`, …), `message` is
plain English safe to show the user. Throw it from anywhere in the call stack — gating,
validation, or a lib CRUD function (`learningOrThrow` throws a `404 learning_not_found`)
— and it surfaces as a clean response without a single hand-built error path in between.

### Housekeeping beyond routes: `scheduled`

A worker with nightly work adds a `scheduled` handler next to `fetch` in the same
default export, and it follows the same never-swallow shape — try, do the job, log, and
never let a cron failure escape:

```ts
// workers/tenancy/src/index.ts
/** Nightly cron: the 80% database-size alarms (locked sharding machinery). */
async scheduled(_controller, env): Promise<void> {
  try {
    const result = await checkDatabaseSizes(env, d1Config(env))
    console.log(`size check: ${result.checked} team DBs, ${result.alerted.length} alarm(s)`)
  } catch (e) {
    console.error("nightly size check failed:", e)
  }
},
```

Only add a cron when there's real housekeeping — `content` has none, and says so in a
comment rather than shipping an empty stub.

---

## 2 · The handler body — the fixed opening

Inside a route handler (see `workers/content/src/routes/learning.ts`) the steps run in
a fixed order. Deviating is a smell; matching it is how the next reader knows what
they're looking at before they read a line.

```ts
export async function postCreateLearning(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)     // 1 · who + where
  await requireRight(cfg, guard, "learning", "create")               // 2 · may they?
  const body = (await request.json().catch(() => ({}))) as LearningInput  // 3 · read body
  requireText(body.title, "Title", TEXT_LIMITS.short)                // 4 · validate at boundary
  const id = await createLearning(cfg, guard, actor, body)           // 5 · CRUD via lib
  await publishChange(env.REALTIME, guard.teamId, "learning", id, "add")  // 6 · publish live
  return json({ learning: await listLearning(cfg, guard) })          // 7 · respond
}
```

1. **`teamContext(request, env)`** — the shared opening (§4). Destructure only what you
   use: `cfg` (the D1 REST config), `guard` (the validated membership), `actor` (the
   audit stamp), `user`.
2. **`requireRight(cfg, guard, module, right)`** — the permission gate (§4). Always
   before any read or write. Security is never just hiding UI.
3. **Read the body defensively** — `(await request.json().catch(() => ({}))) as T`. A
   malformed body becomes `{}`, never a throw; the `as T` is a *shape hint*, not a
   promise the fields are valid — that's step 4's job.
4. **Validate at the boundary** — `requireText` / `optionalText` (§5).
5. **CRUD through the lib layer** — never inline SQL in a route (§3, §6).
6. **Publish the live change** — one row-level ping per changed row (Law R1, §7).
7. **Respond via `json`**.

Reads collapse to steps 1–2 then the query and `json`:

```ts
export async function getLearning(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "learning", "read")
  const items = await listLearning(cfg, guard)
  const id = new URL(request.url).searchParams.get("id") // ?id= → one item
  return json({ learning: id ? items.filter((l) => l.id === id) : items })
}
```

---

## 3 · Data access — two doors, never a third

There are exactly **two** ways to touch a database, and the choice is decided by *which*
database:

| Database | How you reach it | Helper |
|----------|------------------|--------|
| **Global core** (`users`, `teams`, `team_members`, login codes, import registry) | the native `env.DB` binding | `env.DB.prepare(sql).bind(…).first()/.run()/.all()` |
| **Per-team** (roles, learning, help, activity, selectable data, …) | the Cloudflare D1 **REST door** | `d1Query` / `d1ExecScript` in `shared/workers/d1-rest.ts` |

Per-team databases are created at *runtime*, so they can't be pre-wired bindings — the
REST door (`d1-rest.ts`) is the *one file* every team-data touch goes through, which is
also where sharding routing plugs in. Do not add a third path.

### Native binding — parameterized, always

Core-DB access uses D1's prepared statements with `.bind(...)`. Untrusted values are
**always** bound, never concatenated:

```ts
// workers/auth/src/index.ts
const recent = await env.DB.prepare(
  "SELECT COUNT(*) AS n FROM login_codes WHERE email = ? AND created_at > ?"
).bind(email, hourAgo).first<{ n: number }>()
```

### REST door — `d1Query` for reads, `d1ExecScript` for writes

- **`d1Query<Row>(cfg, databaseId, sql, params)`** runs one parameterized statement and
  returns typed rows. Use it for every read (and single-statement writes where params
  work). Parameters are bound — same discipline as the native binding.

  ```ts
  const rows = await d1Query<{ id: string }>(
    cfg, guard.databaseId,
    "SELECT id FROM selectable_data WHERE type = ? AND value = ? AND deactivated_at IS NULL",
    [CATEGORY_TYPE, clean]
  )
  ```

- **`d1ExecScript(cfg, databaseId, script)`** runs a multi-statement script. The REST
  API **forbids parameters** in script mode, so values are inlined — and inlining is
  where the *only* string-building rule lives: **every inlined value goes through
  `sqlString` (or `sqlValue`)**, never a bare template literal.

  ```ts
  // workers/content/src/lib/learning.ts — createLearning
  await d1ExecScript(cfg, guard.databaseId,
    `INSERT INTO learning (id, content_title, content_body, created_at, creator_id, creator_email, creator_name)
     VALUES (${sqlString(id)}, ${sqlString(title)}, ${sqlString(body)}, ${sqlString(now)},
             ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`)
  ```

### `sqlString` / `sqlValue` / `ulid` — the three primitives

- **`sqlString(value)`** escapes a value for inlining (`''`-doubling) and — defence in
  depth — `String()`-coerces any non-string runtime value *first*, so a field typed
  `string` that arrives as a number/object/array can never break the one SQL door:

  ```ts
  // shared/workers/d1-rest.ts
  export function sqlString(value: unknown): string {
    if (value === null || value === undefined) return "NULL"
    return `'${String(value).replaceAll("'", "''")}'`
  }
  ```

- **`sqlValue(value)`** is its numeric-aware sibling for copying cells (numbers inline
  bare, strings via `sqlString`, `null` → `NULL`).

- **Numbers still need coercing.** A field the route *types* as a number but doesn't
  validate at runtime is coerced with a small helper before it's interpolated — never
  trust the `as` cast:

  ```ts
  // learning.ts — sequence is typed number but arrives untrusted
  function intOr(v: unknown, fallback: number): number {
    const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : fallback
  }
  ```

- **`ulid()`** (`shared/workers/id.ts`) mints every row id. **Every row everywhere gets
  a ULID** — globally unique *and* time-sortable, so rows can move between databases
  (sharding) without collisions. Never use an auto-increment or a random UUID.

**The rule, stated once:** *never string-concat untrusted input into SQL.* Bound params
on both doors; `sqlString`/`sqlValue` for the script-mode inlines that can't take
params. There is no third option, and there is no exception.

---

## 4 · The gating spine — `teamContext` → `requireRight`

Permissions are the spine of the whole base (ARCHITECTURE §2). The entire gating seam
lives in `shared/workers/gating.ts` so every worker gates **identically, with zero
duplication**.

**`teamContext(request, env)`** is the standard opening every team-scoped handler
shares. In order it: asks the auth worker *who is calling* (`whoAmI` → the auth
worker's `/me`), rejects the signed-out (`401 signed_out`) and the teamless
(`409 no_team`), builds the D1 REST config, and validates the caller is an active
member of their **active** team (`requireMember` → `403 not_member`). It returns a
`TeamCtx`:

```ts
export type TeamCtx = { user: SessionUser; actor: Actor; cfg: D1Rest; guard: MemberGuard }
```

`guard` (`{ userId, teamId, roleId, databaseId }`) is the object every downstream query
threads through — `guard.databaseId` is *this team's* database, so isolation is by
physics: a handler literally cannot address another team's rows.

**`requireRight(cfg, guard, module, right)`** is the permission one-liner. It reads the
role's tall permission sheet (`role_permissions`) and throws `403 forbidden` if the
role lacks the right. Rights are the fixed set `"read" | "create" | "edit" | "delete"`.

```ts
export async function requireRight(cfg, guard, module, right): Promise<void> {
  // Name the missing right in plain words — a person (or the agent explaining a
  // refused step) can then see WHICH permission their role lacks, not just "no".
  if (!(await hasRight(cfg, guard, module, right)))
    throw new GuardError(
      403,
      "forbidden",
      `You don't have permission to do that — your role is missing the "${right}" right on ${module.replace(/_/g, " ")}.`
    )
}
```

Conventions that fall out of the spine:

- **Deactivate maps to `delete`.** Retiring a record (§6) is gated by the `delete`
  right — deactivate *is* our delete. See `postSetLearningActive` gating on
  `"learning", "delete"`.
- **Your own data uses `read`.** Recording your *own* progress (`postLearningDone`)
  only needs `read` — any reader may mark their own item done.
- **The AI agent is not special.** It acts **as the signed-in user through the same
  gated endpoints** and never exceeds their rights. There is no agent role, no bypass.
- **Operator endpoints** (`/admin/*`, seeds, migrations) use `adminGuard` (the
  `x-admin-key` header check) instead of `teamContext` — see `gating.ts`.

---

## 5 · Validate at the boundary (Law: input is validated at the door)

Never trust a request body. The `as T` cast in a handler is a shape *hint*, not a
guarantee. Real validation is a single seam: `shared/workers/validate.ts`.

The bug this seam fixes (documented in the file's own header comment): the old
`body.field?.trim()` pattern only guarded null/undefined — a non-string made `.trim`
undefined and threw a `TypeError` → the central catch turned it into a **500**. A NUL
byte (SQLite rejects `U+0000`) → another 500. An uncapped multi-MB string bloated a row
or 500'd. **Bad input must be a clean 400, never a 500.**

```ts
// shared/workers/validate.ts
export function requireText(value: unknown, field: string, max = TEXT_LIMITS.long): string {
  if (typeof value !== "string") throw new GuardError(400, "invalid_input", `${field} must be text.`)
  const clean = stripNul(value).trim()
  if (!clean) throw new GuardError(400, "invalid_input", `${field} is required.`)
  if (clean.length > max) throw new GuardError(400, "invalid_input", `${field} is too long (max ${max} characters).`)
  return clean
}
```

- **`requireText(value, field, max)`** — a required field: type-check, strip NULs, trim,
  cap length, or throw a clean `400 invalid_input`.
- **`optionalText(value, field, max)`** — null/undefined/blank → `undefined`; otherwise
  the same checks.
- **`TEXT_LIMITS`** — the per-kind caps (`short: 200`, `link: 2_048`, `long: 20_000`,
  `message: 10_000`). Pick the tightest that fits the field.

Use them at the top of the write, before the value reaches the lib:

```ts
requireText(body.title, "Title", TEXT_LIMITS.short)
const category = optionalText(input.category, "Category", TEXT_LIMITS.short) ?? null
```

For non-text values there's no shared helper by design — validate inline and specifically
(`typeof body.active !== "boolean"` → `fail(400, "invalid_input", …)`; a list of ids via
`requireIdList`). Content-shaped input gets a purpose-built scrubber (`safeLink` allows
only `http`/`https`/`mailto`; `safeBody` strips scripts/handlers/dangerous schemes) —
defence in depth beside the renderer's own allowlist. This behaviour is **locked** by
`workers/content/test/validate.test.ts`: the 500s can't come back.

---

## 6 · Deactivate, never delete — and the audit block on every write

Two rules travel together and appear on **every** write (ARCHITECTURE §4).

### Deactivate, never delete

Records are *retired*, never removed. A `deactivated_at` timestamp (NULL = active) hides
the row from the active list while its data and history survive. There is no `DELETE`
statement for a user-facing record anywhere in the base.

```ts
// learning.ts — setLearningActive
const sql = active
  ? `UPDATE learning SET deactivated_at = NULL, deactivator_id = NULL, deactivator_email = NULL, deactivator_name = NULL, updated_at = ${sqlString(now)} WHERE id = ${sqlString(id)};`
  : `UPDATE learning SET deactivated_at = ${sqlString(now)}, deactivator_id = ${sqlString(actor.id)}, deactivator_email = ${sqlString(actor.email)}, deactivator_name = ${sqlString(actor.name)}, updated_at = ${sqlString(now)} WHERE id = ${sqlString(id)};`
```

`active === null` in the shaped type is derived from `deactivated_at === null` — the DB
column is the truth, the boolean is a convenience.

### The audit block — actor + timestamp on every write

Every write stamps *who* and *when*. The columns are consistent across tables:

- **create** → `created_at`, `creator_id`, `creator_email`, `creator_name`
- **edit** → `updated_at`, `editor_id`, `editor_email`, `editor_name`
- **deactivate** → `deactivated_at`, `deactivator_id`, `deactivator_email`,
  `deactivator_name` (reactivating clears them)

The actor comes from `teamContext`'s `actor` (`{ id, email, name }`) — store the email
and name too, not just the id, so history reads without a join even if the user record
later changes.

### Log it to the activity feed

Every meaningful write also appends one row to the team's `activity` table via the *one*
shared writer, `logActivity` (`shared/workers/activity.ts`). It's **best-effort by
contract** — it swallows and logs its own failures, so a logging hiccup can never break
the action it describes. Callers just `await` it; no `.catch` needed.

```ts
// learning.ts — after the INSERT
await logActivity(cfg, guard.databaseId, actor, {
  type: "Learning created",
  description: `${actor.name} added the "${title}" learning item`,
  relatedTable: "learning",
  relatedRowId: id,
})
```

Activity rows point at the changed record through a **generic** `(related_table,
related_row_id)` pair — never a per-module column. That generic pair is what lets one
read path (Law R5) serve any module's history.

---

## 7 · Publish the live change (Law R1)

After a successful mutation, the handler pings the realtime worker so every open screen
patches **only the row that changed**. The helpers are in `shared/workers/realtime.ts`:

- **`publishChange(realtime, teamId, resource, id?, op?)`** — team-scoped data.
- **`publishUserChange(realtime, userId, resource, id?, op?)`** — identity-scoped data
  across one person's devices.
- **`publishSignOut(realtime, userId)`** — force-sign-out a user's other devices.

Two conventions matter:

- **Row-level, never list-level.** Pass the changed row's `id` so clients patch that one
  row instead of refetching the list (CACHING.md). For a bulk action, publish **one ping
  per changed row** — see `postBulkSetLearningActive` looping `for (const id of changed)`.
- **The payload carries no row data** — `{ resource, id, op }` only. The client re-pulls
  the row through the permission-checked endpoint, so a live ping can never leak data.
  `op` (`add | edit | remove | session`) is *advisory*; the client verifies by re-pull.

Like `logActivity`, publishing is best-effort — a realtime hiccup logs but never throws,
so it can't break the write it announces.

---

## 8 · The `shared/` vs per-worker split

The line is simple: **if two workers would write it the same way, it lives in `shared/`.**

- **`shared/workers/`** holds the seams every worker reuses: `http.ts` (`json`/`fail`),
  `gating.ts` (`GuardError`, `teamContext`, `requireRight`), `validate.ts`, `d1-rest.ts`
  (`d1Query`/`d1ExecScript`/`sqlString`), `id.ts` (`ulid`), `activity.ts`
  (`logActivity`), `realtime.ts` (`publishChange`). Touch these carefully — a change
  ripples across all six workers.
- **`shared/types.ts`** is the contract the web `web/` client and the workers both agree
  on (`SessionUser`, `Learning`, `ApiError`, …). Shape a DB row into a shared type at the
  lib boundary (`toLearning`) so the wire type is stable even as columns change.
- **`shared/rules/registry.ts`** and **`shared/glossary.ts`** / **`shared/brand.ts`** are
  the single sources of truth for the laws, the product vocabulary, and brand strings.
- **A worker's own `src/`** holds only what's specific to it: its `env.ts` (the bindings
  it's given), its `index.ts` switchboard, its `routes/*` (thin handlers), and its
  `lib/*` (the module's real CRUD + rules). Route files stay thin; module logic lives in
  `lib/`. `learning.ts` route → `learning.ts` lib is the pattern to copy.

Each worker's `Env` (e.g. `workers/content/src/env.ts`) is written to **structurally
satisfy** the shared `GatingEnv` (`AUTH` + `DB` + the Cloudflare D1 credentials), which
is *why* the shared gating works unchanged in every worker. Add a binding to `env.ts`
only when that worker actually needs it, and comment what it's for.

---

## 9 · Comments — explain WHY, not WHAT

The code says *what*. A comment earns its place by saying *why* — the constraint, the
locked decision, the bug it's guarding against, the non-obvious trade-off. Match the
density of the surrounding file: a shared seam gets a header paragraph; a one-line guard
gets a one-line reason.

**File headers state the file's job and its locked rules.** From `d1-rest.ts`:

```ts
// THE data-access door to per-team databases (locked rule: one door).
// Team databases are created at runtime, so workers can't have them as
// pre-wired bindings — instead we talk to Cloudflare's D1 REST API with a
// scoped token. Every module worker that touches team data goes through this
// ONE file — which is also where sharding routing plugs in …
```

**Inline comments explain a decision, not the mechanics.** Good — it tells you *why the
line exists*:

```ts
// Row-level: carry the new item's id so open learning lists patch just that row.
await publishChange(env.REALTIME, guard.teamId, "learning", id, "add")

// A missing item is skipped, not fatal — the rest of the batch still applies.
if (e instanceof GuardError && e.status === 404) { skipped++; continue }

// ?v= busts caches; the file itself is served immutable by the gateway.
```

**Guard the reader against a subtle danger.** From `learning.ts`, above `safeLink`:

```ts
// Allow only safe link schemes (http/https/mailto). A `javascript:` / `data:` /
// `vbscript:` content_link is a stored-XSS payload the moment a reader clicks it, so
// anything else is dropped (defence-in-depth beside the renderer's own check).
```

**A `housekeeping` classification always carries its reason** inline in `ROUTES`:

```ts
// Stores a file in R2 but changes NO record (no row to patch) → housekeeping.
"POST /api/content/learning/upload": { handler: postUploadLearningFile, kind: "housekeeping" },
```

Anti-patterns: a comment that restates the code (`// increment i`), a stale comment that
no longer matches the line, or a comment apologising for code that should just be
simpler. If a comment is needed to explain *what* the code does, prefer clearer code.

---

## 10 · Naming

Consistent, boring, predictable — the reader should be able to *guess* the name.

- **Route handlers** read as `METHOD` + verb + noun: `getLearning`, `postCreateLearning`,
  `postUpdateLearning`, `postSetLearningActive`, `postBulkSetLearningActive`.
- **Lib CRUD** is the bare verb + noun: `listLearning`, `createLearning`,
  `updateLearning`, `setLearningActive`, `setLearningDone`. Bulk siblings prefix `bulk`
  (`bulkSetLearningActive`).
- **Fetch-or-throw** helpers end in `OrThrow` (`learningOrThrow`) and throw a `404`
  `GuardError`.
- **Shaping functions** are `toX` (`toLearning`, `toActor`) — one DB row → one shared type.
- **DB columns** are `snake_case` (`content_title`, `deactivated_at`, `creator_email`);
  **TS fields** are `camelCase` (`title`, `active`, `creatorEmail`). The `toX` function is
  the single translation point.
- **Error codes** are short `snake_case` strings, stable enough for the client to branch
  on: `not_member`, `forbidden`, `invalid_input`, `no_team`, `learning_not_found`.
- **`GuardError` messages** are warm, plain, sentence case, safe to show a user — they
  follow the same voice as UI copy (see the glossary in `shared/glossary.ts`): *"You're
  not a member of this team."*, not *"403 FORBIDDEN: membership assertion failed"*.

---

## 11 · TypeScript config across workspaces

The repo is an npm workspace (`web`, `workers/*`) with **one tsconfig per workspace** —
there is no root `tsconfig.json`. The shared invariants (`workers/content/tsconfig.json`
is representative):

```jsonc
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler",
    "strict": true,              // non-negotiable, everywhere
    "noEmit": true,              // tsc type-checks only; wrangler/next build
    "isolatedModules": true,
    "skipLibCheck": true,
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts", "../../shared/**/*.ts"]
}
```

Notes:

- **`strict: true` is universal.** No `any` escape hatches; untrusted input is typed
  `unknown` and narrowed (that's what `validate.ts` does).
- **Each worker tsconfig `include`s `../../shared`** so the shared seams type-check in the
  *consuming* worker's context (the web tsconfig maps `@shared/*` → `../shared/*` and
  includes `../shared/**/*.ts` the same way).
- **Worker tsconfigs use `@cloudflare/workers-types`**; `web` uses the DOM libs + the
  Next plugin. Keep worker code free of DOM globals.

---

## 12 · How `npm run check` gates everything

One command is the gate. It must stay green before any commit — it is the difference
between "I think it works" and "the laws still hold".

```jsonc
// package.json
"check": "npx tsc --noEmit -p web
        && npx tsc --noEmit -p workers/auth   && … && npx tsc --noEmit -p workers/gateway
        && npm test"
```

`check` = **type-check every workspace** (web + all six workers, each against its own
tsconfig) **then run the full test suite** (`npm test` fans out to every worker's
`vitest run` plus `web`).

The test suite is not just unit tests of behaviour — it includes the **law checks and
seam tests that read the source straight off disk**, so breaking a Law of the Base turns
the build red:

- **`workers/*/test/publish-seam.test.ts`** (Law R1) — reads `ROUTES` and each handler's
  source, and fails if a `mutation` doesn't call a `publish*` helper, or if the
  `housekeeping` deny-list drifts from the reviewed set.
- **`workers/content/test/validate.test.ts`** — locks the boundary-validation contract
  (non-string / blank / over-long / NUL → clean 400) so the 500 bugs can't return.
- **`web/test/rules.test.ts`** — the UI + registry laws (record-detail tabs, `FormShell`,
  `TabsView`, one generic activity path, glossary well-formed, `registry-integrity`).

A law without a passing check is not a law — you cannot add one to `RULES.md` and the
registry without also adding its test (`registry-integrity` enforces the doc/registry/
check triangle stays in sync). See [RULES.md](RULES.md).

Beyond the automated gate, the **ship gate** (before `/ship-staging`) runs the quality
skills — `lean_mean` (≥ 92), `story_checks_out`, `security_sentry` (no critical/high).
This is where "too much code is a defect" is actually scored: a lean, well-reused diff
passes; a bloated one doesn't. Write the least code that obeys the laws, and both gates
stay green.

---

## The short version

Open with `teamContext` → gate with `requireRight` → read the body defensively and
`requireText`/`optionalText` it → do CRUD in a `lib/` function through `d1Query` /
`d1ExecScript` + `sqlString` + `ulid`, stamping the audit block and deactivating instead
of deleting → `logActivity` → `publishChange` → `json`. Throw `GuardError` for every
rule failure and let the one central catch format it. Comment the *why*. Add the least
code that does the job, and keep `npm run check` green.
