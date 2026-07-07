// The agent's REAL-SCREEN TRACE map. When the co-pilot runs a WRITE tool, the panel
// can gently drive the same screen — and the same ?panel / ?confirm dialog — the
// manual path opens, so the user watches their change happen where they'd have made
// it themselves. `traceFor` turns one tool call into a URL target (path + the query
// the deep-link host honours) plus a highlight selector for a transient ring.
//
// The target mirrors deep-link-screen.tsx exactly: the /t/<team>/<module> spine, the
// ?panel=add|edit(&module&id) / ?confirm=<action>&id dialogs (InviteDialog,
// RolePickerDialog, RoleFormDialog, ConfirmAction), and the section a plain write
// lands on. READS (list_*/get_*) return null — there's nothing to open, so the panel
// just narrates them in the step log. Kept as a pure function (no React) so it's
// unit-testable and shared by the panel + its test.

/** Where a traced tool should take the user: a host path, the query that opens the
 * matching dialog, and a CSS selector to ring briefly once the screen is there. */
export type TraceTarget = { path: string; query?: Record<string, string>; highlight?: string }

// The nav bus + engine live in web/lib/screen-trace.tsx (DOM/React); THIS file
// stays pure and DOM-free so the trace-parity test in workers/data-ops can import
// it and prove every write tool in the agent catalog maps to a screen.

const seg = (teamId: string, module: string) => `/t/${teamId}/${module}`
const str = (input: Record<string, unknown>, key: string): string => {
  const v = input[key]
  return typeof v === "string" ? v : ""
}

/** Map a WRITE tool + its input to the screen + dialog the manual path uses. Returns
 * null for reads (and anything without a first-class screen), so the caller skips the
 * on-screen move. `teamId` is the effective team the tool ran against. */
export function traceFor(
  tool: string,
  input: Record<string, unknown>,
  teamId: string
): TraceTarget | null {
  switch (tool) {
    /* ------------------------------- invites ------------------------------- */
    // Invite → the invites list with the InviteDialog open (?panel=add&module=invites),
    // exactly as the "Invite" button opens it.
    case "invite_member":
      return { path: seg(teamId, "invites"), query: { panel: "add", module: "invites" }, highlight: "form" }
    // Revoke → the invite's detail (the confirm is destructive; the manual path
    // opens ?confirm=invites.revoke there). Land on the row so the change is visible.
    case "revoke_invite":
      return { path: `${seg(teamId, "invites")}/${str(input, "inviteId")}`, highlight: "main" }

    /* ------------------------------- members ------------------------------- */
    // Change a role → the member's detail with the role picker open, like the
    // "Change role" action (?panel=edit&module=members&id).
    case "set_member_role":
      return {
        path: `${seg(teamId, "members")}/${str(input, "userId")}`,
        query: { panel: "edit", module: "members", id: str(input, "userId") },
        highlight: "form",
      }
    // Remove a member → their detail row (destructive; server-gated). Show where it
    // happened rather than auto-firing the ?confirm, so nothing surprises the user.
    case "remove_member":
      return { path: `${seg(teamId, "members")}/${str(input, "userId")}`, highlight: "main" }

    /* -------------------------------- roles -------------------------------- */
    // Create a role → the roles list with the RoleFormDialog open (?panel=add&module=roles).
    case "create_role":
      return { path: seg(teamId, "roles"), query: { panel: "add", module: "roles" }, highlight: "form" }
    // Edit / (de)activate / set-permissions / read-permissions → that role's detail
    // (the permission grid is host-composed at the role detail). Land on the row.
    case "update_role":
    case "set_role_active":
    case "set_role_permissions":
    case "get_role_permissions":
      return { path: `${seg(teamId, "roles")}/${str(input, "roleId")}`, highlight: "main" }

    /* ------------------------------ dropdowns ------------------------------ */
    // Any dropdown write → the Dropdown values screen (one screen, no per-value URL).
    case "create_dropdown_value":
    case "update_dropdown_value":
    case "set_dropdown_active":
      return { path: seg(teamId, "dropdowns"), highlight: "main" }

    /* ------------------------------- learning ------------------------------ */
    // Create → the learning list (the "New article" form is a rich dialog; land on the
    // list where the new row appears live). Edit / (de)activate / mark-done → the
    // article's detail.
    case "create_learning":
      return { path: seg(teamId, "learning"), highlight: "main" }
    case "update_learning":
    case "set_learning_active":
    case "mark_learning_done":
      return { path: `${seg(teamId, "learning")}/${str(input, "id")}`, highlight: "main" }

    /* --------------------------------- help -------------------------------- */
    // Raise → the help list (the new ticket appears live). Reply / edit / status →
    // that ticket's detail thread.
    case "raise_help_ticket":
      return { path: seg(teamId, "help"), highlight: "main" }
    case "reply_help_ticket":
      return { path: `${seg(teamId, "help")}/${str(input, "helpId")}`, highlight: "main" }
    case "update_help_ticket":
    case "set_help_status":
      return { path: `${seg(teamId, "help")}/${str(input, "id")}`, highlight: "main" }

    /* ------------------------------- imports -------------------------------- */
    // Running an attached-files import (the chat import) → the Import screen,
    // where the batch's plan/report lives. Bulk changes → the list that patches
    // live as the rows change.
    case "run_import_batch":
      return { path: seg(teamId, "import"), highlight: "main" }
    case "bulk_set_help_status":
      return { path: seg(teamId, "help"), highlight: "main" }
    case "bulk_set_learning_active":
      return { path: seg(teamId, "learning"), highlight: "main" }

    /* --------------------------------- team -------------------------------- */
    // Rename the team → the team Overview (the bare /t/<team> path, as the host
    // builds it) with the edit dialog open, like the "Edit" action.
    case "update_team":
      return { path: `/t/${teamId}`, query: { panel: "edit", module: "team" }, highlight: "form" }

    // Reads (list_*, and anything else) — nothing to open on screen.
    default:
      return null
  }
}

/** Write tools that deliberately have NO screen to drive (none today — the
 * trace-parity test forces every new write tool to either map above or be
 * added here with a reason). */
export const SCREENLESS_WRITE_TOOLS: string[] = []
