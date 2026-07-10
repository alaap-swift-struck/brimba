// The agent's TOOL CATALOG (opt-in: an action is a tool ONLY if it's here) and the
// act-as-user EXECUTOR. Every tool maps to a gated endpoint the UI already uses;
// executing it forwards the caller's session cookie, so the real door re-checks their
// permission and validates the input — the agent can never exceed the invoker's rights.
//
// The ~two dozen tenancy/content CRUD tools are DECLARED ONCE in the shared catalog
// (`shared/workers/tool-catalog.ts`) and shared with the MCP surface — this file
// PROJECTS each shared endpoint into an AgentTool (adding the model-facing description +
// confirm rule + step summary via `toAgentTool`), then adds the agent-ONLY tools below
// (reads/bulk/import that the MCP doesn't expose, and the SELF import-batch runner).
//
// SAFETY (locked):
//   • Act-as-user — every tool runs through the same gated endpoint AS the caller, so
//     the agent has the user's EXACT rights and the real door re-checks each call.
//   • Confirm rule — the agent pauses for a yes/no panel ONLY before a DESTRUCTIVE act
//     (removing a member, revoking an invite, or DEACTIVATING an existing role /
//     article / dropdown value) or a BULK / import write. Every constructive write runs
//     straight away (see `requiresConfirm` — the one place this is decided).
//   • Catastrophic blocks — controlling DEVICE SESSIONS and DELETING the team are not in
//     the catalog; the agent structurally cannot do them (identityBlocked is the backstop).
//   • Fence — tool RESULTS are returned to the model as DATA (role:"tool"), never as
//     instructions; the system prompt reinforces it.

import { GuardError, requireRight, teamContext } from "../../../../shared/workers/gating"
import { forwardToDoor } from "../../../../shared/workers/http"
import { publishChange } from "../../../../shared/workers/realtime"
import {
  obj,
  roleLabel,
  S,
  SHARED_TOOLS,
  str,
  type SharedTool,
} from "../../../../shared/workers/tool-catalog"
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
  /** show the yes/no confirm panel — a boolean, or an input-aware predicate (the three
   * (de)activate toggles confirm only when turning something OFF). Read by requiresConfirm. */
  confirm: boolean | ((input: Record<string, unknown>) => boolean)
  /** never exposed actions guard (identity acts) — true = always refuse. */
  identityBlocked?: boolean
  buildQuery?: (input: Record<string, unknown>) => string
  buildBody?: (input: Record<string, unknown>) => Record<string, unknown>
  /** One-line human label for the step row / confirm panel. `names` maps an id → a
   * friendly name so a summary reads "Remove Jane Doe" not a ULID. */
  summarize: (input: Record<string, unknown>, names?: Record<string, string>) => string
  /** binding:"SELF" tools run INSIDE data-ops (the import batch engine) instead of
   * fetching another worker — still act-as-user (the handler re-opens teamContext). */
  run?: (env: Env, request: Request, input: Record<string, unknown>) => Promise<ToolResult>
}

/** Project a shared endpoint into an AgentTool: the neutral wiring + the model-facing
 * description (the shared `summary`) + the agent's own write / confirm / step summary. */
function toAgentTool(s: SharedTool): AgentTool {
  return {
    name: s.name,
    description: s.summary,
    schema: s.schema,
    binding: s.binding,
    method: s.method,
    path: s.path,
    write: s.agent.write,
    confirm: s.agent.confirm ?? false,
    buildBody: s.buildBody,
    buildQuery: s.buildQuery,
    summarize: s.agent.summarize,
  }
}

/** Tools the AGENT exposes but the MCP does not: a read the MCP serves via export, the
 * team-rename, the two bulk writes, the personal mark-done, and the SELF import runner. */
const AGENT_ONLY: AgentTool[] = [
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
    name: "update_team",
    description: "Edit the active team's details (its name).",
    schema: obj({ name: S }, ["name"]),
    binding: "TENANCY",
    method: "POST",
    path: "/api/tenancy/teams/update",
    write: true,
    confirm: false, // constructive: renaming the team is reversible
    buildBody: (i) => ({ name: str(i, "name") }),
    summarize: (i) => `Rename the team to "${str(i, "name")}"`,
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
    // Runs INSIDE data-ops (binding SELF): the import batch engine, not a worker fetch.
    // Only reachable for a batch the SAME user created (creator-scoped load) — the model
    // can't run someone else's import, and every target module is re-gated for `create`.
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

/** The agent's full catalog: every shared endpoint (projected) + the agent-only tools. */
export const TOOL_CATALOG: AgentTool[] = [...SHARED_TOOLS.map(toAgentTool), ...AGENT_ONLY]

/** binding:"SELF" — run the attached-in-chat import batch through the SAME engine the
 * Import screen uses: re-open teamContext from the request (act-as-user), gate `create`
 * on every target in the plan up front, execute in dependency order, then publish one
 * coarse ping per changed module. Mirrors routes/import postBatchConfirm. */
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

/** Confirm rule (the ONE place it's decided): a write pauses for the yes/no panel only
 * when it's DESTRUCTIVE — removes/withdraws access (remove a member, revoke an invite)
 * or DEACTIVATES an existing record (a role, an article, a dropdown value) — or
 * BULK/high-blast (a bulk change, a whole imported file). Everything constructive runs
 * straight away. `input` lets the (de)activate toggles confirm only when turning OFF. */
export function requiresConfirm(tool: AgentTool, input: Record<string, unknown> = {}): boolean {
  if (!tool.write) return false
  return typeof tool.confirm === "function" ? tool.confirm(input) : tool.confirm === true
}

export type ToolResult = { ok: boolean; status: number; data: unknown; error?: string }

/** Run a tool AS the caller: forward their cookie to the gated endpoint so the real door
 * enforces permissions + validation. Identity-blocked tools are always refused. */
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
