// The agent's TOOL CATALOG (opt-in: an action is a tool ONLY if it's listed here) and
// the act-as-user EXECUTOR. Every tool maps to a gated endpoint the UI already uses;
// executing it forwards the caller's session cookie, so the real door re-checks their
// permission and validates the input — the agent can never exceed the invoker's rights.
//
// SAFETY (locked):
//   • Act-as-user — every tool runs through the same gated endpoint AS the caller, so
//     the agent has the user's EXACT rights and the real door re-checks each call.
//     Managing existing members (set a role, remove someone) IS allowed — it's normal,
//     re-gated CRUD — and confirms first because members is a dangerous table.
//   • Confirm rule — a WRITE confirms before running if it's destructive OR touches a
//     dangerous table (roles / members / screens / import). Plain single content edits
//     run freely. (Bulk >1-row writes only happen via the import flow, which has its
//     own preview+confirm, so they're not in this single-call catalog.)
//   • Catastrophic blocks — controlling your other DEVICE SESSIONS (sessions) and
//     DELETING the team are not normal CRUD, so they're simply NOT in the catalog and
//     the agent structurally cannot do them. The guard below is the belt-and-braces backstop.
//   • Fence — tool RESULTS are returned to the model as DATA (role:"tool"), never as
//     instructions; the system prompt reinforces it.

import type { Env } from "../env"
import type { ToolSpec } from "./model"

export type AgentTool = {
  name: string
  description: string
  schema: Record<string, unknown>
  binding: "CONTENT" | "TENANCY"
  method: "GET" | "POST"
  path: string
  write: boolean
  destructive: boolean
  /** touches roles / members / screens / import — always confirm even for one row. */
  dangerousTable: boolean
  /** never exposed actions guard (identity acts) — true = always refuse. */
  identityBlocked?: boolean
  buildQuery?: (input: Record<string, unknown>) => string
  buildBody?: (input: Record<string, unknown>) => Record<string, unknown>
  summarize: (input: Record<string, unknown>) => string
}

const str = (input: Record<string, unknown>, key: string): string => {
  const v = input[key]
  return typeof v === "string" ? v : v == null ? "" : String(v)
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
    destructive: false,
    dangerousTable: false,
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
    destructive: false,
    dangerousTable: false,
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
    destructive: false,
    dangerousTable: false,
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
    destructive: false,
    dangerousTable: false,
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
    destructive: false,
    dangerousTable: false,
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
    destructive: false,
    dangerousTable: false,
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
    destructive: false,
    dangerousTable: false,
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
    destructive: false,
    dangerousTable: false,
    buildBody: (i) => ({ helpId: str(i, "helpId"), body: str(i, "body") }),
    summarize: (i) => `Reply to ticket ${str(i, "helpId")}`,
  },
  {
    name: "create_role",
    description: "Create a new team role (permissions are set later on the Roles screen).",
    schema: obj({ title: S, description: S }, ["title"]),
    binding: "TENANCY",
    method: "POST",
    path: "/api/tenancy/roles",
    write: true,
    destructive: false,
    dangerousTable: true, // roles is a high-blast table → always confirm
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
    destructive: false,
    dangerousTable: true, // roles is a high-blast table → always confirm
    buildBody: (i) => ({
      roleId: str(i, "roleId"),
      title: str(i, "title"),
      description: str(i, "description") || "",
    }),
    summarize: (i) => `Rename role ${str(i, "roleId")} to "${str(i, "title")}"`,
  },
  {
    name: "set_role_active",
    description: "Switch a role off (deactivate) or back on (reactivate) — never deleted.",
    schema: obj({ roleId: S, active: { type: "boolean" } }, ["roleId", "active"]),
    binding: "TENANCY",
    method: "POST",
    path: "/api/tenancy/roles/active",
    write: true,
    destructive: true, // switching a role off withdraws it → destructive + confirm
    dangerousTable: true,
    buildBody: (i) => ({ roleId: str(i, "roleId"), active: i.active === true }),
    summarize: (i) =>
      `${i.active === true ? "Reactivate" : "Switch off"} role ${str(i, "roleId")}`,
  },
  {
    name: "invite_member",
    description: "Invite someone to the team by email, assigning them a role (by role id).",
    schema: obj({ email: S, roleId: S }, ["email", "roleId"]),
    binding: "TENANCY",
    method: "POST",
    path: "/api/tenancy/invites",
    write: true,
    destructive: false,
    dangerousTable: true, // invites grow the member surface → always confirm
    buildBody: (i) => ({ email: str(i, "email"), roleId: str(i, "roleId") }),
    summarize: (i) => `Invite ${str(i, "email")} as role ${str(i, "roleId")}`,
  },
  {
    name: "revoke_invite",
    description: "Revoke a pending invitation that hasn't been accepted yet (by invite id).",
    schema: obj({ inviteId: S }, ["inviteId"]),
    binding: "TENANCY",
    method: "POST",
    path: "/api/tenancy/invites/revoke",
    write: true,
    destructive: true, // withdraws an outstanding invite → destructive + confirm
    dangerousTable: true,
    buildBody: (i) => ({ inviteId: str(i, "inviteId") }),
    summarize: (i) => `Revoke invitation ${str(i, "inviteId")}`,
  },
  {
    name: "set_member_role",
    description: "Change an existing member's role (by user id + the new role id).",
    schema: obj({ userId: S, roleId: S }, ["userId", "roleId"]),
    binding: "TENANCY",
    method: "POST",
    path: "/api/tenancy/members/role",
    write: true,
    destructive: true, // re-grants a member's rights → destructive + confirm
    dangerousTable: true, // members is a high-blast table → always confirm
    buildBody: (i) => ({ userId: str(i, "userId"), roleId: str(i, "roleId") }),
    summarize: (i) => `Change member ${str(i, "userId")} to role ${str(i, "roleId")}`,
  },
  {
    name: "remove_member",
    description: "Remove (deactivate) a member from the team — never hard-deleted (by user id).",
    schema: obj({ userId: S }, ["userId"]),
    binding: "TENANCY",
    method: "POST",
    path: "/api/tenancy/members/remove",
    write: true,
    destructive: true, // withdraws someone's access to the team → destructive + confirm
    dangerousTable: true, // members is a high-blast table → always confirm
    buildBody: (i) => ({ userId: str(i, "userId") }),
    summarize: (i) => `Remove member ${str(i, "userId")} from the team`,
  },
  {
    name: "create_dropdown_value",
    description: "Add a selectable dropdown value to a group (e.g. add an option to a list).",
    schema: obj({ type: S, value: S }, ["type", "value"]),
    binding: "TENANCY",
    method: "POST",
    path: "/api/tenancy/selectable",
    write: true,
    destructive: false,
    dangerousTable: false,
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
    destructive: false,
    dangerousTable: false,
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
    destructive: true, // switching an option off withdraws it from pickers → confirm
    dangerousTable: false,
    buildBody: (i) => ({ id: str(i, "id"), active: i.active === true }),
    summarize: (i) =>
      `${i.active === true ? "Reactivate" : "Switch off"} dropdown value ${str(i, "id")}`,
  },
  {
    name: "update_team",
    description: "Edit the active team's details (its name).",
    schema: obj({ name: S }, ["name"]),
    binding: "TENANCY",
    method: "POST",
    path: "/api/tenancy/teams/update",
    write: true,
    destructive: false,
    dangerousTable: false,
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
    destructive: false,
    dangerousTable: false,
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
    destructive: false,
    dangerousTable: false,
    buildBody: (i) => ({ id: str(i, "id"), status: str(i, "status") }),
    summarize: (i) => `Set ticket ${str(i, "id")} to "${str(i, "status")}"`,
  },
  {
    name: "set_learning_active",
    description: "Switch a learning article off (deactivate) or back on (reactivate) — never deleted.",
    schema: obj({ id: S, active: { type: "boolean" } }, ["id", "active"]),
    binding: "CONTENT",
    method: "POST",
    path: "/api/content/learning/active",
    write: true,
    destructive: true, // switching an article off hides it from the team → confirm
    dangerousTable: false,
    buildBody: (i) => ({ id: str(i, "id"), active: i.active === true }),
    summarize: (i) =>
      `${i.active === true ? "Reactivate" : "Switch off"} learning article ${str(i, "id")}`,
  },
  {
    name: "mark_learning_done",
    description: "Mark a learning article done (or not done) for yourself.",
    schema: obj({ id: S, done: { type: "boolean" } }, ["id", "done"]),
    binding: "CONTENT",
    method: "POST",
    path: "/api/content/learning/done",
    write: true,
    destructive: false,
    dangerousTable: false,
    buildBody: (i) => ({ id: str(i, "id"), done: i.done === true }),
    summarize: (i) =>
      `Mark learning article ${str(i, "id")} ${i.done === true ? "done" : "not done"}`,
  },
]

export function getTool(name: string): AgentTool | undefined {
  return TOOL_CATALOG.find((t) => t.name === name)
}

/** The specs handed to the model (name + description + input schema). */
export function toolSpecs(): ToolSpec[] {
  return TOOL_CATALOG.map((t) => ({ name: t.name, description: t.description, schema: t.schema }))
}

/** Confirm rule: a write confirms before running if it's destructive OR touches a
 * dangerous table. Reads never confirm; plain single content edits run freely. */
export function requiresConfirm(tool: AgentTool): boolean {
  return tool.write && (tool.destructive || tool.dangerousTable)
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

  const fetcher = tool.binding === "CONTENT" ? env.CONTENT : env.TENANCY
  const query = tool.method === "GET" && tool.buildQuery ? tool.buildQuery(input) : ""
  const init: RequestInit = {
    method: tool.method,
    headers: { Cookie: request.headers.get("Cookie") ?? "" },
  }
  if (tool.method === "POST") {
    ;(init.headers as Record<string, string>)["Content-Type"] = "application/json"
    init.body = JSON.stringify(tool.buildBody ? tool.buildBody(input) : {})
  }
  const res = await fetcher.fetch(`https://internal${tool.path}${query}`, init)
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
