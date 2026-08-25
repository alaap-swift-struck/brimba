// THE ACTIVITY LOG — THE ONE PLACE THE RULE IS STATED.
//
// LAW R25: **a record's whole life lands in this table** — created, edited,
// deactivated, reactivated. Master records are never hard-deleted (deactivate-
// not-delete, ARCHITECTURE §4), so deactivation IS death and the trail is
// complete without a delete verb.
//
// Every module calls this one writer. Rows live in each team's own `activity`
// table and point at the changed row by a generic (related_table,
// related_row_id) pair, which is what makes ONE read path serve every module.
//
// WHY THE RULE IS WRITTEN HERE AND NOWHERE ELSE. It used to be stated in three
// places, and they had drifted into three different rules: ARCHITECTURE.md said
// creations are logged, this file said "log everything", and the team schema
// said "edits, deactivations, activations ONLY — creations live on each row's
// own audit columns". The code had logged creations all along, so the schema
// comment was simply wrong — and wrong in the direction that would have made a
// careful reader remove working behaviour. The other two now POINT here rather
// than restate it. (activity_log_review, 2026-08-18.)
//
// APPEND-ONLY, BY LAW. Nothing in this codebase updates or deletes an activity
// row in the request path. A trail that can be edited is not a trail, so the
// absence is enforced by `activity-birth-to-death` in web/test/rules/activity.test.ts rather
// than left to habit. Ageing rows are swept by the retention rule
// (`shared/workers/retention.ts`), which is a documented policy, not code
// rewriting history.
//
// WHAT IS DELIBERATELY NOT LOGGED, and why — so the gaps are decisions.
//
// FIRST, what only LOOKS unlogged. A child row is logged against its PARENT
// record, because the parent is the feed a person actually reads:
// `help_threads` and `help_stakeholders` under `help`, `role_permissions` under
// `member_roles`, `invite_index` under the team-local `invite_logs`. Each writes
// an activity row; none names its own table.
//
// SECRETS AND MACHINERY — nothing points at them and they expire:
//   • sessions, login codes, email-change codes. Signing in is identity, not a
//     record change: it goes to `account_activity` in the global database (see
//     "the two tables" below).
//
// LEDGERS AND EXHAUST — each is already its own log; logging a log is noise:
//   • idempotency keys, error rows, AI-usage rows, and the AI credit BALANCE
//     (`agent_credits`) those rows draw down.
//   • `email_change_logs` — auth's own audit row for the very event that already
//     writes an `account_activity` row.
//   • `activity` and `account_activity` themselves. A trail does not trail itself.
//
// PER-VIEW TELEMETRY — one row per read would drown the feed the trail exists to
// make readable: `learning_progress` (marking an article read),
// `mcp_tokens.last_used_at`.
//
// THE ACTIVE-TEAM POINTER (`users.current_team_id`) — which team you are LOOKING
// at, not a change to any record.
//
// WIZARD PROGRESS, not records. The row is a half-finished form, and the work it
// describes is logged where it actually lands:
//   • `data_import_sessions` / `data_import_batches` (workers/data-ops) —
//     started, previewed, planned, claimed. Every imported ROW goes through its
//     module's own gated create door and logs with origin `import`, and the
//     finished run adds one summary row. Logging the wizard's own steps would
//     stack noise in front of the rows that matter.
//   • `agent_threads` / `agent_messages` (workers/data-ops) — the chat
//     transcript is its own record of itself and is readable in the app. Anything
//     the assistant CHANGES goes through the same gated doors a person uses and
//     logs with origin `agent`.
//
// THE PLATFORM, not the product. These describe the machine, and most live in the
// core/operations database, which no team feed can reach:
//   • `importable_databases` (workers/data-ops) — the import catalogue, DERIVED
//     from code and self-healing on read (R13). Nobody authored it.
//   • `db_alerts`, `db_sizes`, `cron_runs` (workers/tenancy) — size and spend
//     alarms, the nightly size meter, and the jobs' own cursors.
//   • `teams.shard_count` (workers/tenancy) — how many objects a team's live
//     channel is spread across. A capacity knob, invisible in the product.
//   • the migration robot (`workers/tenancy/src/routes/admin.ts`) — applies team
//     schema migrations and stamps `teams.schema_version`. Schema versions are
//     not records, and every team database keeps its own `_migrations` audit.
//
// THIS LIST IS MACHINE-CHECKED, so a new unlogged table cannot arrive
// undocumented: `workers/content/test/activity-seam.test.ts` derives the tables
// no activity row is able to name and fails if one of them is missing above.
//
// THE TWO TABLES. `activity` is per-team and holds record history.
// `account_activity` is global and holds identity events — account created, email
// changed, name or photo changed, access token created or revoked — which happen
// before a person belongs to any team and therefore cannot live in a team's
// database.
//
// It does NOT hold sign-ins, and this comment claimed it did until 2026-08-25.
// That is a deliberate scaling decision, not an oversight: a sign-in row per
// person per session lands in the ONE shared core database that every tenant uses
// and that has no mover, so it is the fastest-growing thing we could add to the
// slowest thing to relieve. Account CREATION happens once per person and is the
// event that actually answers "when did this account start?". Reading a person's full story means both; the documented
// way to do that is in DATA-MODEL.md § "Reading one person's whole history".

import { d1ExecScript, sqlString, type D1Rest } from "./d1-rest"
import { ulid } from "./id"
import { traceError } from "./trace"

export type Actor = {
  id: string
  email: string
  name: string
  /**
   * WHICH DOOR THIS PERSON CAME THROUGH — carried on the actor rather than
   * passed at every log site.
   *
   * `logActivity` is called from deep inside module libraries that have no
   * Request to read a header from. Threading an `origin` argument through all of
   * them would have meant touching two dozen call sites and would have been
   * forgotten by the twenty-fifth. The actor is ALREADY derived from the request
   * by `toActor`, so stamping it once there gives every existing call site the
   * origin for free, and a new module gets it without knowing it exists.
   */
  origin?: ActivityOrigin
}

/** The nightly cron has no signed-in person behind it. Rather than write a blank
 * actor — which reads as "nobody knows" — background work signs its own rows, so
 * "who deactivated this?" answers "the scheduled job" instead of nothing. */
export const SYSTEM_ACTOR: Actor = {
  id: "system",
  email: "system",
  name: "Scheduled job",
  // AND ITS ORIGIN. Without this the fallback below stamped "ui" on every row a
  // nightly job wrote, so the trail said a person had done it by hand — a
  // provenance column stating something untrue is worse than no column, because
  // it is believed. (Activity-log review, 2026-08-25.)
  origin: "job",
}

/**
 * WHICH DOOR THE CHANGE CAME THROUGH.
 *
 * A change made by the assistant, by an outside tool over MCP, or by a nightly
 * job used to look identical to one a person made by hand. That distinction was
 * answerable only by reading source — no use at all during an incident, and the
 * exact question "did the agent do this?" that an owner asks first.
 */
export type ActivityOrigin = "ui" | "api" | "mcp" | "agent" | "import" | "job"

/** The header the surfaces stamp so the door they call can record where a change
 * came from. Set by the MCP front desk and the agent's executor; absent means a
 * person acting through the app. */
export const ORIGIN_HEADER = "x-brimba-origin"

const ORIGINS: ActivityOrigin[] = ["ui", "api", "mcp", "agent", "import", "job"]

/** Read the origin off a request, defaulting to the app. Validated against the
 * known set: this value reaches a log row, and an unchecked header would let a
 * caller write whatever it liked into the audit trail. */
export function originFrom(request: { headers: { get(n: string): string | null } }): ActivityOrigin {
  const raw = request.headers.get(ORIGIN_HEADER)?.trim().toLowerCase()
  return (ORIGINS as string[]).includes(raw ?? "") ? (raw as ActivityOrigin) : "ui"
}

/**
 * THE VERBS — a closed set, not free prose.
 *
 * Each module used to invent its own string ("Learning created", "Help ticket
 * raised", "Role created"). Consistent enough to read, impossible to filter on:
 * "show me every creation last week" needed a list of every spelling any module
 * had ever used. The `type` column still carries the readable module-specific
 * label; `verb` is the stable half a query can group by.
 */
export const ACTIVITY_VERBS = ["created", "edited", "deactivated", "activated", "removed", "status"] as const
export type ActivityVerb = (typeof ACTIVITY_VERBS)[number]

export type ActivityEntry = {
  /** the readable, module-specific label, e.g. "Member role changed" */
  type: string
  /** human sentence shown in the feed */
  description: string
  /** which table the activity is about (e.g. "team_members") */
  relatedTable?: string
  /** the row id it's about */
  relatedRowId?: string
  /** the stable half of `type` — a closed set a query can group by. */
  verb?: ActivityVerb
  /** which door this came through. Omitted means the app. */
  origin?: ActivityOrigin
  /** The field-level diff, kept as DATA beside the human sentence. The sentence
   * is what a person reads; this is what a machine can reconstruct state from.
   * Without it, "Invoice 4021 was updated" is all the trail ever says. */
  changes?: FieldDiff[]
}

export type FieldDiff = {
  label: string
  from?: string | null
  to?: string | null
  /** long/rich fields (an article body) log "<label> updated" without the values */
  hideValues?: boolean
}

/** Name exactly WHAT changed in an edit, old → new — so the activity feed answers
 * "which fields, from what, to what" instead of just "X edited Y". Unchanged
 * fields are dropped; values are clipped so the feed stays readable. Returns ""
 * when nothing differs (callers keep their plain sentence then). */
export function describeChanges(fields: FieldDiff[]): string {
  return renderChanges(fields)
}

/**
 * WHICH MODULES CARRY A FIELD DIFF, so the coverage is stated rather than
 * discovered: `learning`, `help` and `member_roles` build a FieldDiff[] and pass
 * it to both `describeChanges` (the sentence) and `changedFields` (the data).
 * Every other module logs a plain sentence — accurate, but not reconstructable.
 * A module that starts diffing should appear here; one that does not is a
 * deliberate choice, not an oversight.
 */
/** The fields that ACTUALLY changed — the same set `describeChanges` renders into
 * a sentence, kept as DATA so `before_after` can carry it. Callers pass the same
 * array to both: the prose is what a person reads in the feed, the array is what
 * a machine can reconstruct state from. Splitting them would let the two drift. */
export function changedFields(fields: FieldDiff[]): FieldDiff[] {
  return fields.filter((f) => (f.from ?? "").trim() !== (f.to ?? "").trim())
}

function renderChanges(fields: FieldDiff[]): string {
  const clip = (v: string) => (v.length > 60 ? `${v.slice(0, 57)}…` : v)
  const parts: string[] = []
  for (const f of fields) {
    const from = (f.from ?? "").trim()
    const to = (f.to ?? "").trim()
    if (from === to) continue
    if (f.hideValues) parts.push(`${f.label} updated`)
    else if (!from) parts.push(`${f.label} set to "${clip(to)}"`)
    else if (!to) parts.push(`${f.label} cleared (was "${clip(from)}")`)
    else parts.push(`${f.label}: "${clip(from)}" → "${clip(to)}"`)
  }
  return parts.join("; ")
}

/**
 * Write one activity row into a team's own database.
 *
 * BEST-EFFORT BY CONTRACT, and that contract is a deliberate trade rather than
 * laziness: a logging hiccup must NEVER break the action it describes. Callers
 * just `await logActivity(...)`, with no `.catch` of their own.
 *
 * What changed on 2026-08-18: it used to swallow into `console.error` and
 * nothing else, so a failed write left a hole in the trail that nothing anywhere
 * recorded — the log quietly became a lie while still looking complete. The
 * swallow stays; the silence does not. A failure now writes a DURABLE, filterable
 * gap marker through the trace seam, carrying the request id, so "is this
 * record's history complete?" has an answer.
 */
export async function logActivity(
  cfg: D1Rest,
  databaseId: string,
  actor: Actor,
  entry: ActivityEntry
): Promise<void> {
  try {
    const now = new Date().toISOString()
    // The diff travels as JSON. NULL rather than "[]" when there is nothing to
    // say, so a reader can tell "no fields changed" from "this door does not send
    // diffs yet" — two different facts an empty array would merge into one.
    const diff = entry.changes?.length ? JSON.stringify(entry.changes) : null
    await d1ExecScript(
      cfg,
      databaseId,
      `INSERT INTO activity
         (id, type, description, related_table, related_row_id,
          created_at, creator_id, creator_email, creator_name, origin, before_after, verb)
       VALUES (
          ${sqlString(ulid())}, ${sqlString(entry.type)}, ${sqlString(entry.description)},
          ${sqlString(entry.relatedTable ?? null)}, ${sqlString(entry.relatedRowId ?? null)},
          ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)},
          ${sqlString(entry.origin ?? actor.origin ?? "ui")} /* "ui" is the FALLBACK, not a default anyone should rely on: every non-UI surface sets its own via ORIGIN_HEADER or the actor */, ${sqlString(diff)}, ${sqlString(entry.verb ?? null)}
       );`
    )
  } catch (e) {
    // THE GAP MARKER. Structured and filterable by `event`, and it carries the
    // request id like every other trace line — a silent hole in an audit trail is
    // worse than a loud one, because people trust what they are reading.
    traceError({
      worker: "activity",
      place: `${entry.relatedTable ?? "?"}/${entry.relatedRowId ?? "?"}`,
      event: "activity_log_gap",
      detail: e,
    })
  }
}
