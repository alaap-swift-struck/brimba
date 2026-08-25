// THE ONE tool catalog — the single source of truth for the endpoints BOTH machine
// surfaces expose: the in-app AI agent (workers/data-ops) and the external MCP surface
// (workers/mcp). Before this, each declared the same ~two dozen tenancy/content CRUD
// endpoints separately, so a new capability had to be added twice and the two could
// silently drift. Now a capability is declared ONCE here and each surface PROJECTS it:
//   • the agent adds its model-facing bits (write / confirm rule / step summary) — see
//     data-ops/src/lib/tools.ts `toAgentTool`;
//   • the MCP adds only its protocol shape (inputSchema = schema, its own name) — see
//     mcp/src/lib/tools.ts `toMcpTool`.
// Both forward to the SAME gated door (the real doors gate + validate + audit + publish),
// so the wiring here (path · method · binding · schema · buildBody) must match the door.
// Surface-ONLY tools stay in each surface's own file: the agent's run_import_batch (SELF)
// + bulk_* + set_help_status_by_filter (all confirm-gated, no MCP confirm panel) +
// get_role_permissions + update_team + mark_learning_done; the MCP's whoami +
// exports + the agentic-import batch tools + agent_chat/agent_confirm.

import { GuardError } from "./gating"

/* ------------------------------- schema helpers ------------------------------- */

export const S = { type: "string" } as const
export const B = { type: "boolean" } as const
export const N = { type: "number" } as const
export const obj = (props: Record<string, unknown>, required: string[] = []): Record<string, unknown> => ({
  type: "object",
  properties: props,
  required,
})

/** Coerce a model/tool input field to a trimmed string (NUL-free enough for a body). */
export const str = (input: Record<string, unknown>, key: string): string => {
  const v = input[key]
  return typeof v === "string" ? v : v == null ? "" : String(v)
}
/** THE LOST-UPDATE GUARD, for a machine caller.
 *
 * Five edit doors take `expectedVersion` — the `updated_at` the caller was shown —
 * and refuse to land on a row that has moved on since. The web client sends it.
 * No tool exposed it or forwarded it, so a machine edit ALWAYS won a concurrent
 * race: the assistant or an outside integration would silently overwrite a change
 * a person made thirty seconds earlier, and the door's protection was reachable
 * from exactly one of the three surfaces.
 *
 * Optional, because a machine caller that genuinely has not read the row first
 * cannot supply one, and refusing every such edit would break more than it fixes.
 * Supplying it is how a caller opts INTO the protection the UI gets by default.
 * (Interfacelessness review, 2026-08-25.)
 *
 * EXPORTED for the agent-only tools: `update_team` sits on a door that takes the
 * guard, and being declared in a different file was the whole reason it didn't
 * offer it. The pair travels together on purpose — expose the field without
 * forwarding it and a caller believes it's protected when it isn't. */
export const VERSION_FIELD = { expectedVersion: S }
export const version = (input: Record<string, unknown>): string | undefined => opt(input, "expectedVersion")

/** A REQUIRED boolean body field — THE one coercion guard both surfaces share.
 *
 * The three `set_*_active` tools used to build `active: i.active === true`. That
 * reads as a coercion and behaves as a decision: an OMITTED field is `undefined`,
 * `undefined === true` is `false`, and the tool cheerfully sends "switch this
 * off". The schema marks it required and `tools/call` does not validate against
 * the schema, so a machine caller that simply forgot the field DEACTIVATED the
 * record — and the door's own clean 400 was unreachable, because the tool had
 * already invented a value for it.
 *
 * Throwing here puts that 400 back within reach. (Interfacelessness review,
 * 2026-08-25.)
 *
 * EXPORTED because the agent-only tools need the same guard: `mark_learning_done`
 * built `done: i.done === true` in its own file and so kept the old behaviour a
 * fortnight after the shared ones were fixed — one required boolean out of four
 * still inventing a value, which is how a divergence hides. A guard that lives in
 * one place and is reachable from both is the only kind that can't drift. */
export const bool = (input: Record<string, unknown>, key: string): boolean => {
  const v = input[key]
  if (typeof v !== "boolean")
    throw new GuardError(400, "invalid_input", `"${key}" must be true or false — it was ${v === undefined ? "not given" : JSON.stringify(v)}.`)
  return v
}

/** An OPTIONAL string body field: the value, or undefined so JSON.stringify drops it
 * (the door then treats it as an omitted form field). */
const opt = (input: Record<string, unknown>, key: string): string | undefined => str(input, key) || undefined

/** A role reference for a step summary: "the Sub Admin role" when the id resolved to a
 * title (via `names`), else "role <id>". */
export const roleLabel = (input: Record<string, unknown>, names?: Record<string, string>): string => {
  const id = str(input, "roleId")
  const title = names?.[id]
  return title ? `the ${title} role` : `role ${id}`
}
/** A member reference for a summary: the resolved name/email, else "member <id>". */
const memberLabel = (input: Record<string, unknown>, names?: Record<string, string>): string => {
  const id = str(input, "userId")
  return names?.[id] ?? `member ${id}`
}

/** The learning create/edit body — the same optional field set both surfaces send
 * (undefined keys drop out of JSON.stringify, so the door treats them as omitted). */
const learningBody = (i: Record<string, unknown>): Record<string, unknown> => ({
  title: str(i, "title"),
  category: opt(i, "category"),
  description: opt(i, "description"),
  contentType: opt(i, "contentType"),
  contentLink: opt(i, "contentLink"),
  body: opt(i, "body"),
  sequence: typeof i.sequence === "number" ? i.sequence : undefined,
  required: typeof i.required === "boolean" ? i.required : undefined,
})

/* ---------------------------------- the type ---------------------------------- */

/** One endpoint both machine surfaces expose. Neutral wiring at the top; the agent-only
 * projection nested under `agent`; `mcpName` is the MCP's historical name where it differs
 * from the agent's (kept so external MCP scripts don't break). */
export type SharedTool = {
  /** Canonical tool name (the agent's, and the MCP's unless `mcpName` overrides). */
  name: string
  /** The MCP's own name for this endpoint, when it differs (external-contract stable). */
  mcpName?: string
  /** ONE human description — handed to the model AND shown to MCP developers. */
  summary: string
  binding: "TENANCY" | "CONTENT"
  method: "GET" | "POST"
  path: string
  /** JSON-Schema of the input (the model's input_schema AND the MCP inputSchema). */
  schema: Record<string, unknown>
  buildBody?: (input: Record<string, unknown>) => Record<string, unknown>
  buildQuery?: (input: Record<string, unknown>) => string
  /** The in-app agent's projection of this endpoint (the MCP ignores it). */
  agent: {
    write: boolean
    /** show the yes/no panel — boolean, or an input-aware predicate for the toggles. */
    confirm?: boolean | ((input: Record<string, unknown>) => boolean)
    /** one-line human label for the step row / confirm panel. */
    summarize: (input: Record<string, unknown>, names?: Record<string, string>) => string
  }
}

/* -------------------------------- the catalog --------------------------------- */

/** WHY SOME CONSTRUCTIVE WRITES STILL CONFIRM. The rule is that only DESTRUCTIVE
 * acts stop for a yes/no panel — creating an article or replying to a ticket just
 * runs. Privilege WRITES are the reviewed exception: anything gated on
 * member_roles: or team_members: decides WHO CAN DO WHAT,
 * and the model reaches them while reading team data an attacker can author (a
 * ticket description is up to 20,000 characters of someone else's text). Fenced
 * tool output plus one system-prompt sentence is a soft defence; a confirm panel
 * the admin must click is a hard one. So these four confirm — not because they are
 * destructive, but because a silent one is a silent privilege escalation.
 * The set is DERIVED, not listed: isPrivilegeWrite() reads each tool's own gate,
 * so a write added tomorrow to either table confirms the moment it exists. A
 * name list would have locked the four above and waved through the fifth —
 * which is exactly where update_role was found.
 * The MCP surface ignores `agent.confirm` — it has no panel to show, and the
 * confirming UI belongs to the connecting client. Same door, same gate, same
 * audit row; the asymmetry is documented in MCP.md, not a capability gap. */
export const SHARED_TOOLS: SharedTool[] = [
  /* --------------------------------- reads --------------------------------- */
  {
    name: "list_members",
    summary: "List the team's members, with their roles. Pass `id` (a member's user id) to fetch just that one member.",
    binding: "TENANCY", method: "GET", path: "/api/tenancy/members",
    schema: obj({ id: S }),
    buildQuery: (i) => (str(i, "id") ? `?id=${encodeURIComponent(str(i, "id"))}` : ""),
    agent: { write: false, summarize: (i) => (str(i, "id") ? "Look up one member" : "List members") },
  },
  {
    name: "list_roles",
    summary: "List the team's roles. Pass `id` (a role id) to fetch just that one role.",
    binding: "TENANCY", method: "GET", path: "/api/tenancy/roles",
    schema: obj({ id: S }),
    buildQuery: (i) => (str(i, "id") ? `?id=${encodeURIComponent(str(i, "id"))}` : ""),
    agent: { write: false, summarize: (i) => (str(i, "id") ? "Look up one role" : "List roles") },
  },
  {
    name: "list_invites",
    summary:
      "List the team's invites — each one's email, role, status (pending / accepted / revoked) and its invite id. Use this to find a PENDING invite's id before revoking it (list_members only shows people who've already joined, so an unaccepted invite won't be there).",
    binding: "TENANCY", method: "GET", path: "/api/tenancy/invites",
    schema: obj({ id: S }),
    buildQuery: (i) => (str(i, "id") ? `?id=${encodeURIComponent(str(i, "id"))}` : ""),
    agent: { write: false, summarize: (i) => (str(i, "id") ? "Look up one invite" : "List invites") },
  },
  {
    name: "list_dropdown_values",
    summary:
      "List the team's dropdown values (selectable data), active first then deactivated — each carries `active`. Deactivated values are listed too, so you can find one's id and reactivate it.",
    binding: "TENANCY", method: "GET", path: "/api/tenancy/selectable",
    schema: obj({ id: S }),
    buildQuery: (i) => (str(i, "id") ? `?id=${encodeURIComponent(str(i, "id"))}` : ""),
    agent: { write: false, summarize: (i) => (str(i, "id") ? "Look up one dropdown value" : "List dropdown values") },
  },
  {
    name: "list_learning",
    summary: "List the team's learning / how-to articles. Pass `id` to fetch just one article.",
    binding: "CONTENT", method: "GET", path: "/api/content/learning",
    schema: obj({ id: S }),
    buildQuery: (i) => (str(i, "id") ? `?id=${encodeURIComponent(str(i, "id"))}` : ""),
    agent: { write: false, summarize: (i) => (str(i, "id") ? "Look up one article" : "List learning articles") },
  },
  {
    name: "list_help_tickets",
    summary:
      "List the team's support tickets. scope: 'mine' (yours) or 'all' (default all); pass `id` to fetch just one ticket. Returns ONE page plus the exact `total`, `hasMore`, and an opaque `nextCursor` — to read further, call again passing that value as `cursor` (never invent one).",
    binding: "CONTENT", method: "GET", path: "/api/content/help",
    schema: obj({ scope: S, id: S, cursor: S }),
    buildQuery: (i) => {
      const q = [str(i, "scope") === "mine" ? "scope=mine" : "scope=all"]
      if (str(i, "id")) q.push(`id=${encodeURIComponent(str(i, "id"))}`)
      if (str(i, "cursor")) q.push(`cursor=${encodeURIComponent(str(i, "cursor"))}`)
      return `?${q.join("&")}`
    },
    agent: { write: false, summarize: (i) => (str(i, "id") ? "Look up one ticket" : "List support tickets") },
  },

  /* --------------------------------- roles --------------------------------- */
  {
    name: "create_role",
    summary: "Create a new team role. It starts with no access rights; use set_role_permissions to grant them.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/roles",
    schema: obj({ title: S, description: S }, ["title"]),
    buildBody: (i) => ({ title: str(i, "title"), description: str(i, "description") || "" }),
    // PRIVILEGE GRANT → confirm (see the note above SHARED_TOOLS).
    agent: { write: true, confirm: true, summarize: (i) => `Create the role "${str(i, "title")}"` },
  },
  {
    name: "update_role",
    summary: "Rename or re-describe an existing team role (by id).",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/roles/update",
    schema: obj({ roleId: S, title: S, description: S, ...VERSION_FIELD }, ["roleId", "title"]),
    buildBody: (i) => ({ roleId: str(i, "roleId"), title: str(i, "title"), description: str(i, "description") || "", expectedVersion: version(i) }),
    // PRIVILEGE WRITE (member_roles) → confirm. Renaming isn't a grant, but a
    // rename is how a grant gets socially engineered ("call Viewer Admin").
    agent: { write: true, confirm: true, summarize: (i, names) => `Rename ${roleLabel(i, names)} to "${str(i, "title")}"` },
  },
  {
    name: "set_role_active",
    summary: "Switch a role off (deactivate — holders keep access) or back on (reactivate) — never deleted.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/roles/active",
    schema: obj({ roleId: S, active: B }, ["roleId", "active"]),
    buildBody: (i) => ({ roleId: str(i, "roleId"), active: bool(i, "active") }),
    agent: {
      write: true,
      // PRIVILEGE WRITE (member_roles) → confirm BOTH ways. Deactivating removes
      // access; REACTIVATING hands it back to everyone still holding the role.
      confirm: true,
      summarize: (i, names) => `${i.active === true ? "Activate" : "Deactivate"} ${roleLabel(i, names)}`,
    },
  },
  {
    name: "set_role_permissions",
    summary:
      "Set a role's access rights (by role id). `value` is an object keyed by module — one of teams, team_members, member_roles, learning, help, selectable_data, agent — each mapping to { read, create, edit, delete } booleans. Turning on create/edit/delete auto-enables read. The Admin role is locked (the server enforces this).",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/roles/permissions",
    schema: obj({ roleId: S, value: { type: "object" } }, ["roleId", "value"]),
    buildBody: (i) => ({ roleId: str(i, "roleId"), value: i.value }),
    // PRIVILEGE GRANT → confirm (see the note above SHARED_TOOLS).
    agent: { write: true, confirm: true, summarize: (i, names) => `Set access rights for ${roleLabel(i, names)}` },
  },

  /* -------------------------------- members -------------------------------- */
  {
    name: "set_member_role",
    summary: "Change a member's role (by user id). The last admin can't be demoted and you can't change your own role (guarded).",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/members/role",
    schema: obj({ userId: S, roleId: S }, ["userId", "roleId"]),
    buildBody: (i) => ({ userId: str(i, "userId"), roleId: str(i, "roleId") }),
    agent: {
      write: true, confirm: true, // PRIVILEGE GRANT → confirm
      summarize: (i, names) => {
        const id = str(i, "roleId")
        return `Change ${memberLabel(i, names)} to ${names?.[id] ?? `role ${id}`}`
      },
    },
  },
  {
    name: "remove_member",
    summary: "Remove a member from the team (by user id). You can't remove yourself or the last admin (guarded).",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/members/remove",
    schema: obj({ userId: S }, ["userId"]),
    buildBody: (i) => ({ userId: str(i, "userId") }),
    agent: { write: true, confirm: true, summarize: (i, names) => `Remove ${names?.[str(i, "userId")] ?? str(i, "userId")} from the team` },
  },

  /* -------------------------------- invites -------------------------------- */
  {
    name: "invite_member",
    mcpName: "create_invite",
    summary:
      "Invite someone to the team by email, assigning them a role (by role id). Sends the branded invite email. Refuses if the email is the caller's own address or someone already on the team, and returns `emailSent` so you know whether the email actually went out.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/invites",
    schema: obj({ email: S, roleId: S }, ["email", "roleId"]),
    buildBody: (i) => ({ email: str(i, "email"), roleId: str(i, "roleId") }),
    agent: {
      write: true, confirm: true, // PRIVILEGE GRANT → confirm
      summarize: (i, names) => {
        const id = str(i, "roleId")
        return `Invite ${str(i, "email")} as ${names?.[id] ?? `role ${id}`}`
      },
    },
  },
  {
    name: "revoke_invite",
    summary: "Revoke a pending invitation that hasn't been accepted yet (by invite id).",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/invites/revoke",
    schema: obj({ inviteId: S }, ["inviteId"]),
    buildBody: (i) => ({ inviteId: str(i, "inviteId") }),
    agent: { write: true, confirm: true, summarize: (i, names) => `Revoke the invite for ${names?.[str(i, "inviteId")] ?? str(i, "inviteId")}` },
  },

  /* --------------------------- dropdown values ----------------------------- */
  {
    name: "create_dropdown_value",
    summary:
      "Add a dropdown value: type = the group name, value = the option. A dropdown write NEVER invents an option — for 'create X and move things onto it', call THIS first and the write second, in the SAME turn.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/selectable",
    schema: obj({ type: S, value: S }, ["type", "value"]),
    buildBody: (i) => ({ type: str(i, "type"), value: str(i, "value") }),
    agent: { write: true, confirm: false, summarize: (i) => `Add "${str(i, "value")}" to the ${str(i, "type")} list` },
  },
  {
    name: "update_dropdown_value",
    summary: "Rename a dropdown value (by id).",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/selectable/update",
    schema: obj({ id: S, value: S, ...VERSION_FIELD }, ["id", "value"]),
    buildBody: (i) => ({ id: str(i, "id"), value: str(i, "value"), expectedVersion: version(i) }),
    agent: { write: true, confirm: false, summarize: (i) => `Rename dropdown value ${str(i, "id")} to "${str(i, "value")}"` },
  },
  {
    name: "set_dropdown_active",
    mcpName: "set_dropdown_value_active",
    summary: "Switch a dropdown value off (deactivate) or back on (reactivate) — never deleted.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/selectable/active",
    schema: obj({ id: S, active: B }, ["id", "active"]),
    buildBody: (i) => ({ id: str(i, "id"), active: bool(i, "active") }),
    agent: {
      write: true,
      confirm: (i) => i.active !== true, // destructive only when DEACTIVATING
      summarize: (i) => `${i.active === true ? "Activate" : "Deactivate"} dropdown value ${str(i, "id")}`,
    },
  },

  /* -------------------------------- learning ------------------------------- */
  {
    name: "create_learning",
    summary: "Create a new learning / how-to article (title required; category is picked-or-created).",
    binding: "CONTENT", method: "POST", path: "/api/content/learning",
    schema: obj(
      { title: S, category: S, description: S, contentType: S, contentLink: S, body: S, sequence: N, required: B },
      ["title"]
    ),
    buildBody: (i) => learningBody(i),
    agent: { write: true, confirm: false, summarize: (i) => `Create the learning article "${str(i, "title")}"` },
  },
  {
    name: "update_learning",
    summary: "Edit an existing learning article (by id).",
    binding: "CONTENT", method: "POST", path: "/api/content/learning/update",
    schema: obj(
      { id: S, title: S, category: S, description: S, contentType: S, contentLink: S, body: S, sequence: N, required: B, ...VERSION_FIELD },
      ["id", "title"]
    ),
    buildBody: (i) => ({ id: str(i, "id"), ...learningBody(i), expectedVersion: version(i) }),
    agent: { write: true, confirm: false, summarize: (i) => `Edit learning article ${str(i, "id")}` },
  },
  {
    name: "set_learning_active",
    summary: "Switch a learning article off (deactivate — member progress survives) or back on (reactivate) — never deleted.",
    binding: "CONTENT", method: "POST", path: "/api/content/learning/active",
    schema: obj({ id: S, active: B }, ["id", "active"]),
    buildBody: (i) => ({ id: str(i, "id"), active: bool(i, "active") }),
    agent: {
      write: true,
      confirm: (i) => i.active !== true, // destructive only when DEACTIVATING
      summarize: (i) => `${i.active === true ? "Activate" : "Deactivate"} learning article ${str(i, "id")}`,
    },
  },

  /* ---------------------------------- help --------------------------------- */
  {
    name: "raise_help_ticket",
    mcpName: "create_help_ticket",
    summary: "Raise a new support ticket for the team (description required).",
    binding: "CONTENT", method: "POST", path: "/api/content/help",
    schema: obj({ description: S, helpType: S, screenRecordingLink: S }, ["description"]),
    buildBody: (i) => ({ description: str(i, "description"), helpType: opt(i, "helpType"), screenRecordingLink: opt(i, "screenRecordingLink") }),
    agent: { write: true, confirm: false, summarize: (i) => `Raise a support ticket: "${str(i, "description").slice(0, 60)}"` },
  },
  {
    name: "update_help_ticket",
    summary: "Edit a support ticket's details (by id).",
    binding: "CONTENT", method: "POST", path: "/api/content/help/update",
    schema: obj({ id: S, description: S, helpType: S, screenRecordingLink: S, ...VERSION_FIELD }, ["id", "description"]),
    buildBody: (i) => ({ id: str(i, "id"), description: str(i, "description"), helpType: opt(i, "helpType"), screenRecordingLink: opt(i, "screenRecordingLink"), expectedVersion: version(i) }),
    agent: { write: true, confirm: false, summarize: (i) => `Edit support ticket ${str(i, "id")}` },
  },
  {
    name: "set_help_status",
    summary: "Move a support ticket along its lifecycle (open, in_progress, resolved, reopened), by id.",
    binding: "CONTENT", method: "POST", path: "/api/content/help/status",
    schema: obj({ id: S, status: S }, ["id", "status"]),
    buildBody: (i) => ({ id: str(i, "id"), status: str(i, "status") }),
    agent: { write: true, confirm: false, summarize: (i) => `Set ticket ${str(i, "id")} to "${str(i, "status")}"` },
  },
  {
    name: "reply_help_ticket",
    summary: "Add a reply to a support ticket's thread (by id).",
    binding: "CONTENT", method: "POST", path: "/api/content/help/reply",
    schema: obj({ helpId: S, body: S }, ["helpId", "body"]),
    buildBody: (i) => ({ helpId: str(i, "helpId"), body: str(i, "body") }),
    agent: { write: true, confirm: false, summarize: (i) => `Reply to ticket ${str(i, "helpId")}` },
  },
]

/** The permission each SHARED WRITE needs (module:right). The door ENFORCES it; this is
 * only the developer hint the MCP `tools/list` description shows external clients ("…
 * Needs member_roles:create."). Keyed by canonical name (works for the mcpName ones too).
 * Reads carry no hint (they just need the module's read right). */
export const TOOL_GATES: Record<string, string> = {
  create_role: "member_roles:create",
  update_role: "member_roles:edit",
  set_role_active: "member_roles:delete",
  set_role_permissions: "member_roles:edit",
  set_member_role: "team_members:edit",
  remove_member: "team_members:delete",
  invite_member: "team_members:create",
  revoke_invite: "team_members:delete",
  create_dropdown_value: "selectable_data:create",
  update_dropdown_value: "selectable_data:edit",
  set_dropdown_active: "selectable_data:delete",
  create_learning: "learning:create",
  update_learning: "learning:edit",
  set_learning_active: "learning:delete",
  raise_help_ticket: "help:create",
  update_help_ticket: "help:edit",
  set_help_status: "help:edit",
  reply_help_ticket: "help:read",
}

/** Lookup by canonical name (the agent's name). */
/** The tables whose rows decide WHO CAN DO WHAT. */
const PRIVILEGE_MODULES = ["member_roles", "team_members"]

/** Is this a PRIVILEGE write — one that changes who can do what? DERIVED from the
 * tool's own declared gate (falling back to the door it posts to, so an agent-only
 * tool can't slip through by being absent from TOOL_GATES). Never a list of names:
 * a name list locks the tools you thought of and waves through the next one — which
 * is exactly how `update_role` sat at confirm:false beside four that confirmed. */
export function isPrivilegeWrite(tool: { name: string; path: string; write?: boolean }): boolean {
  if (tool.write === false) return false
  const gate = TOOL_GATES[tool.name]
  if (gate) return PRIVILEGE_MODULES.includes(gate.split(":")[0])
  return /\/api\/tenancy\/(roles|members|invites)\b/.test(tool.path)
}

export const sharedByName = (name: string): SharedTool | undefined => SHARED_TOOLS.find((t) => t.name === name)
