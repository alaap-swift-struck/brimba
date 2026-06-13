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

### teams — KEEP (built)
Real data: `id`, `name` (`Identity/Team name`), `logo_url`. Brimba adds
`database_id`, `db_status`, `schema_version` (the per-team-DB architecture).

### team_members — KEEP (built, GLOBAL)
Real data: `team_id` (`Row owners/Team key`), `user_id`, `role_id`
(`Member roles/Member role ID`). Glide's `Change member role/Updated member
role ID` + `webhook complete` were async-webhook scaffolding — **dropped**;
role change is a direct server action. Membership is global (answers "which
teams am I in?" before we open any team DB).

### email_change_logs — KEEP (TO BUILD, GLOBAL — no team key in the export)
Purpose: change a user's email safely. Real data: audit block + `current_email`,
`new_email`, `expires_at`, `verification_code` (numeric OTP to the NEW email),
`user_input_code`, `email_change_successful`, `email_change_timestamp`. Flow:
request → OTP to new email → match → swap on the user row.

### importable_databases — KEEP (TO BUILD, GLOBAL reference)
Purpose: registry for the AI import feature — which tables can be imported.
Real data: `table_id`, `table_name`, `screen_name`, `required_fields` (JSON:
column-id → field), `default_fields` (JSON: auto-populated, e.g. creator + team
key), `reference_dataset_url`, `notes`, `access_rights` (the right needed, e.g.
`can_create_selectable_data`). **OPEN Q (later)**: likely merges with the
config/recipe system, since "a table's importable fields" overlaps a screen's
field recipe.

### selectable_data_types — KEEP (TO BUILD) — **OPEN Q2 (scope)**
Glide: 3 rows (`File type`, `Learning category`, `Help type`), no team key, no
audit → a tiny GLOBAL reference of dropdown GROUPS. But the values table also
uses `Help status` (not listed as a type) and `Learning category` has no
values. So the types list and the values were loosely coupled in Glide. Need to
decide: global authoritative group list vs per-team. (Q2.)

---

## PER-TEAM (each lives in that team's own database)

### member_roles + role_permissions — KEEP (built; we split Glide's WIDE → TALL)
Glide `Member roles` was WIDE: `Identity/Title`, `Description`, `Is default`,
then **24 boolean columns** = 6 modules × {read,create,edit,delete}. Modules:
**Teams, Team members, Member roles, Learning, Help, Selectable data** — exactly
our `TEAM_MODULES`. We store the 24 booleans as a TALL `role_permissions` sheet
(role × module × 4 bits) so a new module = new rows, not new columns. `is_default`
flags the seeded Admin (locked) + Viewer. Roles are **edit-live + deactivate-only,
never delete** (holders keep the role). **OPEN Q4**: Viewer locked or editable?

### selectable_data — KEEP (built, per-team)
Real data: audit block + `type`, `value`, `is_default`. Per-team dropdown
values, seeded from Base v3 defaults on team creation.

### learning — KEEP (TO BUILD)
Purpose: a team's own how-to content. Real data: audit + `category` (a
`Learning category` selectable value), `content_title`, `content_description`,
`content_type` (a `File type` value: image/video/link…), `content_link`,
`sequence` (manual ordering). `Details/Seen` = **OPEN Q (later)**: per-user seen
needs a user×learning join — not a single column.

### help + help_threads — KEEP (TO BUILD, two-tier)
`help` (parent ticket): audit + `help_type` (selectable), `description`,
`screen_recording_link`, `status` (a `Help status` value), `resolved`,
`resolved_on`, `resolver_id/email/name`.
`help_threads` (messages): audit + `parent_record_id` (the help row),
`tagged_team_member_user_ids`, `message_body`. A ticket with a conversation.

### invite_logs — KEEP (TO BUILD, per-team) + invite_index (GLOBAL, built)
`invite_logs` (full record in the team DB): audit + inviter snapshot
(`user_row_id`, `email`, `full_name`, `image`), invitee (`user_row_id` if they
exist, `email`, `proposed_member_role_id`), `created_on`, `shelf_life_in_hours`,
`invite_accepted`, `invite_acceptance_timestamp`. The GLOBAL `invite_index`
(already built) is the thin routing copy so onboarding can find invites by email
without opening every team DB.

### activity (Glide "All activity") — KEEP (TO BUILD) — **OPEN Q3 (design)**
Purpose: the human-readable change feed. Glide referenced the subject row via
**one relation column per table** (`Invite logs/Teams/Member roles/Team members/
Data import sessions Row ID`). Brimba uses a generic `(related_table,
related_row_id)` pair instead → scales to any module without new columns. Glide
logged creations + milestones ("New team created", "New member joined", import
stages); the user's rule is edits/activations/deactivations only. (Q3.)

### data_import_sessions — KEEP (TO BUILD, per-team) — the 3-stage import
Real data: audit + `table_id`, `table_name`, `required_columns_json_schema`,
`auto_populate_column_json_schema`, `reference_dataset_url`, `overall_status`,
and three stage blocks — **File validation** (`uploaded_file_url`, `is_complete`),
**Data extraction** (`response_body`, `status_code`, `view_preview`,
`is_complete`), **Import via API** (`response_body`, `api_call_initiated`,
`response_code`, `is_complete`) — plus **Completion** (`is_complete`,
`completed_on`, `completor_*`) and a `summary_json`. In Brimba the same 3 stages
are driven by the data-ops worker + Workers AI (read → normalize/validate →
import). **OPEN Q (later, when we build import).**

---

## Status: what's built vs. to build

- **Built**: users, teams, team_members, invite_index, member_roles,
  role_permissions, selectable_data, activity (table only), team_module_databases,
  db_alerts, login_codes, sessions.
- **To build (tables)**: email_change_logs, importable_databases,
  selectable_data_types, learning, help, help_threads, invite_logs,
  data_import_sessions — added per module as we reach it.

Open questions Q1–Q4 (audit scope, selectable types, activity design, role
defaults) are being resolved with the user before the foundation build; the
"(later)" questions (learning Seen, import details, importable-vs-recipe merge)
are resolved when those modules are built.
