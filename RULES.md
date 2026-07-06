# RULES.md — the Laws of the Base (machine-checked)

These are the **laws** every part of Brimba (and anything built on top of it) must
obey. They are not style suggestions — each one is enforced by a real test, so a
change that breaks a law turns the build **red**. This is how an agreed rule
actually sticks instead of quietly slipping over time.

The single source of truth is **`shared/rules/registry.ts`** (the laws as data).
This document is the human-readable twin; a check (`registry-integrity`, in
`web/test/rules.test.ts`) asserts this table lists **exactly** the law ids in the
registry — so the doc and the code can never drift. **You cannot add a law without
its check, and you cannot add a check without its law.**

Deny-lists (the reviewed exceptions for each law) live as DATA in the registry, so
every exception is a visible, conscious line — never a silent bypass.

| ID | Dimension | Law (plain English) | Check (test id) | Status |
|----|-----------|---------------------|-----------------|--------|
| R1 | arch | Every mutation route publishes a live change ping (so screens stay live). | `publish-seam` (per-worker tests: tenancy, content, data-ops; auth's two user-channel publishes are the reviewed, untested exception — CACHING rule 5) | enforced |
| R2 | ui | Every record-detail screen exposes Overview + Activity tabs. | `record-detail-tabs` | enforced |
| R3 | ui | Collection tab strips use the library TabsView (icon + count badge) — no hand-rolled button toggles. | `no-handrolled-toggles` | enforced |
| R4 | ui | Every form/dialog renders through the shared FormShell (title+subtitle · separator · fields · separator · action). | `forms-use-formshell` | enforced |
| R5 | arch | Record activity is read through ONE generic (table, id) path — any module's history, no per-module read SQL. | `generic-activity-path` | enforced |
| R6 | ui | Product terms live in ONE glossary (clear, brief, no over-explaining) — the app speaks one dictionary. | `glossary-wellformed` | enforced |
| R7 | ui | Every form dialog persists its draft per session (useFormDraft) — unsaved input survives navigating away (CACHING.md §11). | `forms-persist-drafts` | enforced |
| R8 | ui | Every team collection tab derives its count from its loaded rows — a placement:'tab' section that shows a collection must declare a countCacheKey. | `tab-counts-derived` | enforced |
| R9 | arch | The agent knows what the app can do — its system prompt carries a capability brief GENERATED from the import/export catalog (+ the glossary), so the UI and the agent can never disagree about a capability. | `agent-app-parity` (workers/data-ops/test/agent-parity.test.ts) | enforced |

## How to add a new law

1. Add a row to `RULES_REGISTRY` in `shared/rules/registry.ts` with a real
   `checkId`.
2. Write the check (a per-worker test, or a case in `web/test/rules.test.ts`).
3. Add the matching row to the table above.

The `registry-integrity` check verifies steps 1 and 3 stay in sync. A rule with
no working check is not a law — delete it or write the check.

## Dimensions

Laws are cross-cutting: **arch** (architecture/data), **ui** (interface),
**workflow** (how we build), **ai** (the assistant). A future `R9 (ai): every
agent tool maps to a gated route` is a natural next row once the tool catalog
stabilises.
