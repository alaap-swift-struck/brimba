// THE BULK LAW (R24) — a single-record write door either has a bulk twin, or a
// written reason why it cannot; and every twin says whether its rows may run
// TOGETHER or must run IN ORDER.
//
// The first half is the owner's rule. The second half is what makes it safe, and
// it is the part that is easy to get wrong.
//
// A stock movement computes its balance from the balance the PREVIOUS movement
// left behind. Run ten of those together and you get ten lines that each read
// the same starting balance, a ledger that does not add up, and no way to work
// out afterwards which line was wrong — because every one of them is
// individually plausible. That is not a slow bug, it is an unauditable one.
//
// Most writes have no such dependency. Deactivating forty dropdown values is
// forty independent facts, and forcing them through one at a time is needlessly
// slow for no gain.
//
// So the ordering is DECLARED, not inferred. A door that says "together" while
// secretly depending on the previous row's result is exactly the fault this law
// exists to catch.
//
// WHAT IS MACHINE-CHECKED, AND WHAT IS NOT — stated plainly, because a check
// that overclaims is worse than none:
//
//   CHECKED: every edit/delete-gated door appears below, as a twin or an
//   exemption with a reason. A new module cannot quietly ship without deciding.
//
//   CHECKED: a door declared `in-order` must not parallelise its rows. Handing
//   an ordered door to Promise.all is a real, visible, source-detectable fault
//   and the most likely way this law gets broken.
//
//   NOT CHECKED: whether a door declared `together` secretly depends on order.
//   That needs the meaning of the code, not its shape — a lib could read a
//   running total through three layers of indirection and no scan would see it.
//   The honest cover is a BEHAVIOURAL test per ordered door: run the twin with
//   rows whose correct result depends on sequence, and assert the final state.
//   `workers/tenancy/test/bulk-ordering.test.ts` is that test for the base's own
//   doors; a module adding an ordered twin owes one of its own.

/** May a bulk door's rows run at once, or must each wait for the last? */
export type BulkOrdering =
  /** Independent rows. Order changes nothing about the outcome. */
  | "together"
  /** Each row's result depends on what the previous row left behind — a running
   * balance, a sequence number, a position in a list. Must run sequentially. */
  | "in-order"

export type BulkDoor =
  | { twin: string; ordering: BulkOrdering; note?: string }
  | { exempt: string }

/**
 * Every single-record write door in the base, and what it does about bulk.
 *
 * Keyed by the HANDLER NAME, because that is what the check can find in the
 * source. A door missing from here fails the check — deciding is mandatory,
 * choosing "no" is not a failure.
 */
export const BULK_DOORS: Record<string, BulkDoor> = {
  // ── has a twin ────────────────────────────────────────────────────────────
  postSetLearningActive: {
    twin: "postBulkSetLearningActive",
    ordering: "together",
    note: "Each article's active flag is independent of every other's.",
  },
  postHelpStatus: {
    twin: "postBulkHelpStatus",
    ordering: "together",
    note: "A ticket's status move depends only on that ticket's current status (R17), never on another ticket.",
  },
  postSetSelectableActive: {
    twin: "postBulkSetSelectableActive",
    ordering: "together",
    note: "Retiring dropdown values: forty independent facts. Added 2026-08-12 — it was the one twin genuinely missing.",
  },

  // ── deliberately no twin, with the reason ─────────────────────────────────
  postUpdateLearning: {
    exempt:
      "Editing content is not a bulk shape — every row carries DIFFERENT text. A twin would take an array of full records, which is an import, and the importer already does that with a plan and a preview.",
  },
  postUpdateHelp: { exempt: "Same as postUpdateLearning — different text per row is an import, not a bulk action." },
  postUpdateSelectable: { exempt: "Same — renaming forty values to forty different names is an import." },
  postUpdateRole: { exempt: "Same — and a role's name and description are edited one at a time by nature." },
  postUpdateTeam: { exempt: "There is exactly one team per request. A bulk twin has nothing to iterate." },
  postSetRoleActive: {
    exempt:
      "Retiring a role changes what every HOLDER of it can do, and the screen shows each role's member count for exactly that reason. Doing forty at once hides the one consequence a person needs to see before agreeing.",
  },
  postMemberRole: {
    exempt:
      "The >=1 admin invariant is evaluated per row and can flip mid-batch — demoting four admins is legal for the first three and must fail on the fourth. That makes it ordered by nature, and no screen in the base needs it. A fork that adds one owes an `in-order` twin AND a behavioural test.",
  },
  postMemberRemove: { exempt: "Same as postMemberRole — the last-admin guard makes it ordered, and nothing needs it." },
  postRevokeInvite: { exempt: "An invite is revoked from its own row, one at a time. No screen offers a multi-select." },
  postResolveError: { exempt: "Owner-only maintenance on the error dashboard, one cluster at a time." },
  postGrantCredits: { exempt: "Owner-only, one team at a time, and it moves a balance — a bulk twin would have to be ordered for no benefit." },
  postSeedTargets: { exempt: "Idempotent whole-catalogue seed. It IS the bulk operation." },
  postRolePerms: {
    exempt:
      "The permission MATRIX is already the bulk unit — one call carries every module x right cell for a role. A twin over several roles would apply one matrix to many, which is the one thing a permission screen must never make easy to do by accident.",
  },
  postScreen: {
    exempt:
      "One screen override for one module. Setting many at once is a configuration import, not a bulk action, and would want the importer's plan-and-preview rather than a fire-and-forget array.",
  },
}

/** The bulk doors that must run their rows sequentially. Named separately so the
 * check reads ONE list rather than re-deriving it, and so a module author can
 * see at a glance which doors carry the heavier obligation. */
export const ORDERED_TWINS: string[] = Object.values(BULK_DOORS)
  .filter((d): d is Extract<BulkDoor, { twin: string }> => "twin" in d && d.ordering === "in-order")
  .map((d) => d.twin)
