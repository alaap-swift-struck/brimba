// THE ACTIVITY LAWS, machine-checked (see RULES.md + shared/rules/registry.ts).
// R5 one generic record-activity read path · R17 idempotent transitions (a
// double click moves zero rows, so it writes no second history row) · R18 a
// cross-module read carries the caller's rights · R25 the log is append-only
// and the rule is stated once. Read source straight off disk.

import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { ACTIVITY_GATE_MAP, ACTIVITY_TABLE_EXEMPT } from "@shared/rules/registry"

import { ROOT, WEB, declarationBody, read, serverSources, stripComments, workerSources } from "./_paths"

describe("RULES — the activity laws", () => {
  // R5 — record activity is read through the ONE generic (table, id) path.
  it("generic-activity-path: the activity read path has a generic record scope", () => {
    const src = read(join(ROOT, "workers", "tenancy", "src", "lib", "activity-read.ts"))
    expect(src, "activity-read must support the generic `record` scope").toContain('scope === "record"')
    const api = read(join(WEB, "lib", "api.ts"))
    expect(api, "the web app reads record activity through the one fetcher").toContain("recordActivity")
  })

  // R17 — state transitions are idempotent: every deactivate/reactivate UPDATE
  // carries the current-status predicate (a double click must move ZERO rows and
  // write no duplicate history), and the writers read the changed count back.
  it("idempotent-transitions: every deactivate/reactivate UPDATE carries the status predicate", () => {
    const offenders: string[] = []
    for (const [path, src] of workerSources()) {
      let idx = -1
      while ((idx = src.indexOf("SET deactivated_at =", idx + 1)) !== -1) {
        // The statement window: from its UPDATE keyword to just past the match.
        const from = src.lastIndexOf("UPDATE", idx)
        const stmt = src.slice(from, Math.min(src.length, idx + 500))
        // An upsert's DO UPDATE (excluded.*) re-activates by design — exempt.
        if (/excluded\./.test(stmt)) continue
        if (!/deactivated_at IS (NOT )?NULL/.test(stmt)) offenders.push(`${path} @${idx}`)
      }
      // Status moves too: a help status UPDATE must carry `status <> ?`.
      let s = -1
      while ((s = src.indexOf("UPDATE help SET status", s + 1)) !== -1) {
        const stmt = src.slice(s, Math.min(src.length, s + 500))
        if (!/status <>/.test(stmt)) offenders.push(`${path} @${s} (status move without <> predicate)`)
      }
    }
    expect(
      offenders,
      `state transition without the current-status predicate (R17): ${offenders.join(", ")}`
    ).toEqual([])
    // The three transition writers read the changed count back (RETURNING id) so
    // a zero-row move can skip the activity row + the publish.
    for (const [file, fn] of [
      ["workers/tenancy/src/lib/roles.ts", "setRoleActive"],
      ["workers/tenancy/src/lib/selectable.ts", "setSelectableActive"],
      ["workers/content/src/lib/learning.ts", "setLearningActive"],
      ["workers/content/src/lib/help.ts", "setStatus"],
    ] as const) {
      const src = read(join(ROOT, ...file.split("/")))
      // `declarationBody`, NOT slice-to-end-of-file. The old form sliced from the
      // function to the END OF THE FILE and grepped for `return false` in all of
      // it — so ANY later function's `return false` satisfied it. Proven blind on
      // 2026-08-18: the row-count check was deleted from setLearningActive, an
      // unrelated `return false` was added forty lines below, and this check went
      // GREEN with the exact bug R17 exists to prevent sitting in the file.
      const body = declarationBody(src, src.indexOf(`export async function ${fn}`))
      expect(/RETURNING id/.test(body), `${fn} must read the changed-row count (RETURNING id)`).toBe(true)
      expect(
        /return false/.test(body),
        `${fn} must skip activity/publish when zero rows moved — and the check now reads ONLY this function's body`
      ).toBe(true)
    }
  })

  // R18 — a cross-module read carries the caller's module rights. Every
  // relatedTable any worker writes must resolve through the gate map (or a
  // pinned, reasoned exemption); the team feed subtracts denied modules through
  // ONE shared clause any count must reuse.
  it("activity-gate-coverage: every relatedTable resolves to a gated module or a pinned exemption", () => {
    const known = new Set([...Object.keys(ACTIVITY_GATE_MAP), ...Object.keys(ACTIVITY_TABLE_EXEMPT)])
    const offenders: string[] = []
    for (const [path, src] of workerSources()) {
      for (const m of src.matchAll(/relatedTable: "([a-z_]+)"/g))
        if (!known.has(m[1])) offenders.push(`${path} writes relatedTable "${m[1]}"`)
    }
    // Dynamic writer: the import engine logs relatedTable: target.tableKey — so
    // every TargetDef key must be in the gate map (imports write real module rows).
    const targetsSrc = read(join(ROOT, "workers", "data-ops", "src", "lib", "targets.ts"))
    for (const m of targetsSrc.matchAll(/tableKey: "([a-z_]+)"/g))
      if (!(m[1] in ACTIVITY_GATE_MAP)) offenders.push(`targets.ts TargetDef "${m[1]}" not in ACTIVITY_GATE_MAP`)
    expect(
      offenders,
      `a table the feed cannot NAME is a table it cannot withhold (R18) — add it to ACTIVITY_GATE_MAP or (with a reason) ACTIVITY_TABLE_EXEMPT: ${offenders.join(", ")}`
    ).toEqual([])

    // The ONE clause: the reader exposes the shared builder, the team scope uses
    // it, and the route builds `allowed` from the registry map + the caller's rights.
    const reader = read(join(ROOT, "workers", "tenancy", "src", "lib", "activity-read.ts"))
    expect(reader).toContain("export function activityVisibilityClause")
    expect(reader).toContain('scope === "team"')
    const route = read(join(ROOT, "workers", "tenancy", "src", "routes", "team.ts"))
    expect(route).toContain("ACTIVITY_GATE_MAP")
    expect(route).toContain("getMyPermissions")
  })

  // R25 — a record's whole life lands in the ONE activity table, the rule is
  // stated in ONE place, and the table is APPEND-ONLY.
  //
  // WHAT THIS CHECKS, said plainly: that no code path updates or deletes an
  // activity row, that the two other documents point at the seam rather than
  // restating the rule, and that the seam names what is deliberately not logged.
  // It canNOT check that every new module remembers to log — that needs the
  // meaning of the code. The behavioural cover for the write itself is
  // `workers/content/test/idempotent-transitions.test.ts`, which asserts a real
  // transition writes exactly one row and a repeat writes none.
  it("activity-birth-to-death: the log is append-only and the rule is stated once (R25)", () => {
    // (a) APPEND-ONLY. An UPDATE or DELETE against the log in the request path
    // turns a trail into a draft. The retention sweep is the ONE exception and
    // is a documented policy, not request-path code.
    const offenders: string[] = []
    // serverSources, not workerSources — `shared/workers/activity.ts` IS the log
    // seam, and this check could not see the file it exists to protect. It
    // survived the pass that moved eight other checks onto the shared reader,
    // which is its own lesson: fixing the readers does not fix the SCOPES.
    // (Activity-log review, round 2, 2026-08-25.)
    for (const [path, src] of serverSources()) {
      if (path.endsWith("/retention.ts")) continue
      const code = stripComments(src)
      for (const re of [
        /UPDATE\s+activity\b/gi,
        /DELETE\s+FROM\s+activity\b/gi,
        /UPDATE\s+account_activity\b/gi,
        // The missing fourth. An account's own history is a log too, and nothing
        // forbade deleting from it.
        /DELETE\s+FROM\s+account_activity\b/gi,
      ]) {
        if (re.test(code)) offenders.push(`${path} → ${re.source}`)
      }
    }
    expect(
      serverSources().some(([p]) => p.includes("shared/workers/activity.ts")),
      "R25's scan cannot see the log seam itself — the one file it most needs to read"
    ).toBe(true)
    expect(
      offenders,
      `activity rows must never be rewritten in the request path (R25): ${offenders.join(", ")}`
    ).toEqual([])

    // (b) STATED ONCE. The seam owns the rule; the other two point at it. When
    // this was stated in three places they drifted into three different rules,
    // and the schema's version excluded creations the code had always logged.
    const seam = read(join(ROOT, "shared", "workers", "activity.ts"))
    expect(seam, "the seam must carry the law id").toContain("LAW R25")
    expect(seam, "and name what is deliberately NOT logged, so the gaps are decisions").toMatch(
      /DELIBERATELY NOT LOGGED/i
    )
    const schema = read(join(ROOT, "workers", "tenancy", "src", "team-schema.ts"))
    expect(
      /stated ONCE/i.test(schema),
      "the team schema must POINT at the seam, not restate the rule (it drifted once already)"
    ).toBe(true)

    // (c) THE ROW SAYS WHICH DOOR. Without origin, "did the agent do this?" is
    // answerable only by reading source — no use at all mid-incident.
    expect(seam, "the origin header must be named in the seam").toContain("ORIGIN_HEADER")
    expect(schema, "and the column must exist in the team schema").toContain("origin TEXT")
  })
})
