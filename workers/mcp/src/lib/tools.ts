// The MCP tool catalog — OPT-IN (an action is a tool ONLY if listed here), each
// one a thin FORWARD to an existing gated door with the bridged, team-pinned
// session cookie. No logic lives here: the real doors gate, validate, meter,
// audit and publish exactly as they do for a browser. AI-costed tools (the
// import plan, the agent chat) hit routes that are already metered on the team's
// credit quota — the locked "abuse bounded by the agent quota".
// catalog-drift.test.ts machine-checks every forwarded path against the target
// workers' OWN route tables, so this list can't quietly rot.

import type { Env } from "../env"

export type McpTool = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  binding: "AUTH" | "TENANCY" | "CONTENT" | "DATAOPS"
  method: "GET" | "POST"
  path: string
  buildBody?: (input: Record<string, unknown>) => Record<string, unknown>
  buildQuery?: (input: Record<string, unknown>) => string
}

const S = { type: "string" } as const
const B = { type: "boolean" } as const
const N = { type: "number" } as const
const obj = (props: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties: props,
  required,
})

// Learning create/edit share the same optional field set (undefined keys drop out
// of JSON.stringify, so the door treats them as omitted — same as an empty form field).
const learningBody = (i: Record<string, unknown>) => ({
  title: i.title,
  category: i.category,
  description: i.description,
  contentType: i.contentType,
  contentLink: i.contentLink,
  body: i.body,
  sequence: i.sequence,
  required: i.required,
})

export const MCP_TOOLS: McpTool[] = [
  {
    name: "whoami",
    description: "The token's owner + the team this token is pinned to.",
    inputSchema: obj({}),
    binding: "AUTH",
    method: "GET",
    path: "/api/auth/me",
  },
  {
    name: "list_members",
    description: "The team's members, with their roles.",
    inputSchema: obj({}),
    binding: "TENANCY",
    method: "GET",
    path: "/api/tenancy/members",
  },
  {
    name: "list_roles",
    description: "The team's member roles.",
    inputSchema: obj({}),
    binding: "TENANCY",
    method: "GET",
    path: "/api/tenancy/roles",
  },
  {
    name: "list_dropdown_values",
    description:
      "The team's dropdown values (selectable data), active first then deactivated — each carries `active`. Deactivated values are listed too, so you can find one's id and reactivate it with set_dropdown_value_active.",
    inputSchema: obj({}),
    binding: "TENANCY",
    method: "GET",
    path: "/api/tenancy/selectable",
  },
  {
    name: "list_learning",
    description: "The team's learning articles.",
    inputSchema: obj({}),
    binding: "CONTENT",
    method: "GET",
    path: "/api/content/learning",
  },
  {
    name: "list_help_tickets",
    description: "The team's support tickets. scope: 'mine' (yours) or 'all'.",
    inputSchema: obj({ scope: S }),
    binding: "CONTENT",
    method: "GET",
    path: "/api/content/help",
    buildQuery: (i) => (i.scope === "mine" ? "?scope=mine" : "?scope=all"),
  },
  // ---- exports (READ right; the same full-field CSVs the Export buttons serve) ----
  {
    name: "export_roles_csv",
    description: "Every member role as CSV — full fields incl. the flattened permission matrix.",
    inputSchema: obj({}),
    binding: "TENANCY",
    method: "GET",
    path: "/api/tenancy/roles/export",
  },
  {
    name: "export_learning_csv",
    description: "Every learning article as CSV (full fields + audit).",
    inputSchema: obj({}),
    binding: "CONTENT",
    method: "GET",
    path: "/api/content/learning/export",
  },
  {
    name: "export_dropdown_values_csv",
    description: "Every dropdown value as CSV (full fields + audit).",
    inputSchema: obj({}),
    binding: "TENANCY",
    method: "GET",
    path: "/api/tenancy/selectable/export",
  },
  // ---- writes: deterministic create / edit / deactivate through the SAME gated
  // doors the screens use (requireRight + validate + publishChange + audit + the
  // locked guards — ≥1 admin, not-self — fire even here). FREE (no AI): the
  // script-friendly alternative to driving writes through agent_chat. Deactivate,
  // never delete. Every path is machine-checked against the target worker's ROUTES.

  // roles (member_roles)
  {
    name: "create_role",
    description: "Create a member role. Needs member_roles:create.",
    inputSchema: obj({ title: S, description: S }, ["title"]),
    binding: "TENANCY",
    method: "POST",
    path: "/api/tenancy/roles",
    buildBody: (i) => ({ title: i.title, description: i.description ?? "" }),
  },
  {
    name: "update_role",
    description: "Rename a role / change its description. Needs member_roles:edit.",
    inputSchema: obj({ roleId: S, title: S, description: S }, ["roleId", "title"]),
    binding: "TENANCY",
    method: "POST",
    path: "/api/tenancy/roles/update",
    buildBody: (i) => ({ roleId: i.roleId, title: i.title, description: i.description ?? "" }),
  },
  {
    name: "set_role_active",
    description:
      "Deactivate (active:false — holders keep access) or reactivate a role. Needs member_roles:delete.",
    inputSchema: obj({ roleId: S, active: B }, ["roleId", "active"]),
    binding: "TENANCY",
    method: "POST",
    path: "/api/tenancy/roles/active",
    buildBody: (i) => ({ roleId: i.roleId, active: i.active === true }),
  },
  {
    name: "set_role_permissions",
    description:
      "Set a role's permission matrix. value = { <moduleKey>: { read, create, edit, delete } } booleans — call export_roles_csv to see the module keys. Needs member_roles:edit.",
    inputSchema: obj({ roleId: S, value: { type: "object" } }, ["roleId", "value"]),
    binding: "TENANCY",
    method: "POST",
    path: "/api/tenancy/roles/permissions",
    buildBody: (i) => ({ roleId: i.roleId, value: i.value }),
  },

  // members (team_members) — people JOIN via invite; these change or remove them
  {
    name: "set_member_role",
    description:
      "Change a member's role. Needs team_members:edit. The last admin can't be demoted (guarded).",
    inputSchema: obj({ userId: S, roleId: S }, ["userId", "roleId"]),
    binding: "TENANCY",
    method: "POST",
    path: "/api/tenancy/members/role",
    buildBody: (i) => ({ userId: i.userId, roleId: i.roleId }),
  },
  {
    name: "remove_member",
    description:
      "Remove a member from the team. Needs team_members:delete. You can't remove yourself or the last admin (guarded).",
    inputSchema: obj({ userId: S }, ["userId"]),
    binding: "TENANCY",
    method: "POST",
    path: "/api/tenancy/members/remove",
    buildBody: (i) => ({ userId: i.userId }),
  },

  // invites (team_members)
  {
    name: "create_invite",
    description: "Invite someone by email to a role (sends the branded email). Needs team_members:create.",
    inputSchema: obj({ email: S, roleId: S }, ["email", "roleId"]),
    binding: "TENANCY",
    method: "POST",
    path: "/api/tenancy/invites",
    buildBody: (i) => ({ email: i.email, roleId: i.roleId }),
  },
  {
    name: "revoke_invite",
    description: "Revoke a pending invite. Needs team_members:delete.",
    inputSchema: obj({ inviteId: S }, ["inviteId"]),
    binding: "TENANCY",
    method: "POST",
    path: "/api/tenancy/invites/revoke",
    buildBody: (i) => ({ inviteId: i.inviteId }),
  },

  // dropdown values (selectable_data)
  {
    name: "create_dropdown_value",
    description:
      "Add a dropdown value: type = the group name, value = the option. Needs selectable_data:create.",
    inputSchema: obj({ type: S, value: S }, ["type", "value"]),
    binding: "TENANCY",
    method: "POST",
    path: "/api/tenancy/selectable",
    buildBody: (i) => ({ type: i.type, value: i.value }),
  },
  {
    name: "update_dropdown_value",
    description: "Rename a dropdown value. Needs selectable_data:edit.",
    inputSchema: obj({ id: S, value: S }, ["id", "value"]),
    binding: "TENANCY",
    method: "POST",
    path: "/api/tenancy/selectable/update",
    buildBody: (i) => ({ id: i.id, value: i.value }),
  },
  {
    name: "set_dropdown_value_active",
    description: "Deactivate or reactivate a dropdown value. Needs selectable_data:delete.",
    inputSchema: obj({ id: S, active: B }, ["id", "active"]),
    binding: "TENANCY",
    method: "POST",
    path: "/api/tenancy/selectable/active",
    buildBody: (i) => ({ id: i.id, active: i.active === true }),
  },

  // learning
  {
    name: "create_learning",
    description:
      "Create a learning article (title required; category is picked-or-created). Needs learning:create.",
    inputSchema: obj(
      { title: S, category: S, description: S, contentType: S, contentLink: S, body: S, sequence: N, required: B },
      ["title"]
    ),
    binding: "CONTENT",
    method: "POST",
    path: "/api/content/learning",
    buildBody: (i) => learningBody(i),
  },
  {
    name: "update_learning",
    description: "Edit a learning article. Needs learning:edit.",
    inputSchema: obj(
      { id: S, title: S, category: S, description: S, contentType: S, contentLink: S, body: S, sequence: N, required: B },
      ["id", "title"]
    ),
    binding: "CONTENT",
    method: "POST",
    path: "/api/content/learning/update",
    buildBody: (i) => ({ id: i.id, ...learningBody(i) }),
  },
  {
    name: "set_learning_active",
    description:
      "Deactivate or reactivate a learning article (member progress survives). Needs learning:delete.",
    inputSchema: obj({ id: S, active: B }, ["id", "active"]),
    binding: "CONTENT",
    method: "POST",
    path: "/api/content/learning/active",
    buildBody: (i) => ({ id: i.id, active: i.active === true }),
  },

  // help
  {
    name: "create_help_ticket",
    description: "Raise a support ticket (description required). Needs help:create.",
    inputSchema: obj({ description: S, helpType: S, screenRecordingLink: S }, ["description"]),
    binding: "CONTENT",
    method: "POST",
    path: "/api/content/help",
    buildBody: (i) => ({
      description: i.description,
      helpType: i.helpType,
      screenRecordingLink: i.screenRecordingLink,
    }),
  },
  {
    name: "update_help_ticket",
    description: "Edit a ticket's details. Needs help:edit.",
    inputSchema: obj({ id: S, description: S, helpType: S, screenRecordingLink: S }, ["id", "description"]),
    binding: "CONTENT",
    method: "POST",
    path: "/api/content/help/update",
    buildBody: (i) => ({
      id: i.id,
      description: i.description,
      helpType: i.helpType,
      screenRecordingLink: i.screenRecordingLink,
    }),
  },
  {
    name: "set_help_status",
    description:
      "Move a ticket along its lifecycle (e.g. open → in progress → fixed). Needs help:edit.",
    inputSchema: obj({ id: S, status: S }, ["id", "status"]),
    binding: "CONTENT",
    method: "POST",
    path: "/api/content/help/status",
    buildBody: (i) => ({ id: i.id, status: i.status }),
  },
  {
    name: "reply_help_ticket",
    description: "Add a reply to a ticket's thread. Needs help:read (any member who can see tickets).",
    inputSchema: obj({ helpId: S, body: S }, ["helpId", "body"]),
    binding: "CONTENT",
    method: "POST",
    path: "/api/content/help/reply",
    buildBody: (i) => ({ helpId: i.helpId, body: i.body }),
  },

  // ---- the agentic import (plan is METERED on the team's AI quota) ----
  {
    name: "start_import",
    description:
      "Start a file import: opens a batch. Add files with add_import_file, then plan_import, then run_import.",
    inputSchema: obj({}),
    binding: "DATAOPS",
    method: "POST",
    path: "/api/data-ops/import/batch",
    buildBody: () => ({}),
  },
  {
    name: "add_import_file",
    description: "Attach one CSV (text) to an import batch.",
    inputSchema: obj({ batchId: S, name: S, csv: S }, ["batchId", "csv"]),
    binding: "DATAOPS",
    method: "POST",
    path: "/api/data-ops/import/batch/file",
    buildBody: (i) => ({ batchId: i.batchId, name: i.name ?? "file.csv", csv: i.csv }),
  },
  {
    name: "plan_import",
    description:
      "Build the import plan (which table each file feeds, column mapping, dependency order, rows that will be skipped + why). Uses one AI request from the team's quota.",
    inputSchema: obj({ batchId: S }, ["batchId"]),
    binding: "DATAOPS",
    method: "POST",
    path: "/api/data-ops/import/batch/plan",
    buildBody: (i) => ({ batchId: i.batchId }),
  },
  {
    name: "run_import",
    description:
      "Run a PLANNED import in dependency order. Writes through the same gated doors the screens use (full audit trail); returns the per-row report.",
    inputSchema: obj({ batchId: S }, ["batchId"]),
    binding: "DATAOPS",
    method: "POST",
    path: "/api/data-ops/import/batch/confirm",
    buildBody: (i) => ({ batchId: i.batchId }),
  },
  {
    name: "list_imports",
    description: "The team's import history (who ran what, when, totals).",
    inputSchema: obj({}),
    binding: "DATAOPS",
    method: "GET",
    path: "/api/data-ops/import/batches",
  },
  // ---- the in-app assistant, over MCP (metered like any chat turn) ----
  {
    name: "agent_chat",
    description:
      "Talk to the team's assistant — it can answer from live data or act (as the token's owner, capped by their permissions). If it proposes a guarded action, call agent_confirm with the returned threadId.",
    inputSchema: obj({ message: S, threadId: S }, ["message"]),
    binding: "DATAOPS",
    method: "POST",
    path: "/api/data-ops/agent/chat",
    buildBody: (i) => ({ message: i.message, ...(i.threadId ? { threadId: i.threadId } : {}) }),
  },
  {
    name: "agent_confirm",
    description: "Approve (or decline) the action(s) the assistant proposed on a thread.",
    inputSchema: obj({ threadId: S, approve: { type: "boolean" } }, ["threadId", "approve"]),
    binding: "DATAOPS",
    method: "POST",
    path: "/api/data-ops/agent/confirm",
    buildBody: (i) => ({ threadId: i.threadId, approve: i.approve === true }),
  },
]

export function getMcpTool(name: string): McpTool | undefined {
  return MCP_TOOLS.find((t) => t.name === name)
}

/** Cap what one tools/call returns (a 5 MB export would blow an MCP client). */
const MAX_RESULT_CHARS = 400_000

/** Forward one tool call to its gated door with the bridged session cookie. */
export async function forwardTool(
  env: Env,
  tool: McpTool,
  input: Record<string, unknown>,
  cookie: string
): Promise<{ ok: boolean; text: string }> {
  const fetcher = env[tool.binding]
  const query = tool.method === "GET" && tool.buildQuery ? tool.buildQuery(input) : ""
  const init: RequestInit = { method: tool.method, headers: { Cookie: cookie } }
  if (tool.method === "POST") {
    ;(init.headers as Record<string, string>)["Content-Type"] = "application/json"
    init.body = JSON.stringify(tool.buildBody ? tool.buildBody(input) : {})
  }
  const res = await fetcher.fetch(`https://internal${tool.path}${query}`, init)
  const raw = await res.text()
  const text = raw.length > MAX_RESULT_CHARS ? `${raw.slice(0, MAX_RESULT_CHARS)}\n…(truncated)` : raw
  return { ok: res.ok, text }
}
