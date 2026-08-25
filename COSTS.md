# COSTS.md — what Brimba costs to run

**Read date: 2026-08-25.** Every price below was read from the vendor's own
pricing page on the date in its row, not from memory. Prices move; the read date
is what tells you whether this document is still true. Author: the base team.

This document exists because three rounds of cost arithmetic lived only in review
files, where a review file is not a place anyone looks before shipping. If you
change a price, a quota, a model, or a scheduled job, change the number here in
the same commit.

## 1 · The standing volume this document is priced against

Every figure is against one stated shape of use. It is an estimate, and it is
labelled as one everywhere it appears.

| Assumption | Standing figure (24 Aug 2026) |
|---|---|
| Signups | 1,000 / month |
| Imports | 500 / month |
| Agent replies | 20,000 / month |
| Agent turns per reply | 2.5 (mean) |

If your real numbers differ by more than about 2×, re-derive rather than
extrapolate — several of the costs below are step functions, not slopes.

## 2 · The price table

| Line | Free allowance | Price after | Source, read |
|---|---|---|---|
| Workers requests | 10,000,000 / mo | $0.30 / 1M | Cloudflare pricing, 2026-07 |
| D1 rows written | 50,000,000 / mo | $1.00 / 1M | Cloudflare pricing, 2026-07 |
| R2 Class A (includes `list`) | 1,000,000 / mo | $4.50 / 1M | Cloudflare pricing, 2026-07 |
| Durable Object requests | 1,000,000 / mo | $0.15 / 1M | Cloudflare pricing, 2026-07 |
| Workers Logs | 20,000,000 events / mo | $0.60 / 1M | Cloudflare pricing, 2026-08-25 |
| Resend (email) | 3,000 / mo | Pro $20/mo → 50,000 | Resend pricing, 2026-08-25 |
| Anthropic (model) | — | per-token, see §4 | Anthropic pricing, 2026-08-25 |

**A September cancellation applies to one line item** — it is recorded in
`INVENTORY.md` beside the surface it belongs to, so that the inventory and this
document do not drift apart with two copies of the same fact.

## 3 · Cost per user action

The three actions worth costing, because they are the three that scale with use.

| Action | Cost | What dominates |
|---|---|---|
| One signup | **$0.000415** | a handful of D1 row writes and one email |
| One import | **$0.0122** | the planning turns, not the row writes |
| One agent reply (worst case, 12 steps) | **$0.152** | model tokens |
| One agent reply (mean, 2.5 turns, cached) | **$0.025646** | model tokens |

## 4 · What prompt caching bought

The agent's system prefix — the capability brief, the glossary, the tool
catalogue — is stable across turns and identical for every caller, in a fixed
order, never filtered by rights. That makes it cacheable. A cache write costs 25%
more than a plain input token; a cache read costs 90% less.

```
one reply, mean 2.5 model turns, prefix 6,209 tokens, ~750 tokens added per step

  without caching                                   $0.039306 / reply
  with caching                                      $0.025646 / reply
  saving                                            $0.013660 / reply
                             x 20,000 replies/mo  =   $273.20 / month
```

Monthly model spend at the standing volume: **$786.12 → $512.92**, a 35% cut.

The cache marker is one `cache_control` breakpoint on the system block
(`workers/data-ops/src/lib/model.ts`). Claude renders tools → system → messages,
so a single marker on the system block covers the tools too. Moving that marker,
or letting anything per-request, per-team or per-user into the prefix, deletes
this saving silently — there is no error, only a bigger bill.

## 5 · What one team is entitled to

`AGENT_FREE_DAILY = 50` is a business decision, not a bug, and it is the single
largest per-tenant cost the base carries.

```
50 credits/day x 30.4 days   = 1,520 turns / team / month
at ~2.5 turns per reply      =   608 replies
                             =   608 cache writes, 912 cache reads
                             =  $15.89 / team / month
```

**$24.20 → $15.89 per team per month** after caching — a 34% reduction in the
free entitlement's cost. The realistic bracket is **$7.21 – $28.91**, the spread
depending on how the turns fall across the day (a reply more than five minutes
after the last one pays a cache write rather than a cache read).

There is no account-wide ceiling. Every quota read is scoped `WHERE team_id = ?`,
so a hundred teams on the free entitlement is a hundred times $15.89 with nothing
in the system that notices. The nightly alarm in §6 is what makes that visible.

## 6 · Scheduled work

The nightly cron is declared **twice** — once for production and once for
staging (`workers/tenancy/wrangler.jsonc`). Everything below therefore happens
**twice a night, once per environment**, and every ceiling in this section is a
per-environment ceiling.

| Job | Per-run ceiling | Cost shape |
|---|---|---|
| Core retention | 20 passes | D1 row deletes |
| Team retention | 1 pass | D1 row deletes |
| Orphan upload scan | 10,000 references | R2 Class A per team |
| Database size check | one per database | D1 reads |

**Retention's per-run ceiling is 500,000 rows per night per environment.** A
clean table costs one query and exits, so the ceiling is a ceiling and not a
cost. A bound that is actually hit writes a real alert row rather than passing
silently — that is the difference between a limit and a leak.

## 7 · The costs that are failure-shaped, not traffic-shaped

Two lines do not scale with how much the app is used, but with how badly it is
going. They are worth separating because a budget built on traffic will not see
them coming.

- **Error rows** — one D1 row per 5xx. At the standing volume this rounds to
  nothing; during an incident it is the fastest-growing table in the system.
- **Retries** — `shared/workers/d1-rest.ts` retries twice on 5xx and network
  failure, and it wraps *every* D1 REST call. A sustained 5xx storm therefore
  triples D1 volume, and it does so inside the nightly per-team loop, which is
  the one place the multiplier compounds.

## 8 · How to keep this document honest

- Change a price, a quota, a model, or a cron → change this file in the same commit.
- Every price row carries the date it was read. A row with a stale date is a
  finding, not a detail.
- Per-surface inventory (what is switched on, in which environment, and what
  bills for it) lives in `INVENTORY.md`. This document prices; that document
  enumerates. Neither repeats the other.
