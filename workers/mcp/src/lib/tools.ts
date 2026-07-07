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
const obj = (props: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties: props,
  required,
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
    description: "The team's dropdown values (selectable data).",
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
