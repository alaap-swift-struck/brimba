# The Swift Struck way — global habits for every build

> This is the **canonical, public copy** of the Swift Struck global habits. It lives in
> the base repo so it **travels with every fork** — anyone who clones the base (or reuses
> the `new-app` skill) gets it without needing anything from the author's machine. A
> mirror may exist at `~/.claude/SWIFT-STRUCK-WAY.md` for pre-clone reading; if the two
> ever differ, **this repo copy wins**.

These are the habits common to EVERY Swift Struck project. Project-specific canon
(architecture, laws, data model) lives in each repo — read that repo's CLAUDE.md and
README first. This page is what stays true across all of them.

## The two prime directives
1. **Stay lean.** Add the least code that solves the problem; reuse existing seams;
   never add a dependency, worker, table, or abstraction you don't need. Too much
   code is a defect.
2. **The laws are machine-checked, not aspirational.** Agreed rules live as data in a
   registry, are written in a human law-book (RULES.md), and each is enforced by a
   real test. Rule + registry entry + check land together, or the build goes red. A
   rule with no working check is not a law.

## Voice
Warm, plain, sentence case, no jargon, no emoji. Write for a 45–55-year-old manager.
One glossary per app is the single source of product terms — use those exact words in
UI copy and never invent a synonym. When handing the owner shell commands, give
paste-safe blocks (no `#` comment lines — their shell breaks on them) and say which
directory to run them in.

## The library is lego
UI primitives and collections come from `@swift-struck/ui` (its own repo). Apps
assemble screens from them and never fork or hand-roll library components locally.
If a primitive needs changing, flag the gap (the app's UI-GAPS list) and fix it in
the library — then every app inherits the fix.

## The ship pipeline
Local → GitHub → staging (deploy ends with an automated smoke that must pass) →
the quality gates — lean_mean_check (score 92 or better), story_checks_out,
security_sentry (no critical/high), and a clean error store — → reset data only if
the owner asks (destructive; confirm scope) → production, always owner-gated →
merging `main` means "this is what production runs". `npm run check` (types + full
test suite) must be green before any commit; deploy order is realtime-first.

## Security and data habits
- **Act-as-user everywhere.** Every automation surface — the AI agent, imports,
  the MCP tools — acts AS the signed-in user through the same gated endpoints. No
  separate robot role, no privilege it wouldn't have in the UI.
- **Every state-changing route gates.** No write ships without a permission gate
  (requireRight / the gated wrapper / an admin key), or a reviewed identity gate for
  the teamless/ownership cases. This is a machine-checked law (the gating seam), not a
  convention.
- **Deactivate, never delete.** Master records are switched off, not erased; data
  and audit history survive. Every write carries an audit block (actor + timestamp).
- **Validate at the boundary.** Never trust a request body; bad input is a clean
  400, never a 500.
- **Generated, not written.** Anything an agent "knows" about the app's
  capabilities is generated from the app's own catalogs and glossary, so the UI and
  the agent can never disagree.
- **Secrets are never printed, echoed, or committed.** They go in via
  `wrangler secret put` (or the platform equivalent) and live locally only in
  git-ignored `.dev.vars` files.
- **One Cloudflare account per product**, and every worker, database, and bucket
  carries the product's name prefix — the prefix is the project grouping.

## Reset and confirm conventions
Destructive operations always confirm scope first, and production is always named
explicitly — never bundled silently into "both". A reset wipes rows but keeps schema
and migrations; after one, re-seed what the app needs (catalogs, first team) before
calling it usable. Dangerous or bulk actions in-app follow the same rule: one clear
confirm before the act.
