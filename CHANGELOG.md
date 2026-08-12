# Changelog

What changed, newest first. Derived from the commit history — 215 substantive
commits between 2026-06-12 and 2026-08-12, one author.

Brimba is not released as versioned packages; it is deployed. So the milestones
below are the ones a successor actually needs: what shipped to production, and
what a fork already on the base has to know about.

The format is loosely [Keep a Changelog](https://keepachangelog.com). "BREAKING"
means breaking **for a fork already built on this base** — never for an end user.

---

## 2026-08-12 — the operations database, and three audits

**Scaling 90 → 94.** `error_logs` and `agent_usage_log` moved out of the shared
core database into `brimba-ops`. Nothing joins to either, and they were the two
fastest-growing tables competing for D1's 10 GB cap with identity and membership.
Reached through `opsDatabase(env)`, which falls back to the core database when no
`OPS` binding exists — so a fork that does nothing keeps working.

- **BREAKING** — mutation responses no longer carry `total`. An edit cannot change
  how many rows a collection has, so the count was a full-table scan returning an
  unchanged number. Read it from the list response.
- The retry key now reaches the MCP surface: a machine with a retry loop is the
  likeliest retrier there is.
- The team record gained the version guard it was the last record update to lack.
- Uploaded files no record points at are swept nightly, behind a seven-day grace
  period and a reference read that fails closed.
- The expensive doors (agent, import, export, upload) carry a tighter rate ceiling
  on top of the ordinary one.
- **Fixed:** a brand-new record had no version to guard on — a fresh row's
  `updated_at` is NULL, so the very first concurrent edit was unprotected.

**Audits.** lean_mean 93 → 96, story 91 → 98. Four documents were describing a
database layout that had moved; twenty-five seams named across the corpus were
defined nowhere and now are (`BASE-MANUAL.md` §2.5). A rate-limit branch that
could never execute was removed.

## 2026-08-11 — the second scaling pass (70 → 90)

- The live channel splits across up to 32 Durable Objects. The count only ever
  rises, which is what makes it safe to change under open sockets.
- `Idempotency-Key`: a retried mutation replays instead of writing twice.
- A version predicate on record updates — a stale save is a 409, not a silent
  overwrite.
- Uploads stream to R2 instead of arriving base64 through a 128 MB isolate.
  **BREAKING** — the learning upload wire format changed from a JSON data URL to
  a raw request body.
- **LAW R23** — a mutation returns the affected row, never the collection.
  **BREAKING** for eleven endpoints.
- A truncated export says so, in its filename.
- **Fixed:** the gateway — the only publicly reachable worker — was the only one
  `npm test` never ran.
- **Fixed:** the upload's own "safety" counter was the bug. R2 refuses a stream
  whose length it cannot know, and wrapping the body destroyed that.

## 2026-08-11 — the first scaling pass (54 → 70)

Indexes matching the sorts the app actually issues; the module mover stopped
orphaning the data it moved; retention on the exhaust tables with audit tables
off by default; a row ceiling inside a cache entry; `Range` requests on `/media`.

Also the encrypted secrets vault (`secrets.vault` + `scripts/vault.mjs`), so the
credentials survive the laptop.

## 2026-08-11 — the seven fork findings

Faults found while building a module in a downstream fork, each fixed in the base
so no future app inherits them. Added **LAW R20** (every navigable destination
resolves in a fresh tab), **R21** (a create returns the created record) and
**R22** (creating a master record through a form opens it).

## 2026-07-03 — first production rollout

All workers live on production for the first time. The AI agent, Learning, Help,
CSV import and the MCP surface shipped together.

## 2026-06-12 — first commit

The base begins: seven workers, per-team D1 databases, the permission spine.

---

For the full reasoning behind any of these, the document that owns the subject is
listed in [README.md](README.md). What each review found and changed is in
[BASE-IMPROVEMENTS.md](BASE-IMPROVEMENTS.md).
