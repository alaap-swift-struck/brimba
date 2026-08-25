// THE DOCUMENT-FACT CHECKS. Not laws about code — laws about the SENTENCES,
// each one asserting that something a document states is still true of the
// repo. A runbook is only as good as its last edit, and a document that claims
// an artefact exists is worse than one that says nothing.

import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { ROOT, read } from "./_paths"

describe("RULES — what the documents claim", () => {
  // Every backticked repo path a root document names must EXIST.
  //
  // Written 2026-08-25, after one test file was split into eight and left
  // FIFTEEN dangling pointers across the canon — in RULES.md, CLAUDE.md,
  // README.md, CACHING.md, BASE-MANUAL.md, four worker test headers and the
  // glossary. Every one of them told a reader to open a file that no longer
  // existed, and the build stayed green through all of it, because nothing
  // anywhere compared a documented path to the disk.
  //
  // That is the whole failure mode this campaign keeps finding: a claim nobody
  // machine-checks rots silently, and prose rots fastest of all. A path is the
  // one kind of claim a document makes that a computer can settle outright.
  //
  // TWICE HALF-BLIND, and both halves found the day after it was written.
  //
  //  1. THE GLOB BRANCH CHECKED NOTHING PAST THE FIRST SEGMENT. It took the text
  //     before the first `*`, dropped back to the parent directory, and asked
  //     whether THAT existed — so `workers/*/test/there-is-no-such-file.test.ts`
  //     resolved to `workers`, which exists, and passed. Every `*` path in the
  //     canon was effectively unchecked. It now expands the glob for real and
  //     asks whether any file matches.
  //  2. IT READ ROOT DOCUMENTS ONLY. `readdirSync(ROOT)` is not recursive, so the
  //     ~80 documents in subdirectories were invisible — including the review
  //     archive, which is where the pointers to the split-up `rules.test.ts`
  //     actually live. The scan now walks the whole repo.
  it("doc-paths-resolve: every repo path a document names is a path that exists", () => {
    // Only paths that are unambiguously THIS repo's: a slash, a known top-level
    // directory, and a file extension. A bare word in backticks is a symbol, a
    // glob is a pattern, and `~/.claude/...` belongs to another repo entirely.
    const REPO_PATH = /`((?:web|workers|shared|scripts|db)\/[A-Za-z0-9._*/-]+\.[a-z]+)`/g
    // NAMED, with a reason each — the repo's own convention for an exemption, so
    // that "this path is allowed not to exist" is a decision on the record and
    // not a hole in the regex. A path missing from here is a finding.
    const EXEMPT: Record<string, string> = {
      "web/components/note-detail.tsx":
        "the worked example — BUILD-A-MODULE walks the reader through building a `notes` module that deliberately does not exist. A guide that could only name files already written would be no guide.",
      "workers/tenancy/src/lib/screens-config.ts":
        "deliberately historical — SCREEN-ENGINE-PLAN records the screen-override subsystem removed on 2026-08-25, and a design record that cannot name what it removed is not a record.",
    }
    // Generated reports are OUTPUT, not canon: a skill overwrites them wholesale
    // on its next run, so a stale path in one is a stale artefact, not a stale
    // claim, and holding the gate red until someone re-runs a report would make
    // this check a nuisance rather than a guard.
    const GENERATED = /-(report|review)\.md$/
    // Machine output and other repos' trees — nothing here is a claim this repo
    // makes. `.session-notes` is gitignored working scratch.
    //
    // `reviews/` is here for the same reason as GENERATED above, and it took a
    // decision rather than a rule: it holds 121 paths that no longer resolve, and
    // ALL 121 dangling paths in the repo are inside it. They are not stale claims
    // — they are DATED RECORDS. A review written on 12 August saying "rules.test.ts
    // line 412" was true on 12 August, and editing it to point at the eight files
    // that replaced it would falsify the record of what was found and when.
    //
    // Three of them settle the argument: `there-is-no-such-file.test.ts`,
    // `00NN_*.sql` and `workers/node_modules/.vite` are ILLUSTRATIONS OF BAD PATHS,
    // quoted inside reviews that were documenting this very check's blind spots.
    // A check that failed on its own bug report would be its own punchline.
    const SKIP = new Set([
      "reviews",
      "node_modules",
      ".next",
      "out",
      ".git",
      ".wrangler",
      ".session-notes",
      "test-results",
      "playwright-report",
    ])
    /** EVERY document in the repo, not just the ones at the top. */
    const docs: string[] = []
    const collect = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (SKIP.has(e.name)) continue
        const full = join(dir, e.name)
        if (e.isDirectory()) collect(full)
        else if (e.name.endsWith(".md") && !GENERATED.test(e.name)) docs.push(full)
      }
    }
    collect(ROOT)
    expect(docs.length, "no documents found — this scan has gone blind").toBeGreaterThan(30)

    /** Does a globbed claim match anything real? Expands segment by segment, so
     * every part of the path is resolved and not just the first. `*` matches
     * within one segment; `**` spans any number of them. */
    const globResolves = (claimed: string): boolean => {
      let here = [ROOT]
      for (const part of claimed.split("/")) {
        const next: string[] = []
        for (const dir of here) {
          if (part === "**") {
            // Zero or more directories: this level, and everything beneath it.
            const descend = (d: string) => {
              next.push(d)
              for (const e of readdirSync(d, { withFileTypes: true }))
                if (e.isDirectory() && !SKIP.has(e.name)) descend(join(d, e.name))
            }
            descend(dir)
          } else if (part.includes("*")) {
            const rx = new RegExp(
              `^${part.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*")}$`
            )
            for (const e of readdirSync(dir)) if (rx.test(e)) next.push(join(dir, e))
          } else if (existsSync(join(dir, part))) {
            next.push(join(dir, part))
          }
        }
        here = [...new Set(next)]
        if (!here.length) return false
      }
      return true
    }

    const dangling: string[] = []
    for (const full of docs) {
      const where = full.slice(ROOT.length + 1)
      for (const m of read(full).matchAll(REPO_PATH)) {
        const claimed = m[1]
        if (EXEMPT[claimed]) continue
        // A `*` is a family, not a file — `workers/*/test/publish-seam.test.ts`
        // is a true statement about seven files. It is a true statement only if
        // one of those files is really there, which is what this resolves.
        const ok = claimed.includes("*")
          ? globResolves(claimed)
          : existsSync(join(ROOT, claimed))
        if (!ok) dangling.push(`${where} → ${claimed}`)
      }
    }
    expect(
      dangling,
      `a document points at a file that does not exist:\n  ${dangling.join("\n  ")}`
    ).toEqual([])
  })

  it("runbook-migrations-current: BOOTSTRAP names the migrations that exist on disk", () => {
    // A day-zero runbook is only as good as its last edit. BOOTSTRAP.md claimed
    // core `0001`–`0013` while seventeen were on disk, and team `0001`…`0006`
    // while eight were — and it did not mention the OPERATIONS database at all,
    // though five workers ship an `OPS` binding. A fresh environment built by
    // following it recorded no errors whatsoever, and looked healthy doing it,
    // because `logError` swallows its own failure.
    // (Base-fork + story reviews, 2026-08-25.)
    const doc = read(join(ROOT, "BOOTSTRAP.md"))
    const highest = (dir: string) =>
      Math.max(...readdirSync(join(ROOT, dir)).map((f) => Number(f.slice(0, 4))).filter((n) => !isNaN(n)))
    const core = highest("db/core")
    const ops = highest("db/ops")
    const team = Math.max(
      ...[...read(join(ROOT, "workers", "tenancy", "src", "team-schema.ts")).matchAll(/"(\d{4})_/g)].map((m) => Number(m[1]))
    )
    expect(doc, `BOOTSTRAP must name core migrations up to ${String(core).padStart(4, "0")}`).toContain(
      `\`0001\`–\`${String(core).padStart(4, "0")}\``
    )
    expect(doc, `BOOTSTRAP must name team migrations up to ${String(team).padStart(4, "0")}`).toContain(
      `\`0001\`…\`${String(team).padStart(4, "0")}\``
    )
    // NOT `/ops/i` — that was the first version, and it matched the PRE-FIX
    // document thirteen times through the worker name `data-ops`. A check written
    // in the same commit as the fix it guards, and never able to fail. Eleventh
    // of its kind found in this campaign, and the second I wrote myself.
    // (Base-fork review, round 2, 2026-08-25.)
    expect(doc, "BOOTSTRAP must CREATE the operations database").toMatch(/d1 create \S*ops/)
    expect(doc, "BOOTSTRAP must APPLY the ops migrations").toMatch(/migrations apply \S*ops/)
    expect(ops, "db/ops must have migrations for the runbook to apply").toBeGreaterThan(0)
    // And the binding must declare where those migrations live, or the command
    // above resolves to wrangler's default directory, which does not exist.
    for (const w of readdirSync(join(ROOT, "workers"))) {
      const cfg = join(ROOT, "workers", w, "wrangler.jsonc")
      if (!existsSync(cfg)) continue
      const src = read(cfg)
      if (!src.includes('"OPS"')) continue
      for (const m of src.matchAll(/\{[^{}]*"binding": "OPS"[^{}]*\}/g))
        expect(m[0], `${w}'s OPS binding must declare migrations_dir`).toContain("migrations_dir")
    }
  })

  it("vault-claims-match-reality: no document may say the vault exists when it does not", () => {
    // `secrets.vault` has NEVER existed — `git log --all --diff-filter=A` returns
    // nothing — while SECRETS.md said so twice, and OPERATIONS.md and CHANGELOG.md
    // agreed. The project's own `vault:check` exits 1 saying "NO VAULT", and is not
    // in any gate. So the one artefact standing between a lost laptop and lost
    // credentials was absent, and four documents said it was there.
    //
    // This does not force the vault to exist — that needs a passphrase, which is
    // the owner's alone. It forces the DOCUMENTS to stop claiming it does.
    // (Ocean + security reviews, 2026-08-25.)
    const sealed = existsSync(join(ROOT, "secrets.vault"))
    if (sealed) return // the claim is true; nothing to police
    const lies: string[] = []
    for (const f of readdirSync(ROOT).filter((f) => f.endsWith(".md"))) {
      for (const line of read(join(ROOT, f)).split("\n")) {
        // A claim of EXISTENCE, not an instruction for how to make one.
        //
        // The first version looked for "is committed" / "is sealed". It was written
        // ABOUT these exact three sentences and matched none of them — SECRETS.md
        // says ", committed to the repo like anything else", OPERATIONS.md says
        // ", committed and encrypted", INVENTORY.md uses a bare present tense.
        // So the check that exists to stop documents claiming the vault is there
        // sat green while three documents claimed exactly that. Found by
        // mac_fell_in_the_ocean, round 3. Present-tense assertion is the signal;
        // an imperative ("run `npm run vault:save`") is not.
        if (!/secrets\.vault/.test(line)) continue
        // THIRD ATTEMPT. Version one looked for "is committed" and matched none
        // of the three sentences it was written about. Version two added a few
        // more phrasings and still passed on two natural rewordings. Enumerating
        // ways to say "it exists" is a losing game — English has more of them than
        // anyone will think of.
        //
        // So the test is INVERTED: a line naming the vault must carry an explicit
        // not-yet marker, or say what CREATES it. Anything else counts as a claim.
        // That fails safe — a new sentence about the vault is a finding until
        // somebody writes it carefully — which is the right direction for the one
        // artefact standing between a lost laptop and lost credentials.
        // (ocean round 4.)
        const saysNotYet =
          /\b(does not exist|not yet|until|once|will be|to be created|has not been)\b/i.test(line) ||
          /vault:save|vault:check/.test(line) ||
          /^\s*[/*#|>-]*\s*(node|npm) /.test(line)
        if (!saysNotYet) lies.push(`${f}: ${line.trim().slice(0, 90)}`)
      }
    }
    expect(
      lies,
      `secrets.vault does not exist, but a document says it does — run npm run vault:save or correct the wording: ${lies.join(" | ")}`
    ).toEqual([])
  })
})
