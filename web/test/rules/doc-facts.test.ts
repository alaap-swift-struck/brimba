// THE DOCUMENT-FACT CHECKS. Not laws about code — laws about the SENTENCES,
// each one asserting that something a document states is still true of the
// repo. A runbook is only as good as its last edit, and a document that claims
// an artefact exists is worse than one that says nothing.

import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { ROOT, read } from "./_paths"

describe("RULES — what the documents claim", () => {
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
