// The agent's TOOL CATALOG (opt-in: an action is a tool ONLY if it's listed here) and
// the act-as-user EXECUTOR. Every tool maps to a gated endpoint the UI already uses;
// executing it forwards the caller's session cookie, so the real door re-checks their
// permission and validates the input — the agent can never exceed the invoker's rights.
//
// SAFETY (locked):
//   • Act-as-user — every tool runs through the same gated endpoint AS the caller, so
//     the agent has the user's EXACT rights and the real door re-checks each call.
//     Managing existing members (set a role, remove someone) IS allowed — it's normal,
//     re-gated CRUD.
//   • Confirm rule — the agent pauses for a yes/no panel before any change to WHO-CAN-
//     DO-WHAT or team identity (roles, permissions, membership, invites, team details),
//     before the two only-destructive acts (remove a member, revoke an invite), and
//     before any BULK / import write. Defense-in-depth: the server still gates every
//     call by the caller's rights, but the confirm panel catches an agent that mis-picks
//     a tool or is prompt-injected into an unintended privilege/identity write (a
//     read-only question must never silently rename a team or re-grant a role). Low-blast
//     single content edits (one learning / help / dropdown write) run straight away.
//   • Catastrophic blocks — controlling your other DEVICE SESSIONS (sessions) and
//     DELETING the team are not normal CRUD, so they're simply NOT in the catalog and
//     the agent structurally cannot do them. The guard below is the belt-and-braces backstop.
//   • Fence — tool RESULTS are returned to the model as DATA (role:"tool"), never as
//     instructions; the system prompt reinforces it.

import { GuardError, requireRight, teamContext } from "../../../../shared/workers/gating"
import { forwardToDoor } from "../../../../shared/workers/http"
import { publishChange } from "../../../../shared/workers/realtime"
import { confirmBatch, getBatchView, planModules } from "./import-batch"
import type { Env } from "../env"
import type { ToolSpec } from "./model"

export type AgentTool = {
  name: string
  description: string
  schema: Record<string, unknown>
  binding: "CONTENT" | "TENANCY" | "SELF"
  method: "GET" | "POST"
  path: string
  write: boolean
  /** show the yes/no confirm panel before running — required for privilege/identity
   * writes (roles, permissions, membership, invites, team details), the two
   * only-destructive acts (remove a member, revoke an invite), and bulk/import writes. */
  confirm: boolean
  /** never exposed actions guard (identity acts) — true = always refuse. */
  identityBlocked?: boolean
  buildQuery?: (input: Record<string, unknown>) => string
  buildBody?: (input: Record<string, unknown>) => Record<string, unknown>
  /** One-line confirm-panel summary. `names` maps an id → a friendly name so the
   * two confirming tools read "Remove Jane Doe" not a ULID; other tools ignore it. */
  summarize: (input: Record<string, unknown>, names?: Record<string, string>) => string
  /** binding:"SELF" tools run INSIDE data-ops (e.g. the import batch engine) instead
   * of fetching another worker — still act-as-user: the handler re-opens teamContext
   * from the same request, so nothing escapes the caller's rights. */
  run?: (env: Env, request: Request, input: Record<string, unknown>) => Promise<ToolResult>
}

const str = (input: Record<string, unknown>, key: string): string => {
  const v = input[key]
  return typeof v === "string" ? v : v == null ? "" : String(v)
}

/** A role reference for a step/confirm summary: "the Sub Admin role" when the id
 * resolved to a title (via `names`), else "role <id>" as a graceful fallback. */
const roleLabel = (input: Record<string, unknown>, names?: Record<string, string>): string => {
  const id = str(input, "roleId")
  const title = names?.[id]
  return title ? `the ${title} role` : `role ${id}`
}

/** A member reference for a summary: the resolved name/email, else "member <id>". */
const memberLabel = (input: Record<string, unknown>, names?: Record<string, string>): string => {
  const id = str(input, "userId")
  return names?.[id] ?? `member ${id}`
}

const obj = (props: Record<string, unknown>, required: string[] = []): Record<string, unknown> => ({
  type: "object",
  properties: props,
  required,
})
const S = { type: "string" }

export const TOOL_CATALOG: AgentTool[] = [
  {
    name: "list_learning",
    description: "List the team's learning / how-to articles.",
    schema: obj({}),
    binding: "CONTENT",
    method: "GET",
    path: "/api/content/learning",
    write: false,
    confirm: false,
    summarize: () => "List learning articles",
  },
  {
    name: "list_help_tickets",
    description: "List the team's support tickets (all of them).",
    schema: obj({}),
    binding: "CONTENT",
    method: "GET",
    path: "/api/content/help",
    write: false,
    confirm: false,
    buildQuery: () => "?scope=all",
    summarize: () => "List support tickets",
  },
  {
    name: "list_roles",
    description: "List the team's roles.",
    schema: obj({}),
    binding: "TENANCY",
    method: "GET",
    path: "/api/tenancy/roles",
    write: false,
    confirm: false,
    summarize: () => "List roles",
  },
  {
    name: "list_members",
    description: "List the team's members.",
    schema: obj({}),
    binding: "TENANCY",
    method: "GET",
    path: "/api/tenancy/members",
    write: false,
    confirm: false,
    summarize: () => "List members",
  },
  {
    name: "create_learning",
    description: "Create a new learning / how-to article.",
    schema: obj(
      { title: S, category: S, description: S, contentType: S, contentLink: S, body: S },
      ["title"]
    ),
    binding: "CONTENT",
    method: "POST",
    path: "/api/content/learning",
    write: true,
    confirm: false,
    buildBody: (i) => ({
      title: str(i, "title"),
      category: str(i, "category") || undefined,
      description: str(i, "description") || undefined,
      contentType: str(i, "contentType") || undefined,
      contentLink: str(i, "contentLink") || undefined,
      body: str(i, "body") || undefined,
    }),
    summarize: (i) => `Create the learning article "${str(i, "title")}"`,
  },
  {
    name: "update_learning",
    description: "Edit an existing learning article (by id).",
    schema: obj({ id: S, title: S, category: S, description: S, body: S }, ["id", "title"]),
    binding: "CONTENT",
    method: "POST",
    path: "/api/content/learning/update",
    write: true,
    confirm: false,
    buildBody: (i) => ({
      id: str(i, "id"),
      title: str(i, "title"),
      category: str(i, "category") || undefined,
      description: str(i, "description") || undefined,
      body: str(i, "body") || undefined,
    }),
    summarize: (i) => `Edit learning article ${str(i, "id")}`,
  },
  {
    name: "raise_help_ticket",
    description: "Raise a new support ticket for the team.",
    schema: obj({ description: S, helpType: S }, ["description"]),
    binding: "CONTENT",
    method: "POST",
    path: "/api/content/help",
    write: true,
    confirm: false,
    buildBody: (i) => ({ description: str(i, "description"), helpType: str(i, "helpType") || undefined }),
    summarize: (i) => `Raise a support ticket: "${str(i, "description").slice(0, 60)}"`,
  },
  {
    name: "reply_help_ticket",
    description: "Reply to an existing support ticket (by id).",
    schema: obj({ helpId: S, body: S }, ["helpId", "body"]),
    binding: "CONTENT",
    method: "POST",
    path: "/api/content/help/reply",
    write: true,
    confirm: false,
    buildBody: (i) => ({ helpId: str(i, "helpId"), body: str(i, "body") }),
    summarize: (i) => `Reply to ticket ${str(i, "helpId")}`,
  },
  {
    name: "create_role",
    description:
      "Create a new team role. It starts with no access rights; use set_role_permissions to grant them.",
    schema: obj({ title: S, description: S }, ["title"]),
    binding: "TENANCY",
    method: "POST",
    path: "/api/tenancy/roles",
    write: true,
    confirm: true, // privilege: creates a role (its access rights)
    buildBody: (i) => ({ title: str(i, "title"), description: str(i, "description") || "" }),
    summarize: (i) => `Create the role "${str(i, "title")}"`,
  },
  {
    name: "update_role",
    description: "Rename or re-describe an existing team role (by id).",
    schema: obj({ roleId: S, title: S, description: S }, ["roleId", "title"]),
    binding: "TENANCY",
    method: "POST",
    path: "/api/tenancy/roles/update",
    write: true,
    confirm: true, // privilege: edits a role
    buildBody: (i) => ({
      roleId: str(i, "roleId"),
      title: str(i, "title"),
      description: str(i, "description") || "",
    }),
    summarize: (i, names) =>
      `Rename ${roleLabel(i, names)} to "${str(i, "title")}"`,
  },
  {
    name: "set_role_active",
    description: "Switch a role off (deactivate) or back on (reactivate) — never deleted.",
    schema: obj({ roleId: S, active: { type: "boolean" } }, ["roleId", "active"]),
    binding: "TENANCY",
    method: "POST",
    path: "/api/tenancy/roles/active",
    write: true,
    confirm: true, // privilege: switching a role off/on changes access
    buildBody: (i) => ({ roleId: str(i, "roleId"), active: i.active === true }),
    summarize: (i, names) =>
      `${i.active === true ? "Activate" : "Deactivate"} ${roleLabel(i, names)}`,
  },
  {
    name: "get_role_permissions",
    description:
      "Read a role's access rights (its permission matrix, by role id): for each module — read, create, edit, delete.",
    schema: obj({ roleId: S }, ["roleId"]),
    binding: "TENANCY",
    method: "GET",
    path: "/api/tenancy/roles/permissions",
    write: false,
    confirm: false,
    buildQuery: (i) => `?roleId=${encodeURIComponent(str(i, "roleId"))}`,
    summarize: (i, names) => `Read access rights for ${roleLabel(i, names)}`,
  },
  {
    name: "set_role_permissions",
    description:
      "Set a role's access rights (by role id). `value` is an object keyed by module — one of " +
      "teams, team_members, member_roles, learning, help, selectable_data, screens, agent — " +
      "each mapping to { read, create, edit, delete } booleans. Turning on create, edit or delete " +
      "auto-enables read. The Admin role is locked (the server enforces this).",
    schema: obj({ roleId: S, value: { type: "object" } }, ["roleId", "value"]),
    binding: "TENANCY",
    method: "POST",
    path: "/api/tenancy/roles/permissions",
    write: true,
    confirm: true, // privilege: sets a role's access rights (who-can-do-what)
    buildBody: (i) => ({ roleId: str(i, "roleId"), value: i.value }),
    summarize: (i, names) => `Set access rights for ${roleLabel(i, names)}`,
  },
  {
    name: "invite_member",
    description: "Invite someone to the team by email, assigning them a role (by role id).",
    schema: obj({ email: S, roleId: S }, ["email", "roleId"]),
    binding: "TENANCY",
    method: "POST",
    path: "/api/tenancy/invites",
    write: true,
    confirm: true, // access grant: invites someone into the team
    buildBody: (i) => ({ email: str(i, "email"), roleId: str(i, "roleId") }),
    summarize: (i, names) => {
      const id = str(i, "roleId")
      const role = names?.[id] ? names[id] : `role ${id}`
      return `Invite ${str(i, "email")} as ${role}`
    },
  },
  {
    name: "revoke_invite",
    description: "Revoke a pending invitation that hasn't been accepted yet (by invite id).",
    schema: obj({ inviteId: S }, ["inviteId"]),
    binding: "TENANCY",
    method: "POST",
    path: "/api/tenancy/invites/revoke",
    write: true,
    confirm: true, // only-destructive: withdraws an outstanding invite
    buildBody: (i) => ({ inviteId: str(i, "inviteId") }),
    summarize: (i, names) => `Revoke the invite for ${names?.[str(i, "inviteId")] ?? str(i, "inviteId")}`,
  },
  {
    name: "set_member_role",
    description: "Change an existing member's role (by user id + the new role id).",
    schema: obj({ userId: S, roleId: S }, ["userId", "roleId"]),
    binding: "TENANCY",
    method: "POST",
    path: "/api/tenancy/members/role",
    write: true,
    confirm: true, // privilege: changes a member's role (their access level)
    buildBody: (i) => ({ userId: str(i, "userId"), roleId: str(i, "roleId") }),
    summarize: (i, names) => {
      const id = str(i, "roleId")
      const role = names?.[id] ? names[id] : `role ${id}`
      return `Change ${memberLabel(i, names)} to ${role}`
    },
  },
  {
    name: "remove_member",
    description: "Remove (deactivate) a member from the team — never hard-deleted (by user id).",
    schema: obj({ userId: S }, ["userId"]),
    binding: "TENANCY",
    method: "POST",
    path: "/api/tenancy/members/remove",
    write: true,
    confirm: true, // only-destructive: withdraws someone's access to the team
    buildBody: (i) => ({ userId: str(i, "userId") }),
    summarize: (i, names) => `Remove ${names?.[str(i, "userId")] ?? str(i, "userId")} from the team`,
  },
  {
    name: "create_dropdown_value",
    description: "Add a selectable dropdown value to a group (e.g. add an option to a list).",
    schema: obj({ type: S, value: S }, ["type", "value"]),
    binding: "TENANCY",
    method: "POST",
    path: "/api/tenancy/selectable",
    write: true,
    confirm: false,
    buildBody: (i) => ({ type: str(i, "type"), value: str(i, "value") }),
    summarize: (i) => `Add "${str(i, "value")}" to the ${str(i, "type")} list`,
  },
  {
    name: "update_dropdown_value",
    description: "Rename an existing selectable dropdown value (by id).",
    schema: obj({ id: S, value: S }, ["id", "value"]),
    binding: "TENANCY",
    method: "POST",
    path: "/api/tenancy/selectable/update",
    write: true,
    confirm: false,
    buildBody: (i) => ({ id: str(i, "id"), value: str(i, "value") }),
    summarize: (i) => `Rename dropdown value ${str(i, "id")} to "${str(i, "value")}"`,
  },
  {
    name: "set_dropdown_active",
    description: "Switch a dropdown value off (deactivate) or back on (reactivate) — never deleted.",
    schema: obj({ id: S, active: { type: "boolean" } }, ["id", "active"]),
    binding: "TENANCY",
    method: "POST",
    path: "/api/tenancy/selectable/active",
    write: true,
    confirm: false,
    buildBody: (i) => ({ id: str(i, "id"), active: i.active === true }),
    summarize: (i) =>
      `${i.active === true ? "Activate" : "Deactivate"} dropdown value ${str(i, "id")}`,
  },
  {
    name: "update_team",
    description: "Edit the active team's details (its name).",
    schema: obj({ name: S }, ["name"]),
    binding: "TENANCY",
    method: "POST",
    path: "/api/tenancy/teams/update",
    write: true,
    confirm: true, // identity: changes the team's own details (name, etc.)
    buildBody: (i) => ({ name: str(i, "name") }),
    summarize: (i) => `Rename the team to "${str(i, "name")}"`,
  },
  {
    name: "update_help_ticket",
    description: "Edit an existing support ticket's details (by id).",
    schema: obj({ id: S, description: S, helpType: S, screenRecordingLink: S }, ["id", "description"]),
    binding: "CONTENT",
    method: "POST",
    path: "/api/content/help/update",
    write: true,
    confirm: false,
    buildBody: (i) => ({
      id: str(i, "id"),
      description: str(i, "description"),
      helpType: str(i, "helpType") || undefined,
      screenRecordingLink: str(i, "screenRecordingLink") || undefined,
    }),
    summarize: (i) => `Edit support ticket ${str(i, "id")}`,
  },
  {
    name: "set_help_status",
    description:
      "Move a support ticket along its lifecycle (open, in_progress, resolved, reopened).",
    schema: obj({ id: S, status: S }, ["id", "status"]),
    binding: "CONTENT",
    method: "POST",
    path: "/api/content/help/status",
    write: true,
    confirm: false,
    buildBody: (i) => ({ id: str(i, "id"), status: str(i, "status") }),
    summarize: (i) => `Set ticket ${str(i, "id")} to "${str(i, "status")}"`,
  },
  {
    name: "bulk_set_help_status",
    description:
      "Move MANY support tickets to the same status at once (open, in_progress, resolved, reopened). " +
      "First list the tickets (a read) to get their ids, then call this with those ids. A bulk change " +
      "is confirmed with a count before it runs.",
    schema: obj({ ids: { type: "array", items: S }, status: S }, ["ids", "status"]),
    binding: "CONTENT",
    method: "POST",
    path: "/api/content/help/bulk-status",
    write: true,
    confirm: true, // a bulk change is high-blast — always confirm
    buildBody: (i) => ({ ids: i.ids, status: i.status }),
    summarize: (i) => `Set ${Array.isArray(i.ids) ? i.ids.length : 0} tickets to ${i.status}`,
  },
  {
    name: "set_learning_active",
    description: "Switch a learning article off (deactivate) or back on (reactivate) — never deleted.",
    schema: obj({ id: S, active: { type: "boolean" } }, ["id", "active"]),
    binding: "CONTENT",
    method: "POST",
    path: "/api/content/learning/active",
    write: true,
    confirm: false,
    buildBody: (i) => ({ id: str(i, "id"), active: i.active === true }),
    summarize: (i) =>
      `${i.active === true ? "Activate" : "Deactivate"} learning article ${str(i, "id")}`,
  },
  {
    name: "bulk_set_learning_active",
    description:
      "Switch MANY learning articles off (deactivate) or back on (reactivate) at once — never deleted. " +
      "First list the articles (a read) to get their ids, then call this with those ids. A bulk change " +
      "is confirmed with a count before it runs.",
    schema: obj({ ids: { type: "array", items: S }, active: { type: "boolean" } }, ["ids", "active"]),
    binding: "CONTENT",
    method: "POST",
    path: "/api/content/learning/bulk-active",
    write: true,
    confirm: true, // a bulk change is high-blast — always confirm
    buildBody: (i) => ({ ids: i.ids, active: i.active }),
    summarize: (i) =>
      `${i.active ? "Activate" : "Deactivate"} ${Array.isArray(i.ids) ? i.ids.length : 0} articles`,
  },
  {
    name: "mark_learning_done",
    description: "Mark a learning article done (or not done) for yourself.",
    schema: obj({ id: S, done: { type: "boolean" } }, ["id", "done"]),
    binding: "CONTENT",
    method: "POST",
    path: "/api/content/learning/done",
    write: true,
    confirm: false,
    buildBody: (i) => ({ id: str(i, "id"), done: i.done === true }),
    summarize: (i) =>
      `Mark learning article ${str(i, "id")} ${i.done === true ? "done" : "not done"}`,
  },
  {
    // Runs INSIDE data-ops (binding SELF): the import batch engine, not a worker
    // fetch. Only reachable for a batch the SAME user created (creator-scoped
    // load) — the model can't run someone else's import, and every target module
    // is re-gated for `create` before a row is written.
    name: "run_import_batch",
    description:
      "Run a file import the user attached in THIS chat, after the app planned it. Call it ONLY with " +
      "the batchId given in an ATTACHED-IMPORT-PLAN block, plus a short human summary of what will be " +
      "imported. The app shows its own confirm panel first. Never invent a batchId.",
    schema: obj({ batchId: S, summary: S }, ["batchId"]),
    binding: "SELF",
    method: "POST",
    path: "(import batch engine)",
    write: true,
    confirm: true, // writing a whole file of rows is high-blast — always confirm
    summarize: (i) => (typeof i.summary === "string" && i.summary ? i.summary : "Run the attached file import"),
    run: (env, request, input) => runImportBatchTool(env, request, input),
  },
]

/** binding:"SELF" — run the attached-in-chat import batch through the SAME engine
 * the Import screen uses: re-open teamContext from the request (act-as-user), gate
 * `create` on every target in the plan up front, execute in dependency order, then
 * publish one coarse ping per changed module. Mirrors routes/import postBatchConfirm. */
async function runImportBatchTool(
  env: Env,
  request: Request,
  input: Record<string, unknown>
): Promise<ToolResult> {
  try {
    const { actor, cfg, guard } = await teamContext(request, env)
    const batchId = str(input, "batchId")
    if (!batchId) return { ok: false, status: 400, data: null, error: "A batchId is required." }
    const view = await getBatchView(cfg, guard, batchId)
    if (!view.plan) return { ok: false, status: 409, data: null, error: "That import hasn't been planned." }
    for (const m of planModules(view.plan)) await requireRight(cfg, guard, m, "create")
    const { report, modules } = await confirmBatch(env, request, cfg, guard, actor, batchId)
    for (const m of modules) await publishChange(env.REALTIME, guard.teamId, m)
    return {
      ok: true,
      status: 200,
      data: {
        created: report.created,
        skipped: report.skipped,
        failed: report.failed,
        perTarget: report.perTarget,
        rejections: report.rejections.slice(0, 10),
      },
    }
  } catch (e) {
    if (e instanceof GuardError) return { ok: false, status: e.status, data: null, error: e.message }
    throw e
  }
}

export function getTool(name: string): AgentTool | undefined {
  return TOOL_CATALOG.find((t) => t.name === name)
}

/** The specs handed to the model (name + description + input schema). */
export function toolSpecs(): ToolSpec[] {
  return TOOL_CATALOG.map((t) => ({ name: t.name, description: t.description, schema: t.schema }))
}

/** Confirm rule: only the two only-destructive writes pause for the yes/no panel
 * (remove a member, revoke an invite). Everything else runs straight away — the
 * server still gates every call by the caller's rights. */
export function requiresConfirm(tool: AgentTool): boolean {
  return tool.write && tool.confirm === true
}

export type ToolResult = { ok: boolean; status: number; data: unknown; error?: string }

/** Run a tool AS the caller: forward their cookie to the gated endpoint so the real
 * door enforces permissions + validation. Identity-blocked tools are always refused. */
export async function executeTool(
  env: Env,
  request: Request,
  tool: AgentTool,
  input: Record<string, unknown>
): Promise<ToolResult> {
  if (tool.identityBlocked)
    return { ok: false, status: 403, data: null, error: "That action can only be done by you, in person." }
  if (tool.run) return tool.run(env, request, input)

  const fetcher = tool.binding === "CONTENT" ? env.CONTENT : env.TENANCY
  const res = await forwardToDoor(fetcher, {
    path: tool.path,
    method: tool.method,
    cookie: request.headers.get("Cookie") ?? "",
    query: tool.method === "GET" && tool.buildQuery ? tool.buildQuery(input) : "",
    body: tool.buildBody ? tool.buildBody(input) : {},
  })
  const text = await res.text()
  let data: unknown = text
  try {
    data = JSON.parse(text)
  } catch {
    /* leave as text */
  }
  const error = res.ok
    ? undefined
    : (data as { message?: string })?.message ?? `Action failed (HTTP ${res.status}).`
  return { ok: res.ok, status: res.status, data, error }
}
