# Data model — Glide Base v3 → Brimba (the mental model)

Every table and column from the user's Glide "Base v3" export (14 CSVs),
re-read 2026-06-13, mapped to Brimba's design. Marks what we KEEP (real
persisted data), what we DROP (Glide UI/computed artifacts), our additions, and
OPEN questions. This is the canonical data-model reference — keep it accurate.

## Glide patterns that are NOT persisted data (dropped everywhere)

Glide columns are a mix of stored data and live "computed columns." These
recur across tables and are **not** real columns in our databases — they are
done at runtime, in the UI, or by an action:

- **Transformers / builders**: `Email transformer/*`, `*/Request body JSON
  object(/string)`, `*/New team JSON object(/string)`, `Onboarding JSON
  object(/string)`, `Accept pending invites JSON(/string)`, `Summary/JSON
  object string` — these built strings/JSON for Glide webhooks. Our workers
  build any payload in code.
- **UI/navigation state**: `*/Detail screen tab view`, `Home/Tab view`,
  `Edit screen/Type`, `Edit screen/Screen title`, `Identity/Current screen
  link`, `App information/*`, `*/Play link`, `Shortcuts/Total count`,
  `Device/Screen size`. This is per-session view state — it belongs to the
  screen engine's runtime state, never the database.
- **Clocks**: `Time/Now`, `Time/Now + 11 minutes` — Glide had no server clock;
  we use real timestamps in workers.
- **Derived values**: `Identity/Full name` (first+last), `Onboarding/Completion
  percentage`, `Profile is filled`, `Is complete`, `*/Is valid email`,
  `Change is available`, `Invite member is possible`, counts — all computed on
  read, not stored.

So: where a Glide table looks like it has 30 columns, most are computed; the
real persisted shape is small. Each table below lists only what we store.

## The audit block (standard, every table)

Glide put this on most tables; we standardize it. **OPEN Q1** = which tables.

- `created_at`, `creator_id`, `creator_email`, `creator_name`
- `updated_at`, `editor_id`, `editor_email`, `editor_name`
- `deactivated_at`, `deactivator_id`, `deactivator_email`, `deactivator_name`

Actor email+name are **snapshots at the time of the action** (so the trail
stays truthful even if that person later changes their name/email). "Archived"
in Glide = our `deactivated_at` (non-null = archived/deactivated).

---

## GLOBAL core (the card catalog — `brimba-core`)

### users  — KEEP (built)
Real data: `id`, `email`, `image_url`, `first_name`, `last_name`,
`onboarding_completed_at`, `current_team_id`. Glide `Row owners/Team keys
string` (the teams a user belongs to) = our **team_members** table.
Dropped: all transformer/onboarding-JSON/tab-view/device columns.
**No-name fallback (2026-06-21):** members can exist pre-onboarding, so
`first_name`/`last_name` may both be empty — display the `email` as the name in
that case; with no `image_url`, show initials (or a placeholder avatar when even
initials aren't derivable).

### teams — KEEP (built)
Real data: `id`, `name` (`Identity/Team name`), `logo_url`. Brimba adds
`database_id`, `db_status`, `schema_version` (the per-team-DB architecture).

### team_members — KEEP (built, GLOBAL)
Real data: `team_id` (`Row owners/Team key`), `user_id`, `role_id`
(`Member roles/Member role ID`). Glide's `Change member role/Updated member
role ID` + `webhook complete` were async-webhook scaffolding — **dropped**;
role change is a direct server action. Membership is global (answers "which
teams am I in?" before we open any team DB).

### email_change_logs — KEEP (BUILT 2026-06-17, GLOBAL — no team key in the export; `db/core/0005_email_change.sql`)
Purpose: change a user's email safely. Real data: audit block + `current_email`,
`new_email`, `expires_at`, `verification_code` (numeric OTP to the NEW email),
`user_input_code`, `email_change_successful`, `email_change_timestamp`. Flow:
request → OTP to new email → match → swap on the user row.
**UPDATED 2026-06-21:** shipped in Phase 2 (`db/core/0005_email_change.sql`).
The login/email-change codes were **split out into a separate hashed
`email_change_codes` table** (the OTP is stored hashed, not in clear on the log
row); `email_change_logs` remains the human-readable security record (old/new
email, outcome, timestamps). The old address is warned on change.

### account_activity — KEEP (BUILT 2026-06-18, GLOBAL — `db/core/0007`)
Purpose: the person's OWN identity history, shown in Settings → Account. NOT
team-tied (per-team `activity` lives in each team DB; identity events belong to
the user across all teams). Real data: `id`, `user_id`, `type`
(`name_changed`/`photo_changed`/`email_changed`), `description` (human
sentence), `created_at`. No actor-snapshot block — the actor is always the user
themselves. Written best-effort by the auth worker on profile/email change
(`workers/auth/src/lib/account-activity.ts`); read via `GET /api/auth/activity`;
rendered with the library `ActivityFeed`. `email_change_logs` is kept alongside
it as the security record (old/new email).

### importable_databases — KEEP (BUILT 2026-06-23, GLOBAL reference — `db/core/0008`)
Purpose: the owner-maintained catalog for the data-import feature — which target
tables can be imported into. Real data: `id`, `table_key` (the target the import
writes into, unique), `display_name`, `description`, `required_columns_json` (the
schema the agent maps an uploaded file onto), `auto_populate_columns_json`
(columns the import may fill itself, e.g. creator + team key),
`reference_dataset_url`, `is_active`, + the audit block (creator/editor). Shared
across all teams, so it lives in the global core DB. Maintained via an owner-only
endpoint (`POST /api/data-ops/admin/seed-targets`, x-admin-key) — a standard
catalog the owner curates, kept SEPARATE from the screen/recipe system (the
earlier "likely merges with recipes" open question was resolved: they stay
separate). Three targets are wired today: `selectable_data` (Dropdown values), `member_roles`, and `learning` — and the agentic multi-file importer (AGENTIC-IMPORT.md) orders them by their declared references.

### agent_usage — KEEP (BUILT 2026-06-23, GLOBAL — `db/core/0009`)
Purpose: the per-team **free** half of the AI agent quota. Real data: `team_id`,
`period` (the metering window, a `'YYYY-MM-DD'` day — the free counter resets
daily), `used` (AI units consumed this window), `updated_at`. One unit = one
model call, metered before EACH call inside a turn (a multi-step turn costs one
unit per step, capped by `MAX_STEPS`; declining a confirm costs nothing; running
dry mid-plan stops the turn with a saved, plain reply). A turn that changes
NOTHING the user wanted — a refused/failed action (e.g. inviting someone already
on the team) or a model hiccup — is **refunded** (`refundAiUnits` reverses both
pools), so a blocked action costs zero; a turn with any successful write keeps its
charge. Once a team is over its
free daily allowance (default **25/day**, per-env via the `AGENT_FREE_DAILY` var
— staging runs 50), the gate spends from the credit balance instead. Lives in
the global core DB so the gate can check it without opening a team database.

### agent_credits — KEEP (BUILT 2026-06-23, GLOBAL — `db/core/0010`)
Purpose: the **purchasable** half of the AI agent quota (the owner's credit-based
model). Real data: `team_id`, `balance` (AI credits remaining, never negative),
`lifetime_granted` (total ever granted, for the admin view), `updated_at`. Once a
team's free daily allowance is used up it spends from this balance; when both are
empty the agent is blocked. Top-ups are an owner action today
(`POST /api/data-ops/admin/grant-credits`, x-admin-key); real payments wire in
later against this same balance (the grant action is the seam). Lives in the
global core DB so the gate can spend a unit without opening a team database.

### agent_usage_log — KEEP (BUILT 2026-07-01, GLOBAL — `db/core/0011`)
Purpose: the usage TRAIL behind the panel's "where did my credits go" view.
Real data: `id`, `team_id`, `actor_id`, `actor_name`, `created_at`, `credits`
(units this command consumed), `source` (`free` / `credit` / `mixed`), `summary`
— titled by the **WRITE action(s) the assistant took** (e.g. `Create the role
"Test" · Invite alaap@… as Test`, with `(failed)` on a refused call), falling
back to the user's prompt for a plain question OR a read-only turn. A READ isn't
an action the user "did", so it never titles the row — a clarifying reply reads as
the question, not "List roles" (the credit-log-clarity feedback). A role-choice
reply like "anything" still leads to a write (the invite), so that write titles
the row; only a turn that makes no change is titled by the prompt. **One row per
user COMMAND**,
written best-effort (a
log hiccup never fails the turn). A command that pauses for a yes/no confirm runs
as two turns (propose + confirm); the confirm turn FOLDS its units into the
propose row (`credits.ts` `foldUsageIntoLatest`) rather than adding a second
row — so the history stays one entry per command and reconciles exactly with the
balance drop (fixed 2026-07-10: a confirmed command used to split into a row +
a cryptic "(continued)" row). Read newest-first, team-scoped, via
`GET /api/data-ops/agent/usage-log`. Lives in the global core DB beside the
quota tables it explains.

### mcp_tokens — KEEP (BUILT 2026-07-07, GLOBAL — `db/core/0013`)

Personal access tokens for the MCP front desk: `id, user_id, team_id, label,
token_hash (sha256; the secret is shown ONCE and never stored), created_at,
last_used_at, revoked_at` (deactivate-not-delete). Verified on EVERY /mcp
request. The same migration adds **`sessions.team_pin`** — a session minted for
a token is PINNED to the token's team (auth answers /me with the pinned team;
short-lived, never slid), so a token can never act outside the team it was
created for.

### error_logs — KEEP (BUILT 2026-07-03, GLOBAL — `db/core/0012`)
Purpose: the central error store (ERROR-HANDLING.md) — one row per UNEXPECTED
failure (worker crash or client-side error), never a clean GuardError refusal.
Real data: `id`, `at`, `source`, `place`, `message`, `stack` (capped), optional
`team_id`/`user_id`/`url`, and the resolve workflow (`status` open→resolved,
`resolved_at`, `resolution_note`). Owner-only doors (x-admin-key):
`GET /api/data-ops/admin/errors` + `POST /api/data-ops/admin/errors/resolve`.
Lives in the global core DB — system health is cross-team; each environment has
its own core DB so staging/production histories never mix.

### selectable_data_types — KEEP (TO BUILD) — Q2 RESOLVED (see Resolutions:
global standard GROUPS + per-team VALUES)
Glide: 3 rows (`File type`, `Learning category`, `Help type`), no team key, no
audit → a tiny GLOBAL reference of dropdown GROUPS. But the values table also
uses `Help status` (not listed as a type) and `Learning category` has no
values. So the types list and the values were loosely coupled in Glide.

---

## PER-TEAM (each lives in that team's own database)

### member_roles + role_permissions — KEEP (built; we split Glide's WIDE → TALL)
Glide `Member roles` was WIDE: `Identity/Title`, `Description`, `Is default`,
then **24 boolean columns** = 6 modules × {read,create,edit,delete}. Modules:
**Teams, Team members, Member roles, Learning, Help, Selectable data** — exactly
our `TEAM_MODULES`. We store the 24 booleans as a TALL `role_permissions` sheet
(role × module × 4 bits) so a new module = new rows, not new columns. `is_default`
flags the seeded Admin (locked) + Viewer. Roles are **edit-live + deactivate-only,
never delete** (holders keep the role). Q4 RESOLVED (see Resolutions): Admin
locked; Viewer is a normal editable role.

### selectable_data — KEEP (built, per-team)
Real data: audit block + `type`, `value`, `is_default`. Per-team dropdown
values, seeded from Base v3 defaults on team creation.

### learning + learning_progress — KEEP (BUILT 2026-06-23, team migration `0004_modules`)
Purpose: a team's own how-to content. `learning`: audit + `category` (a
`Learning category` selectable value, pick-or-create → `selectable_data`),
`content_title`, `content_description`, `content_type` (a `File type` value:
image/video/link…), `content_link`, an in-app `body`, `sequence` (manual
ordering); deactivate-not-delete. **`Details/Seen` is RESOLVED** by a separate
`learning_progress` table (the user×learning join the open question called for):
audit + `learning_id`, `user_id`, and the reversible "mark as done" state, so a
curator dashboard can show every member's done state. Per-module file storage is
R2 (`brimba-learning-media`), not a DB column.

### help + help_threads — KEEP (BUILT 2026-06-23, team migration `0004_modules`, two-tier)
`help` (parent ticket): audit + `help_type` (selectable), `description`,
`screen_recording_link`, the source screen/record capture, `status` on a FIXED
lifecycle (`open` → `in_progress` → `resolved`, with `reopened`; the raiser may
reopen without edit rights), `resolved`, `resolved_on`, `resolver_id/email/name`.
`help_threads` (messages): audit + `help_id` (the parent ticket),
`tagged_team_member_user_ids` (@mention → email notify), `message_body`. A ticket
with a threaded conversation. (Help attachments to R2 `brimba-help-media` are a
deferred hook — see AGENT-MODULES-PLAN.)

### invite_logs — BUILT (per-team, team migration `0003_invite_logs`) + invite_index (GLOBAL, built)
`invite_logs` (full record in the team DB): audit + a FROZEN inviter snapshot
(`inviter_user_row_id`, `inviter_email`, `inviter_full_name`, `inviter_image`),
invitee (`invitee_user_row_id` if they have an account, `invitee_email`,
`proposed_member_role_id`), `created_on`, `shelf_life_in_hours` (default 168h =
the 7-day expiry), `invite_accepted`, `invite_acceptance_timestamp`. Its `id` =
`invite_index.invite_row_id`. Written on invite-create, stamped accepted on
accept (both best-effort — the global index is the routing truth, so a team-DB
hiccup never fails the invite/join). Surfaced on the invite detail (inviter +
acceptance) and as the `invite` activity scope. The GLOBAL `invite_index`
(already built) is the thin routing copy so onboarding can find invites by email
without opening every team DB.

### activity (Glide "All activity") — KEEP (table BUILT, per-team; feed + read path shipped). **Q3 RESOLVED.**
Purpose: the human-readable change feed. Glide referenced the subject row via
**one relation column per table** (`Invite logs/Teams/Member roles/Team members/
Data import sessions Row ID`). Brimba uses a generic `(related_table,
related_row_id)` pair instead → scales to any module without new columns. Per the
Q3 resolution below — **log EVERYTHING** (creations, edits, activations/
deactivations, milestones), superseding the earlier "edits/deactivations only" —
the SAME rows are surfaced four ways by the read path
(`?scope=team|user|role|invite`).

### data_import_sessions — KEEP (BUILT 2026-06-23, team migration `0004_modules`) — the 3-stage import
Real data: audit + the target (`table_key`/display), the column schema, a
`reference_dataset_url`, an `overall_status`, and the three stages of the
file → mapping → confirm session (uploaded CSV text + auto-mapped columns +
preview + the write result). In Brimba the data-ops worker drives the 3 stages
(read → auto-map/validate → INSERT-ONLY write), writing **act-as-user** through
the target's gated create endpoint (so each import respects the caller's
permissions + the module's own validation). Gated by the target's `create`
right — import has no key of its own. **Export needs READ, import needs CREATE**
(the cross-cutting rule). A partial run is NOT a transaction: each row is an
independent gated create, and confirm returns per-row truth — `{created,
skipped, failed}` counts + up to five error messages — recorded on the session
(rows missing required values are skipped at preview; a failed row never blocks
the rest).

### data_import_batches — KEEP (BUILT 2026-07-04, team migration `0006_import_batches`) — agentic multi-file import
Purpose: the shell for an AGENTIC, multi-file import (AGENTIC-IMPORT.md). Groups the
uploaded files, the agent-built PLAN (targets, column mappings, normalizations,
references, dependency order) and the per-row REPORT — all JSON columns here; per-file
parsing reuses the single-target session engine. Real data: `id`, `overall_status`
(draft→analyzing→planned→running→complete), `files_json`, `plan_json`, `report_json`,
the audit block, `completed_at`. Creator-scoped (a batch belongs to who started it),
like `data_import_sessions`. Lives in the TEAM database (the data being imported is the
team's). Execution writes every row through the module's gated create endpoint
(act-as-user → audit parity); the plan step is metered on the AI credit pool.

### agent_threads + agent_messages — KEEP (BUILT 2026-06-23, team migration `0004_modules`) — the AI agent's saved conversations
The agent gets its OWN tables (not help's). `agent_threads`: audit + the thread
title/owner — one saved conversation per row, scoped to its creator (a private
conversation, the audit trail). `agent_messages`: audit + `thread_id` (the
parent thread) + the turn (role + content + any tool calls/results). Every agent
turn is persisted here, so the conversation is replayable and auditable. The
agent acts AS the signed-in user through the same gated endpoints the UI uses, so
these rows are a record of intent, never a separate set of powers.

---

## Status: what's built vs. to build

- **Built**: users, teams, team_members, invite_index, member_roles,
  role_permissions, selectable_data, activity (table only), team_module_databases,
  db_alerts, login_codes, sessions (+ `team_pin`, 0013), account_activity, email_change_logs +
  email_change_codes (the hashed-OTP split; BUILT 2026-06-17), invite_logs
  (per-team audit; BUILT 2026-06-22, M4). **Agent-modules build (BUILT
  2026-06-23)**: importable_databases, agent_usage, agent_credits, mcp_tokens (GLOBAL core
  0008/0009/0010); learning, learning_progress, help, help_threads,
  data_import_sessions, agent_threads, agent_messages (per-team `0004_modules`).
  **Since:** agent_usage_log (GLOBAL core `0011`, BUILT 2026-07-01), error_logs
  (GLOBAL core `0012`, the central error store, BUILT 2026-07-03),
  data_import_batches (per-team `0006_import_batches`, the agentic multi-file
  import, BUILT 2026-07-04).
- **To build (tables)**: selectable_data_types (the only remaining one) — the
  global authoritative dropdown-GROUP list.

Open questions Q1–Q4 (audit scope, selectable types, activity design, role
defaults) were resolved before the foundation build; the "(later)" questions are
now resolved too — learning `Seen` became `learning_progress` (the user×learning
join), import details are the 3-stage `data_import_sessions`, and
`importable_databases` stayed SEPARATE from the recipe/config system (an
owner-maintained catalog).

---

## Resolutions (2026-06-13) — cross-cutting model LOCKED

- **Q1 Audit block → full block on every DATA table** (global core + per-team).
  Pure system/auth tables (sessions, login_codes) stay light — no meaningful
  actor. Actor name+email are point-in-time snapshots.
- **Q2 Dropdowns → global standard GROUPS + per-team VALUES.** The group list
  (file type, help type, help status, learning category, + any the base needs)
  is global + standard so code can rely on a group existing; values inside each
  group are per-team and editable, seeded with defaults. (`selectable_data_types`
  = global; `selectable_data` = per-team, as built.)
- **Q3 Activity → log EVERYTHING (Glide breadth): creations, edits,
  activations/deactivations, and system milestones** (member joined, invite
  sent/accepted, import stage done). Reference the subject row by a **generic
  `(related_table, related_row_id)` pair** — assumption: generic over Glide's
  one-column-per-table, because it scales to any future module without schema
  changes and matches our anti-bloat rule. (Supersedes the earlier
  "edits/deactivations only" rule.)
- **Q4 Roles → Admin locked + team always keeps ≥1 Admin; Viewer is a normal
  editable/deactivatable role.** EDGE — sole admin: the server REFUSES any change
  that would drop a team below one active Admin, and no one can remove or demote
  themselves, so a SOLE admin can't currently leave or be offboarded until they
  promote another member to Admin first. An explicit transfer-ownership /
  leave-team flow (and what becomes of a fully-empty team) is future work
  (ROADMAP) — until then the team simply never reaches zero admins. Role changes are direct, instant server
  actions — Glide's async "updated role id + webhook complete" two-step is
  dropped (it was a Glide limitation we don't have).

Resolved in the agent-modules build (2026-06-23): learning `Seen` shipped as the
`learning_progress` user×learning join; the import-session details shipped as
`data_import_sessions` (the 3-stage session); and `importable_databases` stayed
SEPARATE from the recipe/config system (the locked decision above).
