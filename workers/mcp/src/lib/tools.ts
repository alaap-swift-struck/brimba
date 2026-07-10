// The MCP tool catalog — OPT-IN (an action is a tool ONLY if listed here), each one a
// thin FORWARD to an existing gated door with the bridged, team-pinned session cookie.
// No logic lives here: the real doors gate, validate, meter, audit and publish exactly
// as they do for a browser.
//
// The ~two dozen tenancy/content CRUD tools are DECLARED ONCE in the shared catalog
// (`shared/workers/tool-catalog.ts`) and shared with the in-app agent — this file
// PROJECTS each shared endpoint into an McpTool (`toMcpTool`: inputSchema = schema, the
// MCP's own name where it differs), then adds the MCP-ONLY tools below: whoami, the CSV
// exports, the agentic-import batch tools, and the agent_chat/agent_confirm bridge.
// catalog.test.ts machine-checks every forwarded path against the target workers' OWN
// route tables, so this list can't quietly rot.

import { forwardToDoor } from "../../../../shared/workers/http"
import { obj, S, SHARED_TOOLS, TOOL_GATES, type SharedTool } from "../../../../shared/workers/tool-catalog"
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

/** Project a shared endpoint into an McpTool: the neutral wiring + the shared
 * description, under the MCP's own name (`mcpName`) where it historically differs. */
function toMcpTool(s: SharedTool): McpTool {
  const gate = TOOL_GATES[s.name]
  return {
    name: s.mcpName ?? s.name,
    // Restore the developer permission hint external MCP clients relied on ("… Needs
    // member_roles:create."); the door still enforces it regardless.
    description: gate ? `${s.summary} Needs ${gate}.` : s.summary,
    inputSchema: s.schema,
    binding: s.binding,
    method: s.method,
    path: s.path,
    buildBody: s.buildBody,
    buildQuery: s.buildQuery,
  }
}

/** Tools the MCP exposes but the agent does not: identity, the CSV exports, the scripted
 * agentic-import batch flow, and the assistant bridge (metered like any chat turn). */
const MCP_ONLY: McpTool[] = [
  {
    name: "whoami",
    description: "The token's owner + the team this token is pinned to.",
    inputSchema: obj({}),
    binding: "AUTH",
    method: "GET",
    path: "/api/auth/me",
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

/** The MCP's full catalog: every shared endpoint (projected) + the MCP-only tools. */
export const MCP_TOOLS: McpTool[] = [...SHARED_TOOLS.map(toMcpTool), ...MCP_ONLY]

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
  const res = await forwardToDoor(env[tool.binding], {
    path: tool.path,
    method: tool.method,
    cookie,
    query: tool.method === "GET" && tool.buildQuery ? tool.buildQuery(input) : "",
    body: tool.buildBody ? tool.buildBody(input) : {},
  })
  const raw = await res.text()
  const text = raw.length > MAX_RESULT_CHARS ? `${raw.slice(0, MAX_RESULT_CHARS)}\n…(truncated)` : raw
  return { ok: res.ok, text }
}
