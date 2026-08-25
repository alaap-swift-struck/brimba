// WHAT A WRITE DOOR HANDS BACK, machine-checked (see RULES.md + shared/rules/registry.ts).
// R21 a create returns the created row · R23 an edit/status/deactivate returns
// the affected row (and its single-row reader reads ONE row) · R24 every write
// door has decided about bulk. All three are DERIVED FROM THE GATE, so a new
// module is covered the moment its door is gated — never a hand-list of names.

import { describe, expect, it } from "vitest"

import { CREATE_RETURNS_EXEMPT, MUTATION_RETURNS_EXEMPT } from "@shared/rules/registry"
import { BULK_DOORS, ORDERED_TWINS } from "@shared/workers/bulk-doors"

import { declarationBody, serverSources, stripComments, workerSources } from "./_paths"

describe("RULES — what a write door hands back", () => {
  // R21 — a create door returns the CREATED RECORD, never the collection. Handing
  // the whole list back to add one row costs the caller a capped list it did not
  // ask for, contradicts row-level live-sync (CACHING rule 3) and the paging rule
  // (a screen reads one bounded page, never the table), and — the part that
  // actually bites — leaves the caller unable to learn the new record's id
  // without a follow-up search.
  //
  // DERIVED FROM THE GATE, not a hand-list of handler names: a create door is a
  // route that opens on the `create` right. A new module's create door is covered
  // the moment it is gated, which is the moment it exists.
  it("create-returns-row: a create door returns the created record, never the collection", () => {
    const offenders: string[] = []
    const seen = new Set<string>()
    const namedCreators: string[] = []
    for (const [path, src] of workerSources()) {
      if (!path.includes("/src/routes/")) continue
      for (const n of src.matchAll(/export async function (postCreate\w+)/g)) namedCreators.push(n[1])
      const re = /export async function (\w+)\s*\(/g
      let m: RegExpExecArray | null
      while ((m = re.exec(src))) {
        const name = m[1]
        const body = stripComments(declarationBody(src, m.index))
        // `(?:<[^(<>]*>)?` — gatedBody carries a type argument at most call sites;
        // a scan that doesn't allow for it silently skips every one of them.
        if (!/(?:gatedBody|gated|requireRight)(?:<[^(<>]*>)?\([^)]*"create"\s*\)/.test(body)) continue
        if (CREATE_RETURNS_EXEMPT[name]) continue
        seen.add(name)
        if (/:\s*await\s+(?:list|search)\w*\(/.test(body) || /return\s+\w*Page\(/.test(body))
          offenders.push(`${path} → ${name} hands back a COLLECTION (return the created row + its exact total)`)
        // WHAT IS RETURNED, not what is in scope. This asked whether the literal
        // `created:` appeared anywhere in the body — and two doors stopped
        // satisfying it the day they were made FASTER. `const [created, counts]
        // = await Promise.all([…])` then `return json({ created, … })` is ES6
        // shorthand: the colon is gone, so a door that obeys R21 perfectly read
        // as a violation. A correct refactor turning a check red is the same
        // disease as a wrong one leaving it green — the check was reading a
        // spelling, not a fact.
        //
        // The obvious repair is worse than the bug. Allowing `created` without
        // the colon matches the BINDING as readily as the return, so a door that
        // reads the new row and then forgets to hand it back would sail through:
        // a false positive traded for a false negative. So the question is put to
        // the RETURNED OBJECT and nothing else.
        //
        // A door that assembles its response somewhere else has no such literal
        // and IS flagged. That is deliberate, not an oversight: R21's shape is
        // `{ created, total }`, and a door that cannot be read that way should
        // become a CREATE_RETURNS_EXEMPT decision rather than a silent pass.
        const returned = [...body.matchAll(/return\s+json\(\{([\s\S]*?)\}\s*\)/g)].map((r) => r[1])
        if (/await\s+create\w*\(/.test(body) && !returned.some((o) => /\bcreated\b/.test(o)))
          offenders.push(
            `${path} → ${name} creates a record but never returns it as \`created\` in a \`return json({…})\``
          )
      }
    }
    // THE TRIPWIRE, cross-checked rather than a magic number. A handler NAMED
    // postCreate* is a create door by construction; the scan finds doors by their
    // GATE. Two independent signals, so a gate regex that quietly stops matching
    // (e.g. forgetting that `gatedBody` carries a type argument) is caught by the
    // other one instead of reporting all clear.
    expect(namedCreators.length, "no postCreate* handlers found at all — the scan has gone blind").toBeGreaterThan(3)
    expect(
      namedCreators.filter((n) => !seen.has(n) && !CREATE_RETURNS_EXEMPT[n]),
      "these handlers are named like create doors but the gate-derived scan never saw them — the scan is blind to some of the doors it is meant to cover"
    ).toEqual([])
    expect(offenders, `a create door returned a collection (R21): ${offenders.join("; ")}`).toEqual([])
  })

  // R23 — a MUTATION door returns the affected row, never the collection.
  //
  // R21 established this for creates and stopped there. Every edit, status and
  // deactivate door still handed back the whole capped list: a full list read
  // plus a COUNT on the server, and the entire collection over the wire, to
  // change one row. Worse, it contradicted the rule this base enforces
  // everywhere else — a live ping makes every OTHER client patch the single
  // changed row (CACHING rule 3), while the client that did the work replaced
  // everything it was showing. Two update paths for one event, and the
  // expensive one belonged to the person actually waiting for it.
  //
  // What is banned is the COLLECTION, not "anything that isn't a row": a bulk
  // door honestly returns `{ updated, skipped }` and a toggle may return
  // `{ ok: true }`. Both are fine — neither ships a list.
  //
  // DERIVED FROM THE GATE, like R21: a mutation door is a route opening on the
  // `edit` or `delete` right, so a new module is covered the moment it is gated.
  it("mutation-returns-row: an edit/deactivate door returns the affected row, never the collection", () => {
    const offenders: string[] = []
    const seen = new Set<string>()
    const namedMutators: string[] = []
    for (const [path, src] of workerSources()) {
      if (!path.includes("/src/routes/")) continue
      for (const n of src.matchAll(/export async function (postUpdate\w+|postSet\w+Active)/g))
        namedMutators.push(n[1])
      const re = /export async function (\w+)\s*\(/g
      let m: RegExpExecArray | null
      while ((m = re.exec(src))) {
        const name = m[1]
        const body = stripComments(declarationBody(src, m.index))
        // Same shape as R21's gate scan — `gatedBody` carries a type argument at
        // most call sites, and a scan blind to that skips nearly every door.
        if (!/(?:gatedBody|gated|requireRight)(?:<[^(<>]*>)?\([^)]*"(?:edit|delete)"\s*\)/.test(body))
          continue
        // A door that ALSO gates on `create` is a CREATE door and belongs to
        // R21, not here — `postCreateRole` demands edit as well, because
        // creating a role WITH a permission matrix is create-plus-edit in one
        // move. A create legitimately returns the new total, since a create is
        // the only thing that can move it. Without this, the two derived rules
        // overlap and R23 contradicts R21 on the same handler.
        if (/(?:gatedBody|gated|requireRight)(?:<[^(<>]*>)?\([^)]*"create"\s*\)/.test(body)) continue
        if (MUTATION_RETURNS_EXEMPT[name]) continue
        seen.add(name)
        if (/:\s*await\s+(?:list|search)\w*\(/.test(body) || /return\s+\w*Page\(/.test(body))
          offenders.push(`${path} → ${name} hands back a COLLECTION (return the affected row + its exact total)`)
        // …and it must not COUNT either. Every one of these counts is an
        // unfiltered COUNT(*), and the base is deactivate-not-delete, so no
        // edit — not even a deactivate — can change how many rows a collection
        // HAS. Only a create can. A full-table count on the hot path of every
        // edit, to return a number that provably did not move, is the most
        // avoidable query in the app.
        if (/:\s*await\s+count\w*\(/.test(body))
          offenders.push(`${path} → ${name} runs a COUNT an edit cannot have changed (drop it — only a create moves the total)`)
      }
    }
    // The same two-signal tripwire R21 uses. A handler named postUpdate* or
    // postSet*Active is a mutation door by construction; the scan finds doors by
    // their GATE. If the gate regex quietly stops matching, the name-derived
    // list catches it instead of the check reporting all clear.
    expect(
      namedMutators.length,
      "no postUpdate*/postSet*Active handlers found at all — the scan has gone blind"
    ).toBeGreaterThan(3)
    expect(
      namedMutators.filter((n) => !seen.has(n) && !MUTATION_RETURNS_EXEMPT[n]),
      "these handlers are named like mutation doors but the gate-derived scan never saw them — the scan is blind to some of the doors it is meant to cover"
    ).toEqual([])
    expect(offenders, `a mutation door returned a collection (R23): ${offenders.join("; ")}`).toEqual([])
  })

  it("mutation-returns-row: the single-row reader reads ONE row, not the whole list (R23)", () => {
    // R23's letter is "return the affected row". Every `one*` reader obeyed it by
    // reading the WHOLE capped list and calling `.find()` — so the law removed a
    // full list read from the WIRE and left it in the DATABASE, on the hot path of
    // every create, edit, status change and deactivate.
    //
    // And it was not only wasteful. Past `LIST_HARD_CAP` the `.find()` misses and
    // the reader returns `null`, which `applyUpdated` reads as "this record left
    // the list" — so editing row 1,001 made it vanish from the screen. The shape
    // guarantee those readers were buying (a single row identical to a listed one)
    // is better bought by SHARING the projection, which is what they do now.
    // (Scaling + speed reviews, 2026-08-25.)
    const offenders: string[] = []
    let seen = 0
    for (const [path, src] of serverSources()) {
      if (!path.includes("/src/lib/")) continue
      const re = /export async function (one[A-Z]\w*)/g
      let m: RegExpExecArray | null
      while ((m = re.exec(src))) {
        seen++
        const body = stripComments(declarationBody(src, m.index))
        if (/await\s+(?:list|search)\w*\(/.test(body) && /\.find\(/.test(body))
          offenders.push(`${path} → ${m[1]} reads a whole list to return one row`)
      }
    }
    expect(seen, "no one* single-row readers found at all — the scan has gone blind").toBeGreaterThan(3)
    expect(
      offenders,
      `a single-row reader read the whole collection (R23) — give it its own WHERE id = ?, sharing the list's projection: ${offenders.join("; ")}`
    ).toEqual([])
  })

  // R24 — a single-record write door either HAS a bulk twin or a written reason
  // why it cannot, and every twin declares whether its rows may run TOGETHER or
  // must run IN ORDER.
  //
  // The ordering half is the point. A stock movement computes its balance from
  // what the previous line left behind; ten run together give ten
  // individually-plausible lines and a ledger nobody can untangle. Most writes
  // have no such dependency and are needlessly slow if forced sequential.
  //
  // WHAT THIS CHECK CAN AND CANNOT SEE — stated here because a check that
  // overclaims is worse than none. It CAN prove every door decided, and that an
  // `in-order` twin does not parallelise. It CANNOT prove a `together` door is
  // really order-independent; that needs meaning, not shape, so each ordered
  // twin owes a behavioural test instead.
  it("bulk-twin-declared: every write door decides about bulk, and ordered twins stay ordered", () => {
    const missing: string[] = []
    const parallelised: string[] = []
    const seen = new Set<string>()

    for (const [path, src] of workerSources()) {
      if (!path.includes("/src/routes/")) continue
      const re = /export async function (\w+)\s*\(/g
      let m: RegExpExecArray | null
      while ((m = re.exec(src))) {
        const name = m[1]
        const body = stripComments(declarationBody(src, m.index))
        if (!/(?:gatedBody|gated|requireRight)(?:<[^(<>]*>)?\([^)]*"(?:edit|delete)"\s*\)/.test(body)) continue
        if (/(?:gatedBody|gated|requireRight)(?:<[^(<>]*>)?\([^)]*"create"\s*\)/.test(body)) continue
        if (/^postBulk/.test(name)) continue // a twin is not itself a single door
        seen.add(name)
        if (!BULK_DOORS[name])
          missing.push(`${path} → ${name} has not decided about bulk (add a twin or a reason to shared/workers/bulk-doors.ts)`)
      }

      // An ORDERED twin must not fan its rows out. This is the fault the law is
      // for, and it IS visible in the shape of the code.
      for (const twin of ORDERED_TWINS) {
        const at = src.indexOf(`export async function ${twin}`)
        if (at === -1) continue
        const body = stripComments(declarationBody(src, at))
        if (/Promise\.all\(|\.map\(\s*async/.test(body))
          parallelised.push(`${path} → ${twin} is declared in-order but hands its rows to Promise.all`)
      }
    }

    // The tripwire: if the gate scan stops matching, `seen` empties and the
    // whole check passes vacuously while enforcing nothing.
    expect(seen.size, "no edit/delete-gated doors found at all — the scan has gone blind").toBeGreaterThan(5)
    expect(missing, missing.join("; ")).toEqual([])
    expect(parallelised, parallelised.join("; ")).toEqual([])

    // A declared twin must actually exist. A registry naming a handler nobody
    // wrote is a law that reads as satisfied and protects nothing.
    const handlers = new Set<string>()
    for (const [p2, src] of workerSources())
      if (p2.includes("/src/routes/"))
        for (const n of src.matchAll(/export async function (\w+)/g)) handlers.add(n[1])
    const phantom = Object.values(BULK_DOORS)
      .flatMap((d) => ("twin" in d ? [d.twin] : []))
      .filter((t) => !handlers.has(t))
    expect(phantom, `declared twins that do not exist: ${phantom.join(", ")}`).toEqual([])
  })
})
