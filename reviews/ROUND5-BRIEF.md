# Round 5 — the run at 95

Rounds 1–4 moved the average from 67 to 78 and left nothing at 95. The owner's
benchmark has not moved: **95 or above, on all sixteen.** This round exists to
close that, and it starts by rejecting most of the ceiling table that closed
round 4.

## The ceilings are re-opened, and here is why

Round 4 closed with a table headed "ceilings that are not code". Read again, most
of those rows are not ceilings — they are decisions I made and then recorded as
physics.

| Round-4 cap | What it actually was | Round-5 position |
|---|---|---|
| speed 84 — `ctx.waitUntil` declined | Declined because Law R1's publish-seam check could not SEE a wrapped `publishChange`, so applying it would have left a green check guarding nothing | Fix the check to recognise the wrapped form, then apply the change. A weak check is not a reason to refuse a correct optimisation |
| lean_mean 90 while `reviews/` is tracked | 29,049 lines of campaign reports — 0.7x the product source — that I chose to commit to `main` | Archive under a pushed git tag. Nothing is lost, GitHub keeps it forever, `main` stops carrying it |
| security 92 — `/media/*` outside the surge ceiling | An exclusion, not a law | Bring it inside with a limit sized for images |
| story 88 from words alone | "Three criteria need commits, not prose" | Then make the commits |
| round_trip 78 — the gateway→auth hop IS the spine | True that the hop is the spine; not proven that every request must pay it | Test a local-verification path with a stated revocation window, or record plainly that there isn't one |
| scaling 90 — a ping carries no row data | This one is load-bearing: pings stay contentless because that is what keeps a client without rights from learning row data through the live channel | Likely holds. 66 → 90 is the work regardless |
| ocean 96 — one author | Truck factor. Real, permanent, worth 2 | Holds |
| first_run 95 — needs a real signup | The owner has since performed one | Already spent; recompute at HEAD |

Two survive scrutiny. The rest were self-imposed.

## The non-interference protocol, unchanged from round 1

The owner's requirement has been the same since the first message: fixing one
review must not quietly damage another, and everything has to be reconciled
together rather than review by review.

1. **Measure before touching anything.** Every gap list is produced read-only, by
   an agent that will not perform the repair.
2. **Every gap carries a FIX IMPACT MAP** — for each proposed change, which other
   review it could damage, and how. A fix with no impact map is not scheduled.
3. **Reconcile centrally, once.** Conflicts are settled here, in writing, before
   any file is edited. A settled conflict is never re-argued later in the round.
4. **Repair on disjoint file sets.** Two repairs never share a file. Where they
   must, they are serialised and I do them myself.
5. **Re-measure with agents that wrote none of the repairs.** Every round so far
   has found faults in the round before it; that is the point of the rule.
6. **A check is not admissible until it has been watched to fail.** Fifteen blind
   checks were found across rounds 1–4, four of them written during the campaign
   by the author of the rule against them. Every new check in this round is
   sabotage-proven: break the guarded thing from a copy, watch the check go red
   naming the right file, restore from the copy — never `git checkout`.

## The honest arithmetic

Average 78 → 95 is +17 across sixteen reviews, larger than the entire campaign's
gain so far. The headroom is concentrated: speed, round_trip, scaling, story,
error_log and dead_end together account for most of it, and none of those six is
near a real ceiling. The reviews clustered at 86–94 are the hard part, because
what remains there is genuinely small and genuinely expensive.

Where a target cannot be reached, this round says so with the arithmetic attached,
in the same plain terms round 4 used. A score that is reported as 95 without being
measured at 95 would defeat the entire purpose of the exercise.
