# Campaign brief — read this before you start

You are running ONE read-only review as part of a 16-review audit of **Brimba**, a
multi-tenant SaaS base: 7 Cloudflare Workers (auth, tenancy, realtime, gateway,
content, data-ops, mcp), per-team D1 databases over a REST door, a global core D1,
and a static-export Next.js web app.

## ABSOLUTE RULE — you are READ-ONLY

Do **not** edit, create, or delete any file in this repository except your own report
at `reviews/<slug>.md`. No `npm install`. No deploys. No git commands that change
state. No `--fix` mode, no auto-repair, no "safe" tier-A edits.

Fifteen other agents are reading this same repository right now. One write corrupts
the campaign. Repairs happen later, serialized, in the main session.

Need scratch space? Use
`/private/tmp/claude-501/-Users-alaap-kanchwala-apple-Desktop-brimba/ff86b57b-0062-423f-b944-9c93a3d1e9c6/scratchpad`
— never the repo.

## Your skill

Invoke your named skill with the Skill tool. If that fails, read
`/Users/alaap_kanchwala_apple/.claude/skills/<name>/SKILL.md` plus its `assets/` and
follow it exactly. **Wherever the skill says to repair, auto-fix, or apply anything —
skip that step and report the fix instead.**

## Read first

`CLAUDE.md` and `RULES.md`. This base has 25 machine-enforced Laws (R1–R25) with tests
that read source off disk. A fix that breaks a Law is not a fix. If your best
recommendation conflicts with a Law, say so explicitly rather than proposing it silently.

## How this codebase lies to reviewers

Four failure modes, all hit for real in the last week. Assume your own probe is wrong
until you have read the code it points at:

- A rule check that slices source off disk can match **past the end** of what it thinks
  it is reading, so it stays green forever. One such check had been blind since the day
  it was written. Before crediting a check, confirm it would actually catch a violation.
- A regex can parse **English prose in comments as code**. One probe invented 14 tables
  from the words "the", "what", "refuse", "carries". Read the line before counting it.
- `grep 'px-\[10%\]'` returns **0** because Tailwind escapes `%` as `\%` in generated CSS.
  A zero result is a hypothesis, not a fact.
- `npx tsc` against an empty `node_modules` **silently passes**. Confirm your tool ran.

## Never tune a count

Print every numerator, denominator and weight so the total can be recomputed by hand.
An honest 71 is worth more than a flattering 96 — the entire purpose of this campaign is
finding what is actually wrong. A falsely reassuring score is the most damaging thing
you can produce, because it retires the suspicion that would have found the real fault.

If something needs live cloud data you cannot reach, mark it **unmeasured** and say so.
Never infer a numerator from a claim in a doc; only what the code shows counts.

## Your report — write to `reviews/<slug>.md`

```
# <Review name> — Brimba · 2026-08-25
SCORE: <n>/100   (previous: <n or "never run">)

## Arithmetic
<every criterion: name, score, weight, and the counted numerator/denominator behind it>

## Findings
<severity-ordered. each: plain English what · file:line · why it matters · the fix>

## FIX IMPACT MAP        <-- the campaign depends on this section

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |

One row per proposed fix. Answer the last column CONCRETELY. Real tensions in this base:
  - adding code, tests or seams raises robustness but lowers lean_mean (less code is better there)
  - adding logging raises activity_log but costs spend_review and speed_review
  - adding an index raises speed but costs storage and spend
  - removing an abstraction raises lean_mean but can raise coupling in architecture
  - adding a timeout or retry raises robustness but can lower speed
If a fix is genuinely neutral, write "none — <one-line reason>". Never leave it blank.

## CEILING
Is 95 reachable by changing code? Name any criterion capped by something a commit
cannot fix (single author, a platform limit, a locked decision in ARCHITECTURE.md),
and state the true maximum if 95 is not reachable.
```

## Return to the main session

**At most 400 words.** The score, your top 3 findings, every cross-review tension you
found, and the ceiling verdict. Full detail lives in the file, not in your reply.
