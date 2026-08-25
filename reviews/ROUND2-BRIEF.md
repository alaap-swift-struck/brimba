# Round 2 — re-measure. Read this AND `CAMPAIGN-BRIEF.md`.

Every rule in `CAMPAIGN-BRIEF.md` still applies: **read-only**, follow your skill,
show the arithmetic, never tune a count, assume your own probe is wrong.

You are re-scoring after a repair pass. Two things are being tested at once:

1. **Did your own score move?**
2. **Did somebody else's fix break YOUR criteria?** This is the point of the round.
   The owner's requirement, in their words: *"if one scores above 95, it doesn't
   really screw around with the other score."* **Any criterion that went DOWN is a
   finding, and must be reported even if your total went up.**

## Write to `reviews/<slug>-r2.md`

Same shape as round 1, plus a section at the top:

```
## DELTA
Round 1: <n>/100 → Round 2: <n>/100

| Criterion | R1 | R2 | Why it moved |
Every criterion, including the unchanged ones. A criterion that FELL gets a full
finding below, and names which repair caused it.
```

## What changed since round 1

Commits `73a60a4`, `e6676c5`, `3cd3e14`, `138c3e4`, `5e35efe`, `fe7d683` on branch
`review-campaign`. `npm run check` is green.

**A new shared module: `shared/test/source.ts`** — one correct source reader
(`stripComments`, `declarationBody`, `namedBody`, `catchBodies`, `serverSources`,
`workerSources`, `stringLiterals`, `componentFiles`), with its own tests in
`web/test/source.test.ts`. Eight rule checks were found blind or half-blind; they
now share this. **`stripComments` itself was broken** — it ran the block pass first,
so a slash-star inside a LINE comment opened a comment that was never opened and
ate real code. Fifteen files carry that pattern, three of them worker entry points.
Every Law check in this repo had been reading less than it believed.

**Correctness fixes**

- the nightly orphan sweep deleted referenced attachments above its cap — now
  keyset-paged and fail-closed
- all five `one*` readers read ONE row instead of the whole capped list; past the
  cap they returned null and the client dropped the record from the screen
- a learning edit that omitted `sequence`/`required` wrote 0/false over real values
- a deep link to a ticket past page one said it did not exist
- the help conversation is live; its `DEAF_EXEMPT` reason was false and is gone
- `addReply` now writes an activity row (it is an agent AND MCP tool)
- the activity feed SELECTs `origin` and `verb`; `SYSTEM_ACTOR` carries `origin: "job"`;
  the three unwritten verbs are written
- imports go through `forwardToDoor`: bounded, traced, and stamped `origin: "import"`
- the gateway and realtime record crashes centrally
- the root error boundary is mounted (it was imported and never rendered)
- ticket mentions are capped through `optionalIdList`

**Security**

- privilege amplification closed: you may not grant a right you do not hold
- `postScreen` gates on `screens:edit`, not `teams:edit`
- auth has R10 coverage for the first time (ten state-changing doors, none checked)
- the three weaker duplicate R10 blocks inside `publish-seam.test.ts` are gone

**Docs**

- five documents stated five different law ranges; all now R1–R25, and
  `registry-integrity` reads every root document instead of one
- `BOOTSTRAP.md` now stands up the OPERATIONS database and its migration counts
  are derived from disk by a check
- `MCP.md`'s exclusion table was false about three live tools; corrected and now
  machine-checked against `MCP_TOOLS`

**Deliberately NOT done, by reconciliation — do not re-file these as new findings**

- the 69-line merged-shard read chain stays: `lean_mean` called it dead,
  `SCALING.md` names it a relief valve, scaling wins
- `AgentView` stays: unreferenced, but its comment says the panel never mounts one
  until the feature lands. Deleting a planned capability is the owner's call
- `ctx.waitUntil` on `publishChange` NOT applied: it would keep R1's check green
  while changing what the code does
- caching the R16 count NOT applied: it breaks the law
- the secrets vault: the owner must seal it; it needs a passphrase I must not handle
