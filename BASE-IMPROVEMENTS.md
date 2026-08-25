# BASE-IMPROVEMENTS.md — the honest backlog

The living list of known base issues and their status, from an **objective third-party
review** (2026-07-09): a fresh multi-agent `security_sentry` on this repo + an independent
four-audit pass (`lean_mean_check` · `security_sentry` · `error_analyst` · `story_checks_out`)
run against a *pristine* clone by the first real `new-app` fork (testco). Two reviewers with
no prior context converging on the same findings is the signal to trust.

Keep this current: when an item ships, move it to **Fixed** with the commit.

---

## Fixed (2026-08-11) — SEVEN findings ported back from the Inventory build (Acrymold ERP)

A fork building its Inventory module hit seven faults. Every one was **base** code,
so every future app inherited them. Each landed as its own commit so a fork can
cherry-pick. Three became new laws. 411 tests.

| # | Issue | Fix |
|---|---|---|
| 1 | **The client cache had no ceiling.** `new Map()` with no cap and no eviction — entries left only on `invalidate`, so memory grew with everything a session had ever opened. | A bounded LRU (`MAX_ENTRIES = 500`). "Used" = WRITTEN, not read. An entry with a live subscriber is NEVER evicted, nor is a paged list's `cursor:` sidecar while its list is mounted. Soft ceiling: blanking a mounted screen is worse than exceeding a budget. Fixed the second unbounded map too (an empty subscriber `Set` per key, for ever). |
| 2 | **The importer ignored a target door's own row cap.** Parcels were packed to the global ceiling; a door that caps lower refuses an oversized parcel WHOLE, so a 400-row import failed 400 rows and read like 400 bad rows. | `TargetDef.bulk = { path, maxRows? }`; `parcelSize()` takes the MINIMUM of the two. A refused parcel is ONE rejection carrying `scope: "parcel"` + `rows: n` — the report separates "400 rows not imported" from "1 problem". |
| 3 | **Columns declared no VOCABULARY.** The agent normalised casing but not words: "Received" → "received" when the legal word was "receipt" — and the plan couldn't predict the rejection, so it promised 423 and delivered 14. | `ImportColumn.values` + `.aliases`, resolved in three passes (exact → declared alias → the agent), cheapest and most certain first. The model proposes; it can never widen the vocabulary. Resolution lives in `scanRows`, the one scan backing both plan and run, so the plan cannot over-promise. |
| 4 | **Nothing checked that a sidebar section had a page.** A static export 404s a section with no page — invisible from inside the app, because the client router never leaves the page. Three modules in one fork shipped this. | **LAW R20**, derived from the nav registries. It also caught the two OTHER hand-lists the same section needs: the gateway's `MODULE_SHELLS` and `TOP_LEVEL_MODULES` (without which soft nav is a full RELOAD). Three lists, three workspaces, one check. |
| 5 | **A create returned a list.** Every create door answered with its whole (capped) collection — up to a thousand rows to create one, and still no way to learn the new id. | **LAW R21**, derived from the `create` gate: `{ created, total }`, patched in client-side through the one `applyCreated` seam. All six doors fixed (including the help REPLY). `POST /teams` is genuinely different and stays as it is — it returns your new active context, because creating a team switches you into it. |
| 6 | **Owner's decision, 2026-08-11: a create should OPEN the new record.** | **LAW R22**, in the shared form seam (`FormShell`'s `opensRecord`), so a module declares one prop instead of every screen remembering. Exceptions named per table. |
| 7 | **A law satisfied by a variable NAME.** R14's scan asked "does the token LIMIT appear in this body?" — which a constant called `BULK_IDS_LIMIT` answered for free, waving through an unbounded read. | The bound must be in the **statement**: every SQL literal that SELECTs carries its own LIMIT. Delegation isn't flagged (it has no SELECT literal). Found and capped two genuinely unbounded reads the old scan had been passing. |

**BREAKING for anything already on the base** — the two to read before you pull:

1. **The five create doors changed shape.** `POST` to roles / invites / dropdown
   values / learning / help now answers `{ created, total }` (+ `emailSent`,
   `mineTotal`) instead of `{ roles: [...] }` etc. A fork's client doing
   `const { roles } = await createRole(...)` gets `undefined`. Replace the prime
   with `applyCreated({ listKey, created, total, totalCacheKey })` — see
   CACHING.md §7. The help REPLY door changed the same way (`{ created, total }`).
2. **A create through a form now navigates.** Every `FORM_DIALOGS` entry must
   appear in `CREATE_OPENS_RECORD` or `CREATE_OPENS_RECORD_EXEMPT`, and a create
   dialog must `return createdId` and guard its own close with
   `if (!createdId) onOpenChange(false)` — the host's close is `router.back()`,
   which is asynchronous and will otherwise pop straight back off the new record.

A smaller one: a newly created row now appears at the **head** of its list for the
creator rather than in sort position — which is what the live "add" ping already
did for every other viewer. Everyone now sees the same thing.

---

## Fixed (2026-08-04, final) — four findings ported back FROM the downstream product

The fork shipped its side and sent four findings back. Three were live here too;
the fourth was a UX bug their seam tests caught that mine would have shipped.
387 tests.

| Sev | Issue | Fix |
|---|---|---|
| BLIND CHECK | **The gate scan read COMMENTS AS CODE.** Reproduced exactly: a mutation's real `requireRight(…)` was replaced with a comment mentioning it, and R10 stayed GREEN. This repo comments densely about the very seams being scanned, and a handler's slice runs to the next top-level export — so it swallows the next function's doc comment too. | All four gate scans (tenancy, content, data-ops, mcp) strip comments before matching, require `\s*\(` on every alternative, and allow the generic (`(?:<[^(<>]*>)?`) so `gatedBody<{…}>(` isn't a miss. |
| BLIND CHECK | **R14's LIMIT test read comments** — `// no LIMIT needed here` satisfied the very bound it describes the absence of. (The arrow-shape blindness and the saw-something tripwire were already fixed in the previous round.) | Comment-stripped before matching; proven with an unbounded read whose comment says LIMIT. |
| BUG | **A deliberate `0` in config silently became the default.** `Number(env.X) \|\| DEFAULT` at all three numeric env-var reads: `AGENT_FREE_DAILY=0` would have granted the full quota, and `MAX_TEAMS_PER_USER=0` the default 5. | One `numberVar()` parse — unset/empty/unparseable → fallback, every real number incl. zero honoured. Tested at both boundaries, plus a scan so the raw spellings can't return. |
| BUG | **The OTP cooldown counted CONSUMED codes**, so signing in on a laptop and then a phone made the second device wait a minute — the cooldown punished the one user who had already proved they own the inbox. | The probe carries `consumed_at IS NULL`. Their seam tests caught this; mine would have shipped it. |

Confirmed already correct here: the team cap counts `teams.creator_id` (not
memberships) and does **not** filter deactivated teams — "create five, switch them
off, repeat" would otherwise be an unbounded database generator wearing a cap.
Now locked by a test.

---

## Fixed (2026-08-06) — the measured security sweep

A full `security_sentry` pass with every control COUNTED rather than judged:
**98/100 (A) at 100% sweep coverage**, 951 sites enumerated, 64 flagged and opened
by hand. Full arithmetic in `security-report.md`. 390 tests.

| Sev | Issue | Fix |
|---|---|---|
| LOW | **A stored filename could 500 the import.** `sqlString()` escapes quotes and nothing else — no NUL strip, no length cap — and `body.fileName` / `body.name` reached the database without meeting the validation seam every sibling field uses. | Both go through `optionalText(…, TEXT_LIMITS.short)`. **Locked**: a new check fails if any request field is interpolated into SQL straight off the body (sabotage-proven). |
| LOW | **Seven packages carried HIGH advisories** (`next`, `postcss`, `sharp`, `nanoid`, `miniflare`, `undici`, `ws`). | **CLOSED** on branch `deps/next-16`: `next@15 → 16` + `wrangler@4.100 → 4.120`. `npm audit` is now 0 at every severity. The static export was diffed against its Next-15 baseline — additive only (a `_not-found` route + RSC payload files); 390 tests green. |
| LOW | **A latent packaging fragility both upgrades exposed.** `shared/workers/*.ts` imported `@cloudflare/workers-types` as a MODULE, resolving only because an older wrangler hoisted it to the repo root — and `web/tsconfig.json` pulled all of `../shared/**` into the BROWSER app's type graph, which is why a browser workspace depended on worker types at all. | The import is gone (every worker tsconfig already loads those types GLOBALLY, so it was redundant as well as fragile), and web's tsconfig now includes only the shared code web actually uses. |
| LOCK | **Live pings had no test** — the one security invariant in the sweep held only by a function signature and a line in CACHING.md. | `publish-payload.test.ts`: the wire shape is `{channel, event}` and the event may carry only `resource`/`id`/`op`. Sabotage-proven by adding a `title` to the payload. |

---

## Reasoned exceptions (decided, documented, NOT open findings)

Two things a review will flag every time. Both are deliberate positions with the
threat named, documented in BASE-MANUAL §5 (the fork chapter) and OPERATIONS.md
so a fork decides consciously rather than inheriting them by accident:

- **`/media/*` capability URLs** — no session check on uploaded files. An
  ex-member who saved a link keeps it, forever. Acceptable for product photos;
  **not** for invoices, IDs or personal data. Any fork storing those must fix it
  before launch.
- **Identity fields behind a neighbouring right** — stakeholder emails, the team
  creator's email, learning-progress user ids. Tenant-scoped throughout, so it is
  a wrong-right mismatch within one team, not a cross-customer leak.

---

## Fixed (2026-08-04, follow-up) — the independent security review

Three no-prior-context auditors read a clean clone (no session notes, no prior
reports, no explanation of why anything was built) and refuted by default. Nine
findings survived; all nine are fixed below. 371 tests.

| Sev | Issue | Fix |
|---|---|---|
| HIGH | **Stored prompt injection reached UNCONFIRMED privilege grants.** Any member with `help:create` writes instructions into a 20,000-character ticket description; an admin later asks the assistant anything that lists tickets; `set_role_permissions` / `set_member_role` / `create_role` / `invite_member` then run AS the admin with no panel. | Those four now confirm — see EDGE-CASES §5 (this REVERSES the 2026-07-10 destructive-only decision, narrowly: every other constructive write still runs free). |
| MED | **`?scope=user` with no `id` returned the WHOLE team feed, unfiltered** — it matched no branch, leaving an empty WHERE. Exactly the leak R18 exists to stop, arrived at by omission; the source-scan stayed green because the clause still *existed*. | Fails closed at both layers (the route validates the scope and refuses an id-scope with no id; the reader returns nothing rather than widening), locked by `activity-scope.test.ts`, which RUNS the reader over every scope shape. |
| MED | **A role could grant ITSELF every right** — `member_roles:edit` + your own role id = admin in one call. | `setRolePermissions` refuses a self-grant, matching the sibling "you can't change your own role" invariant. **Superseded 2026-08-25 — the row below.** |
| HIGH | **The self-grant guard was a doorway.** It blocked only the direct route. The indirect one walked round it: create role Y, grant Y everything (Y is not your role, so the guard never fires), invite `you+2@yourdomain` as Y (the self-invite check compares exact emails), accept. Full tenant admin in three calls, and reachable through the assistant and MCP because both act as the signed-in user over these same doors. | **No privilege amplification**: you may not GRANT a right you do not hold yourself. Revoking is still free, and a right the target role already has is left alone — otherwise editing a role would silently strip whatever the editor lacks. Locked by `roles.test.ts`, which asserts nothing is written when the grant is refused. |
| MED | **An unauthenticated request could write into the GLOBAL core DB** — the client-error beacon's gate was `Cookie.includes("session")`, a substring test on an attacker-controlled header, next to a comment claiming a drive-by couldn't fill the table. | The gateway resolves the session with auth before forwarding; a forged cookie now writes nothing (verified live on staging). |
| MED | **The daily AI allowance was advisory** — read-then-check, so N simultaneous chats all passed. | The cap rides the UPDATE, like the paid-credit path beside it. |
| MED | **The impersonation door shared a name with the maintenance key.** `ADMIN_KEY` is set on tenancy + data-ops in BOTH environments, so one mistyped `wrangler secret put` directory would have armed sign-in-as-anyone on production. | Its own `TEST_LOGIN_KEY` secret **and** a hard refusal when `ENVIRONMENT` is production — two independent locks, neither a runbook sentence. `ADMIN_KEY` deleted from staging auth. |
| LOW | **R10 claimed three gating-seam suites that did not exist** (tenancy, content, data-ops) — a documented control, absent. | The three suites now exist and are sabotage-proven. (Writing them found a bug in my own scanner: no word boundary, so `ungatedBody(` matched `gatedBody(` and the check passed its own sabotage.) |
| LOW | **The email-change door was an enumeration oracle** — the "already in use?" check ran before the throttle, and a rejected probe counted toward nothing. | Throttle first; probes count. |
| LOW | **A double-clicked CSV import could write every row twice** — read-then-write, while CONCURRENCY.md claimed it was guarded. | The session is claimed atomically, like its batch sibling. |
| LOW | **Learning `body` + `contentLink` skipped the boundary seam** — a NUL byte was a 500, and the body had no length cap. | Both go through `optionalText` first, then the XSS scrub. |

---

# SECURITY ADVISORY — for apps forked from this base BEFORE 2026-08-04

A base that fixes a vulnerability silently leaves its own children exposed. Every
app forked before commit `5da1c76` carries the defects below in its own source —
the fork copied the code, and no deploy of this repo reaches it. **Six of these
have been independently confirmed live in a downstream product's production.**

Each entry gives the grep that finds it in a fork and the minimal patch. Run the
greps from the fork's root. **Every grep here was validated both ways** — it reads
clear against the fixed base and FLAGS the pre-fix base (`3bebf0b`) — so a grep
that comes back clear is evidence, not an absence of evidence. The one caveat: if
you renamed the symbol it names, check that spot by hand.

## A1 · CRITICAL-if-agent-enabled — the assistant grants privileges with no confirmation
**Who is exposed:** any fork whose AI assistant is switched on and whose members
can write free text anyone else's assistant will read (a ticket, an article, an
imported row). **The attack:** a member writes instructions into a ticket
description; an admin later asks the assistant anything that lists tickets; the
model calls `set_role_permissions` / `set_member_role` / `create_role` /
`invite_member` as the admin, with no panel. Nothing in the audit log looks unusual.

```bash
grep -A 12 -E 'name: "(create_role|update_role|set_role_active|set_role_permissions|set_member_role|invite_member)"' shared/workers/tool-catalog.ts | grep -c "confirm: false"
```
Any count above `0` is vulnerable. (A plain `grep confirm: false` is NOT a test —
most tools legitimately don't confirm; only the privilege ones must.)
**Patch:** any tool whose `TOOL_GATES` entry starts `member_roles:` or
`team_members:` must declare `confirm: true`. Derive it rather than listing names
— copy `isPrivilegeWrite()` from `shared/workers/tool-catalog.ts` and the
`requiresConfirm` guard in `workers/data-ops/src/lib/tools.ts`.

## A2 · HIGH — the activity feed leaks every module's history
**The attack:** any member with `team_members:read` requests
`GET /api/tenancy/activity?scope=user` **with no `id`**. It matches no branch,
the WHERE comes out empty, and the whole team's cross-module history returns —
including before→after values from modules that member cannot read.

```bash
grep -cE '^\s*\} else if \(scope === "team"\)' workers/tenancy/src/lib/activity-read.ts
```
**Patch:** any count above `0` is vulnerable (the branch is conditional, so an
unresolved scope falls past it into an empty WHERE). Make it a plain `else`
so an unresolved scope still gets the visibility filter, return empty when a
non-team scope arrives without an `id`, and validate `scope` against the literal
set in the route instead of casting it.

## A3 · HIGH — a role can grant itself every right
**The attack:** a member holding `member_roles:edit` posts their OWN role id to
`/api/tenancy/roles/permissions` with every module true, and is an admin.

```bash
grep -n "export async function setRolePermissions" -A 12 workers/tenancy/src/lib/roles.ts | grep -c "guard.roleId"
```
**Patch:** returns `0` → vulnerable. Refuse when `roleId === guard.roleId`.

## A4 · MEDIUM — anyone can write to your global database
**The attack:** `curl -X POST <app>/api/log/client -H 'Cookie: session=x' -d
'{"message":"…"}'` in a loop. The gate is a substring test on an
attacker-controlled header, so unauthenticated rows accumulate in the core
database that also holds users, sessions and teams — toward D1's 10 GB cap.

```bash
grep -n 'includes("session")' workers/gateway/src/index.ts
```
**Patch:** any hit is vulnerable. Resolve the session first —
`env.AUTH.fetch("https://internal/api/auth/me", { headers: { Cookie: cookie } })`
— and drop the beacon when it isn't ok.

## A5 · MEDIUM — one mistyped directory arms sign-in-as-anyone
**Why it matters:** if the test-login door is gated by `ADMIN_KEY`, it shares its
name with the maintenance key your runbook tells operators to set on tenancy and
data-ops **in both environments**. One `wrangler secret put ADMIN_KEY` run in the
wrong directory turns a maintenance key into universal impersonation on production.

```bash
grep -n "env.ADMIN_KEY" workers/auth/src/index.ts
```
**Patch:** any hit is vulnerable. Give the door its own `TEST_LOGIN_KEY` secret,
add `if (env.ENVIRONMENT === "production") return fail(403, …)`, and set
`"ENVIRONMENT"` in `workers/auth/wrangler.jsonc` vars for every environment.

## A6 · MEDIUM — the daily AI allowance is advisory
**The attack:** fire N chat requests at once; every one reads `used < cap` before
any writes, so all N proceed. The free allowance overruns by the burst width and
paid credits are never reached.

```bash
grep -c "agent_usage.used <" workers/data-ops/src/lib/credits.ts
```
**Patch:** a count of `0` is vulnerable — the cap isn't in the write.
(Don't grep for `SELECT used FROM agent_usage`: a legitimate read of the same
row backs the quota display.) Put the cap in the write —
`INSERT … ON CONFLICT … DO UPDATE SET used = used + 1 WHERE agent_usage.used < ?`
— and proceed only when a row changed.

## A7 · MEDIUM — an uncapped database-creation door
**The attack:** sign up, then POST `/api/tenancy/teams` in a loop. Every call
provisions a real D1 database until the Cloudflare account's quota is gone. No
permission is exceeded; the platform simply stops working.

```bash
grep -n "creator_id = ?" workers/tenancy/src/routes/team.ts
```
**Patch:** returns nothing → vulnerable. Count teams the caller CREATED and
refuse at a cap (`MAX_TEAMS_PER_USER`, default 5, overridable per environment).

## A8 · LOW — an unthrottled user-enumeration oracle
**The attack:** any signed-in account POSTs `/api/auth/email/change/start` in a
loop; `409 email_taken` vs `{}` reveals whether any address has an account, at
full request rate. The login door is deliberately non-enumerable; this undoes it.

```bash
grep -n "export async function startEmailChange" -A 25 workers/auth/src/lib/email-change.ts | grep -c "findUserByEmail"
```
**Patch:** any count above `0` is vulnerable — the START door answers "does this
address exist?" before the throttle. Move the check to the VERIFY step (where the
caller has already proved they control the new inbox) and keep the UNIQUE
constraint as the backstop.

## A9 · LOW — anyone can lock a real person out of sign-in
**The attack:** request five codes for someone else's address. For the rest of
the hour their own sign-in returns `429`. (This one bit a real operator on their
own staging, self-inflicted, by retrying.)

```bash
grep -n "Try again in an hour" workers/auth/src/lib/login-codes.ts
```
**Patch:** any hit is vulnerable. Throttle the SEND with a short cooldown
(~60s); past the hourly cap, ROTATE the live code row in place instead of
refusing — codes are hashed at rest, so rotation (a fresh secret, fresh TTL,
`attempts = 0`) is the only way to let the inbox owner back in.

## A10 · LOW — a double-clicked import writes every row twice
```bash
grep -n "import_complete === 1" -A 6 workers/data-ops/src/lib/import.ts | grep -c "import_initiated = 1 WHERE"
```
**Patch:** returns `0` → the check is read-then-write. Claim the session in one
statement (`UPDATE … WHERE id = ? AND import_complete = 0 AND import_initiated = 0
RETURNING id`), placed BELOW every validation, and release it on failure.

## A11 · LOW — a NUL byte is a 500
```bash
grep -n "safeBody(input.body)" workers/content/src/lib/learning.ts
```
**Patch:** any hit is vulnerable. Wrap with the boundary seam first —
`safeBody(optionalText(input.body, "Body", TEXT_LIMITS.long))` — and the same for
`contentLink`.

## A12 · LOW — a deliberate `0` in config silently becomes the default
**The shape:** `Number(env.X) || DEFAULT`. Set the AI allowance to `0` to switch
free usage off and you silently grant the full daily quota; the mirror shape,
bare `Number(env.X)`, turns *unset* into `0` — a cap that refuses everyone.

```bash
grep -rnE "(?:Number|parseInt|parseFloat)\s*\(\s*env\." --include="*.ts" workers/ shared/ \
  | grep -v node_modules | grep -vE ":[0-9]+: *(\*|//)"
```
**Patch:** any hit is vulnerable (the second `grep -v` drops doc comments that
DESCRIBE the bad shape — including the one in the patched file itself). Route them
all through one parse that treats
unset/empty/unparseable as the fallback and honours every real number including
zero — copy `numberVar` from `shared/workers/limits.ts`, and test at `0` and `""`.

## And the two blind CHECKS, which matter as much
A fork also inherits the checks. Two flaw classes made several of them unable to
fail — a green check that cannot go red is worse than no check, because it is
reported as a pass:

```bash
grep -L "stripComments" workers/*/test/gating-seam.test.ts web/test/rules.test.ts
```
**Patch:** every file listed reads COMMENTS AS CODE. This is the worst of the
three, because this repo comments densely about the very seams being scanned and
a handler's slice runs to the next top-level export — so it swallows the doc
comment introducing the next function. A gate deleted from a handler stayed green,
satisfied by prose thirty lines below. Three fixes together:
1. **strip comments** before matching (block comments, then line comments whose
   `//` isn't part of a `https://`);
2. **match a CALL, not a word** — every alternative ends `\s*\(`, and allow the
   generic between name and paren (`(?:<[^(<>]*>)?`) or `gatedBody<{…}>(` reads
   as a miss;
3. **boundary every identifier** — `(?<![A-Za-z0-9_$.])`, without which
   `ungatedBody(` satisfies a search for `gatedBody(`.

Then teach every source-scan BOTH export shapes (`export function listX` and
`export const listX = async (…) =>`) and give it a **tripwire** asserting it
matched something — a scan that silently finds nothing returns an empty offender
list, which reads exactly like a pass. See `web/test/hooks-order.test.ts` for the
fixture pattern that locks a scanner's own blind spots.

---

## Fixed (2026-08-04, follow-up) — the five close-out items

The hardening round's own review found five loose ends. 354 tests (up from 342).

| Sev | Issue | Fix |
|---|---|---|
| SCALE | **A hard cap is an honest refusal, not an answer.** R14 capped growing collections at 1,000 rows and called cursor paging a "next step"; a downstream product had already shipped keyset paging on its growing collections and proved it at 24,000 rows. | R14 WIDENED: a collection that grows with ordinary use must PAGE by key — `shared/workers/paging.ts` (opaque cursor, id tiebreak, `LIMIT+1` for `hasMore`) answered through the one `pagedJson` seam. Support tickets + the team activity feed page end to end; the My/All tabs became SERVER scopes (a client filter over a page disagrees with its exact badge). `GROWING_COLLECTIONS` is registry DATA; the check asserts the lib seam, the response, and that the client can reach page two. |
| BUG | **The agent was told a bulk cap it could not physically write.** The reply ceiling was 4,096 tokens while the declared cap was 500 ids (~8,000 tokens) — the tool call truncates mid-JSON, the turn dies, nothing changed, no error. | `AGENT_MAX_TOKENS` raised to 8,192 and `BULK_IDS_LIMIT` DERIVED from it (512). `reply-ceiling.test.ts` asserts the arithmetic and that every bulk schema declares the derived number. |
| BUG | **The hooks-order scanner had a third blind spot**: a guard written the ordinary way (`if (!ready) {` newline `return null` newline `}`) put its return at brace depth 2, so it never registered as an early return — switching the white-screen check OFF for that whole file. | Rewritten around the real semantic: a return counts unless it is inside a NESTED FUNCTION. Arrow components are scanned too, and fixtures now lock the scanner's own blind spots (a check that cannot fail is not a check). |
| BUG | **The dropdown-ordering rule was stated but not locked** — nothing stopped either surface losing it. | The rule is pinned as `DROPDOWN_ORDER_RULE` and asserted on BOTH surfaces the model reads (the tool description and the system rule wall), including that CREATE is the step named first (R9's vocabulary half). |
| OPS | **Staging's smoke was red (16/18)** on a stale team-database pointer — indistinguishable, to the next reader, from a real regression. | Staging reset (3 of 4 team-DB pointers were dangling), re-deployed, smoke back to **18/18**. |

---

## Fixed (2026-08-04) — the base hardening round (7 new laws + security/UI)

Ported the twenty defects a downstream product (Acrymold) found under real load —
each was a base defect. Seven became machine-checked Laws (R13–R19), each
sabotage-proven; the rest are security/agent/UI fixes. 342 tests (up from 302).

| Sev | Issue | Fix |
|---|---|---|
| DESIGN | **A capability shipped in code was invisible until a catalogue ROW existed** — staging could import modules production (byte-identical code) could not. | R13 widened: the import catalogue reconciles itself against the code on READ (INSERT-only; an owner's OFF stays off; the picker filters is_active in memory). Shipping the code now ships the capability. (`catalog-coverage`) |
| SCALE | **Unbounded list reads** would stall a worker at 100k rows. | R14: every `list*`/`search*` carries a hard cap from `shared/workers/limits.ts` with its comment (`bounded-lists`). *Widened in the follow-up round above: a GROWING collection must page, not cap.* |
| BUG | **Deaf publishers / stale paged screens** — a worker pinged `selectable_data` and nothing listened; paged rows live outside the row caches. | R15: the live registry (`web/lib/live-resources.ts`) + a ping bus + `useLiveRefetch`; every published resource reaches a listener or a reasoned `DEAF_EXEMPT`. (`live-collections`) |
| BUG | **A 24,011-row catalogue advertised "1000"** (a capped list's length) and the same count showed twice on one screen. | R16: exact server COUNT(*) through the one `formatCount` seam; tab-vs-heading arbitration by React context. (`counted-collections`) |
| BUG | **A double-clicked Deactivate wrote two history rows** 2s apart. | R17: the current-status predicate rides the UPDATE; zero rows moved = no activity, no ping. (`idempotent-transitions`) |
| LEAK | **The team activity feed showed every module's before/after behind one gate.** | R18: it subtracts the caller's denied modules through one clause; every relatedTable resolves through `ACTIVITY_GATE_MAP` or a pinned exemption. (`activity-gate-coverage`) |
| BUG | **The agent answered a DIFFERENT question** — free-text fallback matched 3,465 mentions instead of 134 records. | R19: every list tool exposes + forwards its door's filters, derived from the door's own source. (`agent-filter-parity`) |
| SEC | **Login codes echoed in API responses + a toast** on staging. | B1: echo + var DELETED (inbox-only, every env); ADMIN_KEY-gated staging test-login door mints a normal code for tests. |
| SEC | **Internal doors waved callers through** when `INTERNAL_KEY` was unset. | B2: send-email / log-error / mcp-session all FAIL CLOSED. |
| SEC | **The 5-try attempt cap was burstable** (read-then-write). | B3: one atomic UPDATE checks + consumes a slot (login + email-change). |
| SEC | **Preview URLs were a second public door.** | B4: `preview_urls: false` beside `workers_dev: false` on every non-gateway worker. |
| CRASH | **A hook below an early return white-screened the app** (React #310), and the ErrorBoundary was never mounted. | C1: the boundary is mounted at the root; `hooks-order.test.ts` makes the class unshippable. |
| AGENT | **Bulk tool JSON truncated mid-call** (1024 max_tokens); no set-shaped tool. | C2: `AGENT_MAX_TOKENS` 4096 *(superseded — see the follow-up round above: 8,192, with the bulk cap derived from it)*; a filter-shaped `set_help_status_by_filter` (dry-run counts first, idempotent); the bulk cap is one declared constant; dropdown-never-invents rule. |
| BUG | **The usage log showed an admin four blank rows** with a teammate's name. | C3: `agent_usage_log.kind` (0014) — action rows team-visible, prompt rows the author's; the fold APPENDS its actions, never replaces. |
| UI | **Action rows clipped off the left edge**; the brand mark lost its corners. | C4/C5: flex-wrap + ml-auto; object-contain at `LOGO_SAFE_RATIO` 0.76. |

Also this round: R10 widened with an mcp gating-seam suite (identity-gated writes); every exemption is DATA in the rules registry (B5). Core migration **0014** (`agent_usage_log.kind`) applies before deploy.

## Fixed (2026-07-13) — the invite + credit-fairness round (team testing on staging)

Three real bugs a teammate (chilavert) hit exercising the AI co-pilot's invite flow.
(A fourth report — "chat creates a role but also opens an empty form" — was already fixed
by the one-shell round; re-verified live, no change needed.)

| Sev | Issue | Fix |
|---|---|---|
| MED | **Agent accepted a self / existing-member invite** — asked "which role?" and only failed at the door, wasting a turn (and credits). No explicit self-invite guard existed (blocked only transitively via already-member). | Added a `self_invite` guard in `createInvite` (clear "you can't invite yourself" message) + system-prompt guidance so the agent checks membership and refuses UPFRONT. Verified live: it now says "that's your own email — you're already on the team." (`workers/tenancy/src/lib/invites.ts`, `agent.ts` SYSTEM; `integration.test.ts`) |
| MED | **Dishonest email narration** — the invite email was fire-and-forget, and the agent's "no email was sent" line was free model text, not bound to the real outcome; a *successful* invite mis-narrated as a duplicate would send an email while the bot claimed it hadn't. | `createInvite` now AWAITS the send and returns `emailSent`; the route returns it (first); the agent is told to report it honestly and never claim an email was sent when it wasn't. The invite still succeeds if mail fails (the invite_index row routes acceptance; accept in-app). (`invites.ts`, `routes/invites.ts`, `tool-catalog.ts`, `agent.ts`; `integration.test.ts`) |
| MED | **Charged for refused actions + mislabeled** — a turn that only asked a clarifying question or hit a refused action still cost credits and was titled by the read it ran ("List roles"), not what the user did. | A turn that changed NOTHING (a refused action or a model hiccup) now REFUNDS its metered units (`refundAiUnits` reverses both pools) — a blocked action costs 0. Usage rows title by WRITES only, so a read-only clarify turn reads as the question. Verified live in the credit log (a failed invite → **0 credits**). (`credits.ts`, `agent.ts`; `credit-reconcile.test.ts`) |

## Fixed (2026-07-10) — the unification + one-shell round

The two big structural moves the owner asked for after the hardening round.

| Sev | Issue | Fix |
|---|---|---|
| P1 #2 | **Two tool catalogs drift.** The agent (data-ops) + MCP each hand-declared the same ~two dozen tenancy/content endpoints, so a capability had to be added twice and they could diverge (the drift the owner hit adding list_invites). | Collapsed the 24 overlapping endpoints into ONE `shared/workers/tool-catalog.ts` (SHARED_TOOLS); each surface PROJECTS them (`toAgentTool` / `toMcpTool`) + adds its surface-only tools. `mcpName` preserves the 3 external MCP names. Bonus: the agent gained `list_dropdown_values` (a parity gap). Adding a CRUD tool is now one edit. |
| P1 (new) | **Navigating into a team screen HARD-RELOADED** (static-export boundary), tearing down the SPA + a running agent; the agent's screen-trace couldn't drive across it. | The **whole post-auth app is now ONE shell** — `/home`, `/settings`, `/invitations` render `<DeepLinkScreen/>` like `/t`, `/learning`, `/help`; all in-app nav is soft History-API (`softNavigate` / `go()`), no reload anywhere. Only pre-auth (`/login`, `/onboarding`) is a real navigation. The trace now soft-drives from any screen (EDGE-CASES §1). |

## Fixed (2026-07-10) — the agent hardening round (team testing on staging)

A sweep of real bugs surfaced by the team exercising the AI co-pilot on staging.

| Sev | Issue | Fix |
|---|---|---|
| HIGH | **Agent panel died when the trace entered `/t`** — the off-host screen-trace `router.push`ed into a deep `/t` path, a hard reload (static export) that tore down the running agent + its live steps | The co-pilot is mounted once at the ROOT (`agent-host.tsx`) + its open state mirrors to `sessionStorage` (survives a real refresh; `agent-host.test.ts`). Trace first NARRATED off-host — then **superseded by the one-shell round (above): with no reload boundary left, the trace soft-drives from anywhere** (EDGE-CASES §1). |
| HIGH | **First-turn confirm buttons dead** — a brand-new chat's first dangerous action paused at a confirm whose Go-ahead/Not-now no-op'd (the event omitted `threadId`) | `threadId` added to the `confirm` stream event; client adopts it (EDGE-CASES §6; `stream.test.ts`) |
| MED | **Credit history didn't reconcile** — a confirmed command split into a row + a cryptic "(continued)" row, so it didn't sum to the balance | The confirm turn FOLDS its units into the command's one row; rows are titled by the ACTION taken, not the prompt (DATA-MODEL; `credit-reconcile.test.ts`) |
| MED | **Screen-trace opened a blank input form** and left it open after the record already existed | Trace lands on the RESULT (detail/list), never a dialog; `TraceTarget` has no query field by construction (`trace-parity.test.ts`) |
| MED | **Agent over-confirmed** — it asked before ordinary building (create a role, invite) | Confirm relaxed to **destructive-only** (removals + deactivations + bulk); constructive writes run free (EDGE-CASES §5) |
| MED | **Agent couldn't revoke an invite by email** — `revoke_invite` needs an id but there was no way to list pending invites | Added a `list_invites` read tool to the agent + MCP catalogs (`agent.test.ts`) |
| LOW | **Launcher needed a reload on first login** — the root host mounts before login and its non-reactive session copy never updated | `useActiveTeam` session cache made reactive (pub-sub); the launcher appears the instant you sign in (`agent-host.test.ts`) |
| LOW | **"Blank pills"** — empty tool-only assistant turns painted as empty bubbles on resume | `toChatItems` drops blank-content assistant turns (kept server-side for replay) |

---

## Fixed (2026-07-09)

| Sev | Issue | Fix |
|---|---|---|
| HIGH | Agent could make privilege/identity writes (rename team, change roles, set permissions, invite) with **no confirmation** — reproduced live (a read-only question silently renamed a team) | `confirm: true` on the 7 privilege/identity tools; `agent.test.ts` flipped to the safe contract (`workers/data-ops/src/lib/tools.ts`). **Superseded 2026-07-10:** by owner decision the confirm rule was relaxed to **destructive-only** (removals + deactivations + bulk); the privilege-confirm defense-in-depth was traded for a smoother agent — the fence (untrusted content as DATA) + act-as-user gating + audit remain the primary defenses. See EDGE-CASES §5. |
| HIGH | **Stored XSS**: `parseUploadDataUrl` accepted any MIME (`text/html`, `svg`); gateway served `/media/learning/*` back with it on the app origin (worker-built response, so `_headers` didn't apply) → attacker JS rides a viewer's session, cross-team | Allow-listed inline-safe MIME at the boundary + `mediaHeaders()` adds `CSP: default-src 'none'; sandbox` + `nosniff` on both gateway media branches (`shared/workers/image.ts`, `workers/gateway/src/index.ts`) |
| MEDIUM | AI usage-log returned **every member's raw prompt** to any teammate who opened it | `readUsageLog` redacts the summary to the viewer's own rows (`workers/data-ops/src/lib/credits.ts`) |
| MEDIUM | No anti-clickjacking / MIME / referrer headers served | `X-Frame-Options: DENY` + `nosniff` + `Referrer-Policy` in `web/public/_headers` |
| LOW | Boundary validation gaps: role `description`, team `name`, member/invite ids not type-checked → a non-string body was a **500, not a 400** | `optionalText` / `requireText` / `typeof` guards (tenancy routes) |
| CRIT (forks) | `mcp` binds the core DB but docs said "**five** core-bound workers" → a fork on a shared account silently binds mcp to the ORIGINAL core DB (cross-tenant) | "SIX core-bound workers" everywhere (BOOTSTRAP, OPERATIONS, new-app); OPERATIONS now lists migration 0013 + mcp in the `INTERNAL_KEY` set |
| — | Fork sweep left `brimba.swift-struck.workers.dev` host URLs in the MCP docs | new-app sweep now treats host URLs as live references, not history |

---

## Open — ranked (the "three moves that each kill several findings" first)

### P1 · resilience + leanness — high leverage, real refactors
1. **One `callInternal(path, {cookie, timeout})` seam** (`shared/workers/`). Kills THREE findings at once: the cookie-forward internal-fetch dance is copy-pasted 5+ times (DRY), **no `fetch` has an `AbortSignal`** anywhere — the D1 REST door (`cf()`), cross-worker calls, and the agent's model calls all lack a timeout, so one hung socket stalls a whole worker (resilience) — and the forward executors flatten 403/409/500 into one generic string (status preservation; also the cause of the agent's "stuck pending step"). **Highest-leverage single change.**
2. ~~**Unify the two tool catalogs.**~~ **DONE 2026-07-10** — one `shared/workers/tool-catalog.ts` both surfaces project from (see Fixed above).
3. **Idempotency + partial-failure cleanup on the fleet writes.** `import-confirm` has no idempotency (retry → duplicate rows); `migrateTeams` aborts the whole fleet on the first bad team and leaves schema drift; the module-mover can orphan a DB / double-count on interruption. Add an idempotency guard + per-item try/catch + cleanup.
4. **Close the two error-log blind spots.** The nightly cron catch and the agent model-call catch swallow unexpected errors (console-only / nothing) — invisible in the 90-day `error_logs` table meant to catch exactly those. Add `recordWorkerError` in both.
5. **`d1QueryAcross` uses `Promise.all`** → one slow/failed shard fails an entire split-module read. Use `allSettled` + record the degraded shard.

### P2 · deploy + docs
6. **realtime↔auth cold-start cut.** A genuinely fresh-account first deploy dies `code 10143` (realtime binds auth, auth binds realtime). Document the one-time binding cut as a first-class BOOTSTRAP step AND make `deploy:*` tolerate it — not the current footnote ("in practice auth already exists" — false for `new-app`).
7. ~~**`DEV_ECHO_CODES=1` on staging** echoes login codes in API responses.~~ **DONE 2026-08-04** — the echo (code path + config var) is DELETED, code appears inbox-only in every env; automated sign-in uses the ADMIN_KEY-gated staging test-login door (B1, see Fixed below).

### P3 · structure / honesty
8. **Eight god-files >400 LOC** (`agent.ts` ~570, both `tools.ts`, `api.ts` ~535…) — split by seam. Largely dissolved by #1 + #2.
9. **Reconcile the lean score.** A fresh honest `lean_mean_check` scores **~84–90 (B/A-)**, not the committed report's 93 — the leanness dimension (~73) is dragged by #1 + #2 + the god-files. Either land #1/#2 (which genuinely raises it) or regenerate the report honestly. Don't ship an over-stated score.

---

## The meta-lesson (worth its own guardrail)

Two of the worst issues (the agent confirm gap, the fork-sweep leaving live URLs) **slipped past our own checks because a check encoded the wrong intent** — a test that asserted the vulnerable behaviour as correct, and a sweep rule that treated a live URL as "history." An incumbent review rationalises what's already there. **Schedule a periodic fresh, no-prior-context review** (a clean clone, independent agents) — it finds what the incumbent gate accepts. This is why the base now recommends running the audits against a *pristine* clone, not the working tree.

---

## Scaling round 2 — 2026-08-11 (BREAKING for a fork already on the base)

Six changes a fork must know about before pulling. All are deliberate; none is
reversible by config.

**1 · Eleven mutation endpoints changed shape (LAW R23).** Edit / status /
deactivate doors used to return the whole collection; they now return
`{ updated, total? }`. If your fork calls them directly, switch to
`applyUpdated` (`web/lib/live-resources.ts`). A NULL `updated` means the record
left the list — drop the row.

**2 · The learning upload wire format changed.** It was `POST { dataUrl }` with a
base64 data URL; it is now the raw file as the request body with the file's
`Content-Type`. The old parser (`parseUploadDataUrl`) is gone rather than left as
a second door with its own idea of what mime is safe.

**3 · Two core migrations.** `0016_channel_shards` and `0017_idempotency`. Apply
them BEFORE deploying, or a publish falls back to one shard (safe) and a
mutation carrying `Idempotency-Key` 500s (not safe).

**4 · `teamContext` can now throw 429.** The per-tenant rate ceiling lives there.
It fails open when the binding is absent, so a fork that does nothing sees no
change — but a fork that wraps `teamContext` should let the GuardError through.

**5 · `MemberGuard` is unchanged, but `GatingEnv` may carry `TEAM_LIMITER`.**
Optional; absent is fine.

**6 · Four update libs take an extra `expectedVersion` parameter.** Optional and
last, so existing calls compile unchanged and behave exactly as before.

### Two testing lessons from this round, worth more than the fixes

**The gateway was the only worker `npm test` never ran** — and it is the only
PUBLIC one. Sixteen new tests against it were about to sit on disk looking like
coverage. If your fork added a worker, check it is in the root `test` script.

**A check that hangs under sabotage is no better than one that stays green.** An
over-cap upload test used an endless source stream: with the cap working it
threw immediately, and with the cap BROKEN it looped for ever instead of
failing. Bound the fixtures you sabotage against.

---

## Scaling round 3 — 2026-08-12 (mostly ADDITIVE for a fork)

**1 · A new database, and it is optional.** `error_logs` and `agent_usage_log`
moved to an operations database. If your fork does nothing, `opsDatabase(env)`
falls back to the core database and everything works exactly as before. To adopt
it, follow OPERATIONS.md — create the D1, apply `db/ops/0001_operations.sql`, add
the `OPS` binding, run `scripts/move-to-ops.mjs`.

**2 · Mutation responses lost their `total`.** Edit / status / deactivate doors
return `{ updated }` alone now. An edit cannot change how many rows a collection
HAS — these counts are unfiltered and the base is deactivate-not-delete — so the
count was a full-table scan returning a number that had not moved. If your fork
read `total` off an edit response, read it from the list response instead.

**3 · `forwardToDoor` takes an optional `idempotencyKey`.** Additive; existing
calls are unchanged.

**4 · `updateTeamDetails` takes an optional `expectedVersion`.** Additive, last
parameter.

**5 · A third rate-limit binding**, `HEAVY_LIMITER`. Optional and fail-open like
the other two.

### The lesson from this round

**A sabotage that does nothing looks exactly like a check that works.** One of
mine grabbed the wrong bracket and inserted no code at all — the suite stayed
green and I nearly recorded it as "the check holds". Always confirm the sabotage
actually landed before believing the result.
