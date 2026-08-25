# CONTRIBUTING — making your first change to Brimba

This is a base other products are built on, so a change here ripples into every
one of them. That is the only reason this file is longer than "open a PR".

**Maintainer:** Swift Struck — alaap@swiftstruck.com

## Before you write anything

Read [CLAUDE.md](CLAUDE.md). It is short, it is the entry point for anyone —
human or agent — and it carries the two prime directives: **stay lean**, and
**obey the Laws of the Base**. Then read the seven-question planning ritual in
the same file and actually answer them. It exists because the failure mode here
is not bad code, it is correct code that quietly breaks an unstated invariant.

If you are adding a module, [BUILD-A-MODULE.md](BUILD-A-MODULE.md) is the
end-to-end checklist. If you are changing something foundational,
[BASE-MANUAL.md](BASE-MANUAL.md) explains how a change ripples.

## Your first change, start to finish

```bash
git clone https://github.com/alaap-swift-struck/brimba.git
cd brimba && npm install
npm run check                    # the full suite, ~13s — this must be green BEFORE you start
git checkout -b your-branch      # never commit to main
# ... make the change ...
npm run check                    # and green again after
```

`npm run check` is the gate: TypeScript across all eight workspaces plus the full
test suite. Green looks like eight suites passing and no compiler output.

Do **not** use `npx tsc --noEmit` alone — there is no root `tsconfig.json`, so it
checks nothing and exits 0.

## The rules that will bite you

The [Laws of the Base](RULES.md) are machine-checked, not aspirational. Break one
and the build goes red with a message naming the file. The ones newcomers hit
most:

- **Every mutation publishes a live change** (R1) and **opens with a permission
  gate** (R10). A non-GET route missing either fails a seam test.
- **A create returns the created row; an edit returns the affected row** (R21,
  R23) — never the collection.
- **Every list read is capped**, and a collection that GROWS must page (R14).
- **Input is validated at runtime** at the boundary (`shared/workers/validate.ts`).
  A TypeScript type is erased at runtime; it is not validation.

If you add a Law, it needs a row in `RULES.md`, an entry in
`shared/rules/registry.ts`, **and** a check — the `registry-integrity` test fails
if any of the three is missing.

## Writing a check: sabotage it

A check that has never been seen to fail is not a check. After you write one:
break the thing it guards, watch the suite go red naming the right file, then
restore **from a copy — never `git checkout`**, which silently reverts to the
last commit and can hide the fact that your check was never running.

Two failures from this project's own history, both of which stayed green:

- A sabotage that inserted nothing at all, because the script grabbed the wrong
  bracket. It looked exactly like a passing check.
- A test whose fixture was an endless stream: with the guard working it threw
  immediately, and with the guard **broken** it looped for ever instead of
  failing. Bound whatever you sabotage against.

## What is not yours to change

- **Locked decisions** in [ARCHITECTURE.md](ARCHITECTURE.md). Raise them; do not
  move them.
- **The UI library.** Primitives come from `@swift-struck/ui`, a separate
  repository. If a primitive needs changing, say so — never fork it into this
  host.

## Style

Comments say **why**, and ideally name the failure that earned the rule. Product
words come from `shared/glossary.ts` and nowhere else. Voice is warm and plain,
written for a 45–55-year-old manager: sentence case, no jargon, no emoji.

Commit subjects describe the change and its reason, and end with the
`Co-Authored-By` line if an agent helped.
