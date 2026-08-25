// THE UI LAWS, machine-checked (see RULES.md + shared/rules/registry.ts).
// R2 record details · R3 tab strips · R4 form shell · R6 glossary · R7 drafts ·
// R8 tab counts · R22 create-opens-record — plus the root layout's own
// mounted-what-it-imports rule. Each `it` is the enforcement for one law; it
// reads source straight off disk so the checks can't be fooled by anything but
// the real code.

import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { GLOSSARY } from "@shared/glossary"
import {
  CREATE_OPENS_RECORD,
  CREATE_OPENS_RECORD_EXEMPT,
  FORM_DIALOGS,
  RECORD_DETAIL_COMPONENTS,
  TAB_COUNT_EXCEPTIONS,
} from "@shared/rules/registry"
import { TEAM_SECTIONS } from "@/lib/pages"

import { WEB, componentFiles, read, stripComments } from "./_paths"

describe("RULES — the UI laws", () => {
  // R2 — every record-detail screen exposes Overview + Activity tabs. The
  // engine-recipe details (team/members/invites) carry them as recipe data; the
  // bespoke ones must render them themselves.
  it("record-detail-tabs: bespoke record details render tabs + an Activity feed", () => {
    for (const c of RECORD_DETAIL_COMPONENTS) {
      const src = read(join(WEB, "components", `${c}.tsx`))
      expect(src, `${c} must use library TabsView`).toContain("TabsView")
      expect(src, `${c} must render an ActivityFeed (the Activity tab)`).toContain("ActivityFeed")
    }
  })

  // R3 — collection tab strips use TabsView; no hand-rolled <Button> toggles
  // (a selected-state toggle has the tell-tale `variant={x === y ? … : …}`).
  it("no-handrolled-toggles: no component fakes a tab strip with Button variants", () => {
    const offenders = componentFiles().filter((f) => /variant=\{[^}]*===[^}]*\?/.test(read(f)))
    expect(offenders, `use the library TabsView instead of hand-rolled toggles: ${offenders.join(", ")}`).toEqual([])
  })

  // R4 — every form dialog renders through the shared FormShell.
  it("forms-use-formshell: every form dialog imports FormShell", () => {
    for (const d of FORM_DIALOGS) {
      const src = read(join(WEB, "components", `${d}.tsx`))
      expect(src, `${d} must use FormShell (one shared form layout)`).toContain("form-shell")
    }
  })

  // R7 — every form dialog persists its draft per session, so unsaved input survives
  // navigating away (CACHING.md §11). The draft hook is the single seam.
  it("forms-persist-drafts: every form dialog persists its draft via useFormDraft", () => {
    for (const d of FORM_DIALOGS) {
      const src = read(join(WEB, "components", `${d}.tsx`))
      expect(src, `${d} must persist its draft (useFormDraft — CACHING.md §11)`).toContain("useFormDraft")
    }
  })

  // R8 — every team collection tab derives its count from its loaded rows. A
  // placement:"tab" section that shows a collection MUST declare a countCacheKey
  // (so the badge is derived, never a forgotten hand-listed key), AND the host
  // must build the counts by iterating that field — not a per-key literal.
  it("tab-counts-derived: every collection tab declares a countCacheKey, derived generically", () => {
    for (const s of TEAM_SECTIONS) {
      if (s.placement !== "tab") continue
      if (s.countCacheKey === undefined) {
        expect(
          TAB_COUNT_EXCEPTIONS[s.key],
          `team tab "${s.key}" shows a collection → it must declare a countCacheKey (or be a reviewed TAB_COUNT_EXCEPTIONS entry)`
        ).toBeTruthy()
      } else {
        expect(s.countCacheKey.trim(), `team tab "${s.key}" countCacheKey must be non-empty`).not.toBe("")
      }
    }
    // Anti-regression: the host derives the badges by iterating countCacheKey — no
    // hand-listed per-section literal can creep back in.
    const src = read(join(WEB, "components", "deep-link-screen.tsx"))
    expect(src, "deep-link-screen must derive tab counts from countCacheKey").toContain("s.countCacheKey")
  })

  // R6 — the glossary is the single, well-formed dictionary of product terms.
  it("glossary-wellformed: every term is present, brief, and unique", () => {
    const terms = new Set<string>()
    for (const [key, entry] of Object.entries(GLOSSARY)) {
      expect(entry.term.trim(), `${key}.term`).not.toBe("")
      expect(entry.def.trim(), `${key}.def`).not.toBe("")
      expect(entry.def.length, `${key}.def must be brief (≤140 chars), never over-explained`).toBeLessThanOrEqual(140)
      expect(terms.has(entry.term), `duplicate term "${entry.term}"`).toBe(false)
      terms.add(entry.term)
    }
  })

  // R22 — creating a MASTER record through a form OPENS that record (owner's
  // decision, 2026-08-11). Implemented ONCE, in the shared form seam, so a module
  // declares `opensRecord` and gets the behaviour — rather than every screen
  // remembering to navigate, which is how one module ends up behaving
  // differently from the rest.
  it("create-opens-record: every create form opens its record, or is a NAMED exception", () => {
    // Derived from FORM_DIALOGS: a new form must land in exactly one of the two
    // maps, so adding one forces the decision instead of defaulting to silence.
    for (const dialog of FORM_DIALOGS) {
      const opens = CREATE_OPENS_RECORD[dialog]
      const exempt = CREATE_OPENS_RECORD_EXEMPT[dialog]
      expect(
        Boolean(opens) !== Boolean(exempt),
        `${dialog} must be in exactly ONE of CREATE_OPENS_RECORD / CREATE_OPENS_RECORD_EXEMPT — "nobody decided" and "we decided not to" must not look the same`
      ).toBe(true)
      if (exempt)
        expect(exempt.why.length, `${dialog} is exempt from R22 — say WHY, per table`).toBeGreaterThan(20)
      if (!opens) continue
      const src = read(join(WEB, "components", `${dialog}.tsx`))
      expect(src, `${dialog} must declare opensRecord on its FormShell (R22)`).toContain("opensRecord=")
      expect(
        src,
        `${dialog} must open the "${opens.segment}" segment its detail screen lives under`
      ).toContain(`segment: "${opens.segment}"`)
      // …and the create path must actually RESOLVE with an id, or opensRecord is
      // a declaration that never fires.
      expect(
        /return createdId/.test(src),
        `${dialog} declares opensRecord but never resolves with the created id — the record would never open`
      ).toBe(true)
      // …and it must NOT close itself on the create path. The host's close is
      // `router.back()`, which is ASYNCHRONOUS: it fires after FormShell's push
      // and pops straight back off the record just opened. Every check here was
      // green while the law did nothing, on staging, in a browser — so this is
      // the assertion that would have caught it: the close is GUARDED by the id.
      expect(
        /if \(!createdId\) onOpenChange\(false\)/.test(src),
        `${dialog} closes itself on the create path — the host's close is router.back(), which fires AFTER the navigation and pops off the new record. Guard it: \`if (!createdId) onOpenChange(false)\``
      ).toBe(true)
    }
    // The seam itself: the navigation lives in FormShell, not in the screens.
    const shell = read(join(WEB, "components", "form-shell.tsx"))
    expect(shell, "FormShell owns R22 — it opens the record the create resolved with").toContain("openRecord(")
  })

  it("root-layout-renders-what-it-imports: an import that goes nowhere is not a mount", () => {
    // ERROR-HANDLING.md C1 says the root error boundary wraps the app. It was
    // IMPORTED into web/app/layout.tsx on 19 June and never rendered — `git log -S`
    // shows it was never in that tree at all — while the ruleset and a test both
    // said it was there. `noUnusedLocals` is off, so an import that went nowhere
    // kept the gate green for two months and a render crash showed a blank page.
    //
    // The root layout is where "mounted at the root" claims live, so every
    // component it imports must actually appear in its JSX. (Error-log review,
    // 2026-08-25.)
    const src = stripComments(read(join(WEB, "app", "layout.tsx")))
    const imported: string[] = []
    for (const m of src.matchAll(/^import \{([^}]+)\} from "[@./]/gm))
      for (const name of m[1].split(",").map((n) => n.trim().split(" as ").pop()!.trim()))
        if (/^[A-Z]/.test(name)) imported.push(name)
    expect(imported.length, "no components found in the root layout's imports — the scan has gone blind").toBeGreaterThan(4)
    const unmounted = imported.filter((n) => !new RegExp(`<${n}[\\s/>]`).test(src))
    expect(
      unmounted,
      `imported into the root layout and never rendered: ${unmounted.join(", ")}`
    ).toEqual([])
  })
})
