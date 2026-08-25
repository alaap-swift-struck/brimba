# What to fix at the start of the next project

Written 2026-08-25, from sixteen reviews of a base that had already passed three
audits scoring 95+. Every item below is something that was WRONG here, on a
codebase built carefully, with rules, with tests, by someone paying attention.
That is the point: none of these are exotic. They are the faults that survive care.

---

## 1 · A check that cannot fail is worse than no check

Ten separate rule checks in this repo were blind or half-blind. Not one of them
errored. They passed, for years in one case, and the Law each claimed to enforce
was decoration. The failure is always the same shape: **the check enumerates its
own subject, and whatever it fails to enumerate is invisible rather than failing.**

The ten, by how they went blind:

| How | Example |
|---|---|
| Sliced source to END OF FILE | `src.slice(src.indexOf("export async function x"))` — read every later function's code as this one's |
| Sliced to the next EXPORT | swallowed the private helpers between, and one of their declaration lines matched the gate pattern, so a DELETED security gate stayed green |
| Hardcoded the subject list | `const WORKERS = ["auth","tenancy","content","data-ops"]` — the public gateway and realtime were invisible to the error law |
| Walked the wrong tree | R11 walked `workers/*/src` while carrying an exemption keyed to a `shared/` path it could never reach |
| Filtered on a predicate nothing satisfies | looked for `/search?` or `usePagedList`; no component contained either, so the offender list was always empty |
| Asserted a tautology | `expect(VERBS).toContain(v)` for `v` of a list written on the line above — three of six verbs were written by no code at all |
| Grepped the whole FILE | asked "does this worker record errors?" and matched an unrelated handler forty lines away |
| Read comments as code | a `// no LIMIT needed here` satisfies the bound it describes the absence of |
| Checked one file of many | `registry-integrity` read one document, which is exactly why that one document stayed right and four others drifted |
| Trusted prose | an exemption justified itself with a mechanism that did not exist |

**Do at the start:**

- **One source-reading module, shared, tested.** Not per-check helpers. Ours is
  `shared/test/source.ts`. Every hand-rolled slicer goes wrong in its own way, and
  you will not notice, because going wrong looks like passing.
- **A check is not admissible until you have watched it FAIL.** Break the guarded
  thing, see red naming the right file, restore **from a copy — never
  `git checkout`**, which reverts more than your sabotage. Make this the rule for
  adding a check, not a practice someone remembers.
- **Every check derives its subject list from the code.** Never a written list.
- **Every check carries a tripwire**: assert it found a plausible number of things
  to look at. `expect(seen).toBeGreaterThan(15)`. A scan that finds nothing must
  fail, not congratulate you.

---

## 2 · The session that writes a fix must not be the session that scores it

Three scores fell hard when re-measured by someone who had not written the code:

| | Was | Re-measured | Both measured |
|---|---|---|---|
| interfacelessness | 98 | 81 | same code |
| lean_mean | 97 | 89 | same code |
| activity_log | 94 | 82 | same code |

Nothing regressed. Each earlier score was taken hours after the work it graded, by
the session that wrote it, and measured what the change MEANT rather than what it
DID. The clearest case: a migration added three columns, writers were added, the
score was taken — and nothing read those columns for a week.

Worse, one review had a coverage gap, wrote a document declaring the gap
intentional, cited its own document, and scored 98. It was false the day it
shipped and nothing could notice, because the claim and its evidence had the same
author.

**Do at the start:** a review may never close its own finding by writing prose.
**A documented exclusion must be machine-checked against the code it excludes.**
Ours is twelve lines and would have caught that in July.

---

## 3 · A law gets obeyed in letter and broken in spirit

"A mutation door returns the affected row, never the collection." Every
single-row reader obeyed by reading the WHOLE list and calling `.find()`. The law
moved a full list read off the wire and into the database — and past the list's
own cap, `.find()` misses, the reader returns null, and the client reads null as
"this record was deleted". **Editing row 1,001 made it vanish from the screen.**

**Do at the start:** when you write a law, write the check for the OUTCOME, not
the shape. "Returns one row" is a shape. "Does not read the collection to produce
it" is the outcome.

---

## 4 · The core will be strong and the edges will not

Every review found the same geometry. The transport layer was excellent and the
last hop to a screen was where every point was lost. The foundation was clean and
the last hop to a NEW APP was where it broke — a runbook that could not stand the
system up, because five workers shipped a binding carrying the original author's
database ids and no document mentioned it.

**Do at the start:** budget review effort at the EDGES. The middle gets attention
naturally, because that is where the interesting work is.

---

## 5 · Instrument on day one or you will never have a number

Zero `Server-Timing`, zero `performance.now`, zero logged durations across 222
files. No number existed for any operation, so the performance review could only
report shape. Forty lines emitting a duration on the existing trace seam would
have moved 47 points of weight off the floor.

**Do at the start:** a request id minted at the one public door, carried on every
internal hop, and a duration logged beside it. It is cheap on day one and a
retrofit later.

---

## 6 · Say what a silence means

A worker recorded nothing on crash and looked healthy. A log write swallowed its
own failure, so a database missing one migration lost its whole audit trail
silently. An auth outage returned "you are signed out" — telling a working user a
lie rather than "we are broken".

**Do at the start:** decide, per failure path, whether silence is acceptable — and
where it is, make something else loud. **"It said no" and "it said nothing" are
not the same answer.**

---

## 7 · A fact stated in two documents needs one machine-checked source

Five documents stated five different law ranges. The one that was right was the
only one a test read. That is not a coincidence and it is the whole lesson.

**Do at the start:** generate the derived copies, or check them. Never maintain
the same fact twice.

---

## 8 · Reviews contradict each other, and that is information

Less code versus more tests. More logging versus lower cost. An exact count versus
a fast page. These are not defects in the reviews; they are the real trade-offs of
the system, and the only way to see them is to measure everything BEFORE fixing
anything. Fix-as-you-go hides them and produces rework.

Two examples from this campaign, resolved rather than smoothed over:
- lean_mean wanted a 69-line unreachable read path deleted; `SCALING.md` names it
  a relief valve. **Scaling won, the code stayed.**
- A `ctx.waitUntil` change would have made a hot path faster **and kept the live-sync
  check green while changing what the code does.** Not applied.

**Do at the start:** measure everything, build the conflict map, then repair once.
And keep an absorption budget — ours was roughly 550 lines of duplication and
about three more laws before comprehension dropped a band. Know yours before you
start adding.
