# Agent + Modules — the build plan (LOCKED 2026-06-22)

The next big build on top of the shipped base: **learning + help + data import + the
AI agent + MCP**, as ONE continuous build on branch `agent-modules`, green at every
step, with a single staging ship at the end (owner gates production). The **54 product
decisions** behind this live in the design memory (two Q&A passes); this doc is the
ordered BUILD MAP. Don't relitigate decisions — see the design notes; ask only at a
genuine new fork.

## Guiding rules (carried from the base build)
- **Green at every step** — `npm run check` passes after each phase.
- **The agent acts AS the signed-in user**, through the SAME gated endpoints the UI
  uses (no separate agent powers). Bounded by the invoker's permissions, always.
- **Agent = leverage, not a crutch** — the in-app experience is a VISIBLE co-pilot
  that drives the real screens (overlay + Stop); trivial use should feel slow.
- **R2 golden rule** — one bucket PER MODULE, per-team key prefix inside.
- **Live-sync** — every new mutation publishes a row-level ping; bulk = one list-ping.
- UI comes ONLY from `@swift-struck/ui` — owner runs the library prompts; this repo
  wires what the library ships.

## Phases (in order)

### Phase 1 — Foundation (no new UI)
- **Team-schema migration `0004_modules`** (per-team, in `team-schema.ts`): `learning`,
  `learning_progress` (user×learning), `help`, `help_threads`, `data_import_sessions`,
  `agent_threads`, `agent_messages`. Each with the standard audit block.
- **Core migrations** (`workers/auth/migrations`): `importable_databases` (GLOBAL
  owner-maintained import catalog) + `agent_usage` (per-team AI-usage/quota counter).
- **Permission matrix** — add `screens` + `agent` to `TEAM_MODULES` + labels + seed
  (Admin full; others: agent read+create [use it], no screens, no edit/delete history
  beyond own). Import has NO key — gated by the target table's `create` right.
- **Shared types** for every new entity.
- Gate: `npm run check` green.

### Phase 2 — Module server logic (no new UI)
- **Learning** (`workers/content`): CRUD (editor-gated) + in-app body + sequence +
  pick-or-create category (→ `selectable_data`) + per-user `mark done` progress
  (curators see all). Keyword-searchable for the agent.
- **Help** (`workers/content`): ticket CRUD + threaded replies (@mention = notify) +
  fixed status lifecycle (open/in-progress/resolved/reopened; raiser reopens) + My/All
  tab queries + source screen/record capture + attachments (R2). Email on reply/@mention.
- **Import** (`workers/data-ops`): the 3-stage session against the global catalog;
  preview-then-write; one list-ping per table.
- All gated, all publish live pings; reuse `lib/notify.ts`.
- Gate: green + unit/integration tests for the guards.

### Phase 3 — Agent brain + MCP
- **`workers/data-ops`**: the swappable model interface (Claude default for agentic;
  Workers AI for cheap inline + the help-draft fallback) ; the act-as-user executor
  calling the gated endpoints ; the confirm rule (>1 row OR delete-type OR a dangerous
  table) ; the identity-act hard-blocks ; fence-untrusted-data ; per-team quota gate ;
  agent-vs-human + source audit ; saved threads (own tables) ; the help first-draft ;
  the import driver ; multi-step stop-and-report.
- **`workers/mcp`** (separate piece): personal access tokens (hashed, shown-once,
  revocable, pinned to one team, live role-check) → bridged to a real session ; the
  OPT-IN tool catalog (only tagged actions) ; abuse bounded by the quota.
- Gate: green + tests (token gating, confirm rule, fence, quota, tool catalog).

### Phase 4 — UI wiring (depends on the library prompts landing)
- The agent chat panel + the visible co-pilot overlay (drive real screens + Stop) ;
  learning screens (body + progress) ; the import wizard + preview ; help My/All tabs +
  ticket detail + attachments — all via the screen engine + the new library components.

### Phase 5 — Quality + docs + ship
- Playwright e2e for the new flows ; lean-mean ≥92 ; story-check clean ; adversarial
  review of the diff → fix ; reconcile ARCHITECTURE/DATA-MODEL/CACHING/OPERATIONS ;
  ONE `/ship-staging`. Owner tests, then gates production (apply new core+team migs
  first; realtime-FIRST deploy order).

## New infra
- **R2 buckets**: `brimba-help-media`, `brimba-learning-media`, `brimba-import-media`
  (+ `-staging`), per-team key prefixes.
- **Workers**: `content` + `data-ops` + `mcp` (gateway stays the single public door;
  it routes the in-app agent + the external MCP surface).
- Deploy order extends the realtime-first rule: realtime → content/data-ops/mcp → auth
  → tenancy → gateway (anything a binder needs must exist first).
