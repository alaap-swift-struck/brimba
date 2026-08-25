# mac_fell_in_the_ocean — round 4 — Brimba · 2026-08-25
SCORE: **94/100**, ungated   (R1 60 gated / 87 uncapped · R2 25 gated / 85 uncapped · R3 90 · **R4 94**)

Measured against `main` @ **`8a7e906`**, and against a real anonymous clone of the remote.
Read-only in the repository: nothing was edited but this file. The drill ran in the session
scratchpad.

## Arithmetic

| # | Criterion | w | R1 | R2 | R3 | **R4** | ×w | Why it moved |
|---|---|---:|---:|---:|---:|---:|---:|---|
| 1 | A remote copy exists and is current | 14 | 45 | 35 | 80 | **80** | 1120 | Unchanged. `main` == `origin/main` == `8a7e906`; working tree clean (0 porcelain lines); the clone lands on the same commit. Still one remote, no mirror |
| 2 | The stored tree is complete | 9 | 100 | 100 | 100 | **100** | 900 | Unchanged |
| 3 | Clone to running, reproducibly | 11 | 85 | 85 | **78** | **98** | 1078 | **+20. The drill now completes.** R3 stopped at step 3 with two TS2307s. See below |
| 4 | A stranger can prove it works | 8 | 95 | 95 | **75** | **95** | 760 | **+20.** `npm run check` from the clone exits 0 with every workspace reporting real counts. R3 dropped this to 75 because the proof was red |
| 5 | The README is a real front door | 8 | 100 | 100 | 100 | **100** | 800 | Unchanged — I followed it and only it |
| 6 | Architecture and decisions are written down | 12 | 97 | 97 | 100 | **100** | 1200 | Unchanged |
| 7 | Operating it: deploy, environments, rollback | 9 | 91 | 91 | 100 | **100** | 900 | Unchanged (already 100; OPERATIONS.md additionally gained performance + hop budgets this round) |
| 8 | The code explains itself | 8 | 98 | 98 | 97 | **97** | 776 | Unchanged |
| 9 | The history tells the story | 5 | 97 | 97 | 93 | **93** | 465 | Unchanged |
| 10 | Bus factor and ownership | 5 | 60 | 60 | 60 | **60** | 300 | Unchanged — single author |
| 11 | The legal right to reuse it | 5 | 100 | 100 | 100 | **100** | 500 | Unchanged (MIT, present) |
| 12 | The non-code inventory | 6 | 95 | 95 | 100 | **100** | 600 | Unchanged. The vault wording is now correct in all three documents — verified by reading them, not by trusting the check (see H1) |
| | | **100** | | | | | **9399** | 9399 ÷ 100 = **93.99 → 94** |

## The drill — it completes now

Anonymous `git clone` of the public remote into the scratchpad, then only what the README
says, in the order it says it. Nothing from the local copy.

| # | Step | R3 result | **R4 result** |
|---|---|---|---|
| 1 | `git clone https://github.com/alaap-swift-struck/brimba.git` | OK, 2.1 s | **OK** — public, anonymous, lands on `main` @ `8a7e906` |
| 2 | `npm install` | OK, 50.4 s, 0 vulns | **OK** — exit 0, **303 packages, 0 vulnerabilities, 8 s** |
| 3 | `npm run check` | **FAILED, exit 2** | **OK — exit 0** |

Step 3 in full: TypeScript passed across every workspace and every test suite ran — realtime
18/18, gateway 41/41, web 168/168 (18 files), and the worker suites before them. This is not
`npx tsc` against an empty `node_modules` silently passing: I confirmed the run by reading
per-workspace test counts off the output, and by confirming the dependency actually landed —

```
lockfile   "node_modules/@swift-struck/ui": version 0.16.0
on disk    require('./node_modules/@swift-struck/ui/package.json').version → 0.16.0
manifest   web/package.json:15  "github:…/swift-struck-ui#v0.16.0"
```

All three agree at **v0.16.0**. R3's CRITICAL — lockfile resolving v0.4.0 while the manifest
promised v0.16.0, so a fresh clone did not compile — **is genuinely fixed in substance.**

Also verified: only **one** manifest declares the UI library (`web/package.json`). R3's
report says "both manifests"; the root correctly declares nothing, and R26 now asserts that
the root must *not* declare it, because npm would hoist the root's resolution over web's.

## Findings

### H1 · HIGH — the lockfile check cannot fail, and it is the third pass at this same defect
`web/test/fork.test.ts:125-132`

```ts
const entry = lock.slice(lock.indexOf("swift-struck-ui"))
expect(
  /"resolved": "[^"]+#([0-9a-f]{40})"/.test(entry) || entry.includes(tag),
  …
).toBe(true)
```

Two things are wrong and either alone is fatal.

**(a) The first alternative accepts any 40-hex SHA.** The real lockfile resolves by commit
(`…#364eea796a3f19320850648dfb24a48e89b0cfa6`), never by tag, so that branch is the one that
always fires — and it fires for *every* SHA, including the wrong one.

**(b) `entry` runs to the end of the file.** `lock.slice(lock.indexOf(…))` is not the UI's
lock entry; it is everything from the first mention of `swift-struck-ui` to EOF. This is the
campaign brief's "matches past the end of what it thinks it is reading", in the check written
to close a fault that campaign found.

Proven, in the sandbox, against `web/test/fork.test.ts`:

| # | Sabotage | Result |
|---|---|---|
| O1 | Lockfile set to `"version": "0.4.0"` + `#deadbeef…` (40 hex) — **the exact R3 CRITICAL** | **PASSED — 4/4** |
| O2 | Lockfile pin dropped to a branch ref, `#main`, no SHA at all | **PASSED — 4/4** |

O1 is the regression this check exists to catch, reintroduced verbatim, sailing through. Why
it matters: the lockfile is now correct *and unguarded*, so the next `npm install` that
rewrites it can silently reintroduce a non-compiling clone, and R26 will stay green — which
is exactly the state R3 found and reported as CRITICAL.

**Fix:** parse the lockfile as JSON and assert on the one entry, not on a string slice:

```ts
const pkg = JSON.parse(lock).packages["node_modules/@swift-struck/ui"]
expect(pkg?.version, "…").toBe(tag.replace(/^v/, ""))
```

That compares the resolved version against the pinned tag and has no escape hatch. If a SHA
is genuinely wanted as well, pin the expected SHA as a literal and assert equality — an
assertion that any SHA satisfies is not an assertion.

### H2 · HIGH — `vault-claims-match-reality` is also still unable to fail, for the second round running
`web/test/rules.test.ts:930-937`

The documents are now correct — I read all three:

- `SECRETS.md:22` — "**It does NOT exist yet** — `npm run vault:save` creates it"
- `OPERATIONS.md:341` — "`secrets.vault`, encrypted, **not yet created**"
- `INVENTORY.md:75` — "**It has not been run yet.**"

R3's HIGH is fixed *in the documents*. The check that is supposed to keep them honest is not.
It runs (verbose reporter: `✓ vault-claims-match-reality … 3ms`) and it still cannot fail:

```ts
if (!/secrets\.vault/.test(line)) continue
const claimsItExists =
  /\bcommitted\b/i.test(line) ||
  /`secrets\.vault` is\b/i.test(line) ||
  /\b(is sealed|lives in the repo|already (?:in|exists))\b/i.test(line)
```

| # | Sabotage | Result |
|---|---|---|
| V1 | Appended to SECRETS.md: *"The encrypted vault is committed to the repo like anything else."* | **PASSED — 29/29** |
| V2 | Appended to INVENTORY.md: *"`secrets.vault` holds every credential."* | **PASSED — 29/29** |

V1 escapes on the **line-level `secrets.vault` guard**: a sentence that says "the vault" in
prose without the filename is skipped entirely, which is how a human writes it. V2 escapes on
the phrase list: the check's own comment says it was fixed because "INVENTORY.md uses a bare
present tense", but the regex has no bare-present-tense rule — it has `` `secrets.vault` is ``,
which is one copula and misses `holds`, `contains`, `stores`, `has`, `carries`.

This is the same failure mode twice: a check written *about three specific sentences*, which
now matches those three sentences and nothing else. **Fix:** invert it. Since the vault does
not exist, the safe rule is that no line mentioning the vault may use the present indicative
without a negation on the same line — assert on the presence of a disclaimer
(`/not (yet )?(exist|created|been run)|does NOT/i`) in any paragraph that mentions it, rather
than enumerating the ways someone might lie.

### M1 · MEDIUM — the lockfile resolves over `git+ssh://`, which a credential-free stranger may not be able to use
`package-lock.json` — `"resolved": "git+ssh://git@github.com/alaap-swift-struck/swift-struck-ui.git#…"`

Both repositories are public (anonymous `api.github.com` → HTTP 200 for `brimba` and
`swift-struck-ui`), so the *content* is reachable by anyone. But the lockfile directs npm to
fetch the dependency over SSH, which needs a key registered with GitHub. My install
succeeded, and I could not isolate it from this machine's existing git credentials, so
**I am marking the stranger case unmeasured rather than claiming it fails.** Why it matters:
this is the exact class of fault H1 was written for — an install that works for the author
and not for the stranger — and it is one `GIT_SSH_COMMAND` away from being the same story.
**Fix:** re-run the drill in a credential-free environment; if it fails, rewrite the resolved
URL to `git+https://` and pin it in the lockfile.

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| H1 — parse the lockfile as JSON, assert the one entry's version | `web/test/fork.test.ts` (~6 lines changed, net −1) | REMOVES two escape hatches; ADDS a JSON.parse | **none — it is smaller than what it replaces and touches no runtime code.** It is a strict improvement for **base_fork_review** (R26 is that review's spine) |
| H2 — invert the vault check to require a disclaimer | `web/test/rules.test.ts` (~8 lines changed) | REMOVES a phrase enumeration; ADDS a paragraph-level disclaimer rule | **story_checks_out** — an inverted check will flag prose it currently ignores, so SECRETS/OPERATIONS/INVENTORY may need one clause each. That is the check working, but it is churn in that review's subject matter. Also **lean_mean**, marginally |
| M1 — re-run the drill credential-free; rewrite to `git+https` if it fails | `package-lock.json` (1 URL) | REMOVES an SSH dependency from the install path | **none — it changes how the same bytes are fetched.** Note it must be done with `npm install`, not by hand-editing, or the lockfile integrity hash drifts |
| Seal the vault (`npm run vault:save`) | `secrets.vault` (new), `SECRETS.md`, `OPERATIONS.md`, `INVENTORY.md` wording | ADDS the artefact standing between a lost laptop and lost credentials | **OWNER-ONLY — not proposed as an agent fix.** It requires a passphrase, which is the owner's alone. I did not ask for one and did not attempt it. **security_sentry** C7 would need to re-verify that the sealed file's key material is absent from the repo |

## CEILING

**95 is reachable, but only just, and criterion 10 is the wall.**

Current 93.99. Fixing H1 and H2 moves nothing — they are check-quality findings, and
criteria 3, 4 and 12 already score on the *measured* outcome, which passes. The available
headroom is:

| Criterion | Now | Realistic max | Blocked by |
|---|---|---|---|
| 10 · Bus factor | 60 | **60** | **Single author. Not fixable by a commit.** The Avelino degree-of-authorship is one person on essentially every file; a second contributor is a hiring decision, not a change |
| 1 · Remote current | 80 | 90 | One remote, no mirror. A second remote is cheap and would move this; "current" is already perfect |
| 3 · Clone to running | 98 | 100 | M1 — prove the credential-free install |
| 8 · Code explains itself | 97 | 100 | Diminishing; already excellent |

Best case with a mirror added, M1 proven and criteria 8/9 polished:
`14×90 + 9×100 + 11×100 + 8×95 + 8×100 + 12×100 + 9×100 + 8×100 + 5×97 + 5×60 + 5×100 + 6×100`
= 1260+900+1100+760+800+1200+900+800+485+300+500+600 = **9605 → 96**.

So **95 is reachable**, but every remaining point outside criterion 10 is worth ≤2, and
criterion 10 alone withholds 200 weighted points (2 full score points) permanently. **True
maximum ≈ 96 while the project has one author.** The 94 is honest and the documentation is
genuinely the strongest thing in this repository — the two HIGHs above are about *checks*,
not about whether a stranger could rebuild it. A stranger could. I just did the first three
steps of it.
