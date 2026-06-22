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

## While a write is in flight
Serialized or not, the user should never see a dead UI — show feedback
(button spinner + disabled, optimistic update, toast). See the **Loading &
feedback** section of [CACHING.md](CACHING.md).

See [ARCHITECTURE.md](ARCHITECTURE.md) for the Durable-Object code-vs-runtime
model that powers tool (3).
