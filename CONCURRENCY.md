# Concurrency — the race-safety ruleset (LOCKED 2026-06-17)

How Brimba (and every app on this base) stays correct when two people act at the
**same instant**. The trap: a check and the write that depends on it run as
separate steps, so two requests both pass the check and both write — e.g. two
admins demoted at once leaving the team with **zero** admins.

## The rule

A write that protects an **invariant** (a count, a balance, "keep ≥1 admin",
stock-on-hand, a uniqueness rule) must be made race-safe by ONE of:

1. **Atomic conditional SQL** — re-check the invariant *inside* the write's
   `WHERE`, then treat "0 rows changed" as "refused". D1/SQLite runs a single
   statement atomically and serializes writes per database, so two concurrent
   statements can't both win. **This is the default** — no extra moving parts.
   - Example: the last-admin rule. `removeMember` / `changeMemberRole`
     (`workers/tenancy/src/lib/members.ts`) keep a friendly pre-check for the
     fast path, then the actual `UPDATE … WHERE … (SELECT COUNT(*) admins) > 1`
     is the authority; `meta.changes === 0` → reject.

2. **A unique index** — for *uniqueness* invariants, let the database reject the
   duplicate. Use a partial index when only some rows are constrained.
   - Example: at most one **pending** invite per (team, email) —
     `db/core/0006_invite_pending_unique.sql`; `createInvite` catches the
     violation and reports it kindly.

3. **A per-entity Durable Object** (serialized read-modify-write) — ONLY for
   **hot, multi-step, contended** entities where many writers hammer one thing
   (an inventory cell, a ledger account, a booking slot). The DO handles its
   requests one at a time; apply the *operation* inside it ("decrement by 2")
   and persist before you ack. Reserved for genuine hot counters — most writes
   don't need it.

## What is NOT a lock

The **realtime `TeamChannel` Durable Object is pub/sub only** — it broadcasts
row-level "X changed" pings and holds no data. This is true for **both** channel
scopes (`team:<id>` and the per-user `user:<id>`): neither is in any write path
and neither serializes anything. Each is just **gated** at connect time the same
way the API is — a `team:` socket requires active membership of THAT team, a
`user:` socket must be your OWN id — but a gate is an auth check, not a lock.
Don't reach for a DO just because a write touches shared data: plain D1 rows +
(1) or (2) above cover almost everything (team name, member list, roles…). A DO
instance is for the rare contended hot entity.

## Picking the tool
- Single-statement invariant (count/floor) → **atomic conditional SQL** (1).
- "No duplicates" → **unique / partial-unique index** (2).
- Hot multi-step counter under heavy concurrent load → **Durable Object** (3).
- **A retryable multi-row operation that must run at most once** (an import, a batch
  job) → **claim it atomically first** (a variant of 1). Flip a status field with a
  conditional UPDATE (`SET status='running' WHERE id=? AND status='planned' RETURNING
  id`) *before* doing the work; only the request that wins the flip proceeds, so a retry
  or a double-click can't run it twice and duplicate every row. A crash mid-run leaves it
  `running` (safe — no duplicates); re-create to retry. Guarded for the CSV importer by
  `workers/data-ops/test/import-idempotency.test.ts`. **The rule: a write a client can
  retry must be idempotent.**

## The two races the rules above do NOT cover (added 2026-08-11)

Everything above protects an **invariant** — a rule the app knows it has. Two
races remain, and neither breaks an invariant, which is exactly why nothing ever
reported them.

### A retried request must not do the work twice
A request can arrive twice: a double-tapped button, a client retrying after a
timeout on a response the server actually sent, a mobile connection resending.

A client may send `Idempotency-Key: <random>`. The first request claims the key
with a primary-key INSERT into `idempotency_keys` — SQLite serialises writers, so
of two simultaneous retries exactly one wins and the other raises. The winner
does the work and stores its outcome; the loser replays it. A FAILED attempt
releases its claim, so a retry is a real retry rather than a permanent refusal.

Wired at the three ROUTES dispatchers (`shared/workers/concurrency.ts`), so every
team-data mutation is covered. **No key means no query** — the ordinary path is
untouched. On the client, `FormShell` keeps the key across a failed submit and
drops it after a successful one: reusing it after success would replay the last
save and silently discard the new edit.

### A save must not overwrite one it never saw
Two people open a record, both edit, both save; the second overwrites the first
with fields read before it existed. `versionPredicate` adds
` AND updated_at = '<what the editor was shown>'` to the UPDATE, with `RETURNING`
so a write that lands on nothing is a **409**, not a success. The predicate is
EMPTY when the caller states no expectation, so an existing caller is unchanged.

Same principle as everything above — the condition rides the write — extended
from "an invariant the app declared" to "the state the caller believed it was
acting on".

## While a write is in flight
Serialized or not, the user should never see a dead UI — show feedback
(button spinner + disabled, optimistic update, toast). See the **Loading &
feedback** section of [CACHING.md](CACHING.md).

See [ARCHITECTURE.md](ARCHITECTURE.md) for the Durable-Object code-vs-runtime
model that powers tool (3).

## The attempt limit is atomic (login codes)
A "5 tries" limit written as *read the count, then check, then increment* is
**burstable**: under concurrency N wrong guesses all read `attempts = 4` and each
gets a free try. The fix (LAW-adjacent, B3) is to make the check and the increment
**one statement** — consume a slot in the same UPDATE that enforces the cap, and
read the changed-row count back:

```sql
UPDATE login_codes SET attempts = attempts + 1
 WHERE id = ? AND attempts < ? AND consumed_at IS NULL
```

Zero rows changed = the cap is spent (a correct code consumes a slot too, then
succeeds — the cap counts *tries*, not failures). The login flow and the
email-change flow both use this shape (`workers/auth/src/index.ts`,
`lib/email-change.ts`). Same principle as the never-negative credit decrement
(`WHERE balance > 0`) and the last-admin guard: the invariant rides the WHERE, so
the database enforces it atomically instead of the application racing itself.
