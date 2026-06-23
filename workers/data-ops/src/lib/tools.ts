// The agent's TOOL CATALOG (opt-in: an action is a tool ONLY if it's listed here) and
// the act-as-user EXECUTOR. Every tool maps to a gated endpoint the UI already uses;
// executing it forwards the caller's session cookie, so the real door re-checks their
// permission and validates the input — the agent can never exceed the invoker's rights.
//
// SAFETY (locked):
//   • Confirm rule — a WRITE confirms before running if it's destructive OR touches a
//     dangerous table (roles / members / screens / import). Plain single content edits
//     run freely. (Bulk >1-row writes only happen via the import flow, which has its
//     own preview+confirm, so they're not in this single-call catalog.)
//   • Identity blocks — actions that change WHO YOU ARE (your email, removing/demoting
//     yourself, your other sessions) are simply NOT in the catalog, so the agent
//     structurally cannot do them. The guard below is the belt-and-braces backstop.
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
