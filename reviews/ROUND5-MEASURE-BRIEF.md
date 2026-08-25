# Round 5 — how to re-measure

Read this in full before scoring anything. It is the shared half of every
re-measurement prompt in this round, and it exists because round 4 closed with
six of sixteen scores wrong in ways that had nothing to do with the code.

## The one rule

**You did not write any of these repairs, and that is the point.** Every round of
this campaign has found faults in the round before it — including four checks
written on the same day, by the author of the rule against them. Measure the code
as it is at HEAD. Do not take a previous report's word for anything.

## Score it the rubric's way, not the last report's way

Round 4 lost points to arithmetic four separate times:

- **security_sentry** substituted its own formula (`Σnum ÷ Σden`) for the skill's
  published weighted mean, and counted 2 MEDIUM + 3 LOW as a penalty of 12
  instead of 9. Both deviations pushed the same direction. It was 88, reported 83.
- **story_checks_out** ran a DEFECT criterion as a running delta off the previous
  round, where the rubric says such a criterion restarts at 100 each run.
- **base_fork** scored a criterion 67 where the rubric says in terms: *"unmeasured,
  not zero. Say so, and score it as unmeasured rather than inventing a number."*
- **ocean** asserted criterion 1 rather than measuring it from its own rows.

So: **open your skill's rubric, use its published arithmetic, and show your
working.** If your reading of the rubric disagrees with the last report's number,
say so explicitly and give both — a correction that cannot be recomputed by
somebody else is just a different opinion.

## Report the number you measure

The owner's benchmark is 95 and has not moved. That is not permission to arrive
at 95. A score reported as 95 without being measured at 95 destroys the only
thing this exercise produces. **When the honest number is ugly, report the ugly
number and the list that fixes it.**

If a target is genuinely unreachable, say so with the arithmetic attached: which
criteria are at their caps, what the caps are, and what the maximum therefore is.

## What changed since you were last run

Round 5 was large. Rather than list it, read `git log --oneline` on
`review-round5` and `reviews/ROUND5-RECONCILIATION.md`, which records what was
deliberately NOT repaired and why — those are settled, and re-filing one as a
finding is how a reconciliation gets re-argued every round.

Four things are worth knowing before you score:

1. **Three update doors were destroying data** — an omitted field was treated as a
   cleared field, so asking the assistant to rename an article wiped its body, and
   granting a role one module's rights zeroed the other six. Fixed, with tests
   watched to fail first.
2. **The performance picture was measured properly for the first time.** Every SQL
   statement in this app runs in 0.1–0.3 ms. The latency is network distance: the
   core database is in APAC, the team databases are in WEUR. Round 4's "everything
   inside budget, 2–9 ms" was measuring health endpoints that do no work.
3. **Three faults were found in the module every law check reads source through** —
   a regex literal containing a quote made sixteen files leak their comments into
   what checks read as code; a path helper ate the first character of every path,
   so prefix-based exemptions matched nothing; and every directory under `workers/`
   was treated as a worker, so vitest's own cache turned thirteen checks red.
4. **Several checks were blind and are now sabotage-proven.** Where you find a
   check, ask what it would take for it to fail. A check nobody has watched fail
   is not evidence, and this campaign has now found eighteen that guarded nothing.

## What to hand back

- The arithmetic, in full, recomputable by hand from numbers you print.
- Your score, and the previous one, and the difference — with the cause of the
  difference named as *code changed* or *the last measurement was wrong*.
- A ranked list of what still costs points, each with the concrete change.
- **A fix impact map**: for every item you propose, which OTHER review its fix
  could damage, and how. An item without one is not schedulable.
- Anything you found that no rubric asked about. Round 5's most valuable findings
  all came from agents reading the surrounding code on the way past a scoring
  task — none of them were on any rubric.
