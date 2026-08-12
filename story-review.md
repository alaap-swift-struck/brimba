# Story review — brimba · 2026-08-12
**Verdict: the story holds.** 98/100. Four holes were found and closed; all four were opened by the scaling work of the last three days, and every one of them would have sent a reader — or a fork — to the wrong place.

## Scores

| # | Criterion | Method | Score | Weight |
|---|---|---|---|---|
| 1 | The docs do not contradict each other | defect | 100 | 14 |
| 2 | Locked decisions still stand | defect | 100 | 13 |
| 3 | Stated guarantees hold end to end | defect | 100 | 12 |
| 4 | Depth is proportional to reach | coverage | 93 | 10 |
| 5 | Every flow says what happens when it fails | defect | 100 | 9 |
| 6 | Edge cases are addressed | defect | 100 | 9 |
| 7 | Nothing is stale | defect | 100 | 8 |
| 8 | Every reference resolves | defect | 100 | 6 |
| 9 | One name per concept | coverage | 90 | 6 |
| 10 | Every capability has an owning document | coverage | 92 | 8 |
| 11 | A newcomer can navigate it | coverage | 100 | 5 |

`total = (1400+1300+1200+930+900+900+800+600+540+736+500) / 100 = 98`

Criterion 10 is 92, well above the gate of 50, so no cap applies.

## What was found and closed

**HIGH · consistency + currency — three documents placed the log tables in the wrong database.**
`DATA-MODEL.md` §agent_usage_log / §error_logs, `ERROR-HANDLING.md` §The central error store, and `BASE-MANUAL.md`'s two-tier table all said `error_logs` and `agent_usage_log` live in the core database. They moved to the operations database on 2026-08-12 and only `SCALING.md` said so. *Risk:* anyone debugging — or forking — opens the wrong database and finds an empty table. **Fixed**, each citing SCALING.md §4.9.

**HIGH · consistency — `DURABLE-OBJECTS.md` stated a count that had stopped being true.**
"one per team and one per signed-in user". Channel sharding makes it up to 32 per team. The *locked* wording in `ARCHITECTURE.md` says "one per channel", which sharding preserves — so no lock was violated — but the document that owns Durable Objects was wrong. **Fixed.**

**MEDIUM · coverage — `ARCHITECTURE.md`, the master, was silent on two structural changes.**
Zero mentions of the operations database or channel sharding. A fork reading the master document would not know either existed. **Fixed** — new sections 1a and 1b.

**MEDIUM · depth — twenty-five seams were named everywhere and defined nowhere.**
`publishChange` in 10 documents, `whoAmI` in 5, `formatCount` in 5, `pagedJson` in 5, and twenty-one more. Every document assumed you already knew the codebase, which is the opposite of what a fork needs. **Fixed** — `BASE-MANUAL.md` §2.5 defines each one with its file, and `ARCHITECTURE.md` §2a explains the live-sync seam properly.

**MINOR · references — four dangling path references.** `SCREEN-ENGINE-PLAN.md` pointed at `lib/recipe.ts` three times (it is `web/lib/screens.ts`); `UI-GAPS.md` pointed at `roles-panel.tsx` (it is `role-detail.tsx`). **Fixed.**

**MINOR · navigability — the document map omitted four documents.** `README.md` did not index BASE-IMPROVEMENTS, mcp-quickstart, AGENTS or AGENT-MODULES-PLAN. **Fixed.**

## Dismissed after reading

- **"workers: 7 vs 12 vs 25 vs 6"** — a false positive. Those BASE-IMPROVEMENTS lines are `grep` commands whose paths contain the word *workers*, not counts.
- **`ARCHITECTURE.md` → `UI-RULES.md`** — resolves in the sibling library repo, by design.
- **`BUILD-A-MODULE.md` → `notes.ts` / `note-detail.tsx`** — the tutorial's worked example, deliberately fictional.

## A note on criterion 4's arithmetic

The probe scores depth by *mentions within one section*, so a one-line definition in a reference table can never satisfy it — a dedicated glossary entry, arguably the best possible form of explanation, scores worst. Per the rubric's confirmation rule I read the sections and scored on that, not on the metric. Stated plainly so the number is auditable: **the probe still reports 25 thin concepts; I judge them defined.** Anyone re-running this will see that disagreement and should check `BASE-MANUAL.md` §2.5 themselves.

## Nothing for the owner to decide
No locked decision is contradicted. No Tier 3 items.
