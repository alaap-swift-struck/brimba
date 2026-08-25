# Round 3 — the final re-measure. Read this AND `CAMPAIGN-BRIEF.md`.

Every rule in `CAMPAIGN-BRIEF.md` still applies: **read-only**, follow your skill,
show the arithmetic, never tune a count, assume your own probe is wrong. Prefix
every scratch file with your own initials — agents have read each other's output
in this campaign before.

Two questions, and the second is the point of the round:

1. **Where does your score land now?**
2. **Did somebody else's repair break YOUR criteria?** The owner's requirement, in
   their words: *"if one scores above 95, it doesn't really screw around with the
   other score."* **Any criterion that went DOWN is a finding, even if your total
   went up — and name which repair caused it.**

Write to `reviews/<slug>-r3.md`, opening with a DELTA table: round 1, round 2,
round 3 per criterion, and why each moved.

## What changed since round 2

Branch `review-campaign`, `npm run check` green.

**Owner decisions**
- The screen-override subsystem was **removed**, not finished — table, migration,
  gate, validator, permission row, renderer, client merge, tool and trace. It had
  no caller on any surface. This also removes one network request from every
  screen in the team area, and four permission switches that governed nothing.
- The size alarm is **80%**, the number `ARCHITECTURE.md` always said. The code had
  drifted to 65% and the alarm's own message said 80 while firing at 65.
- `@swift-struck/ui` upgraded **0.9.1 → 0.16.0** — `emptyAction`, per-module
  `rights` on `PermissionMatrix`, a `ConnectionStatus` primitive, and list
  virtualisation that had already shipped in 0.10.0 (the audit measured a pinned
  old version and reported a gap that was already closed).

**Repairs**
- **Prompt caching on.** One `cache_control` marker on the system block covers the
  whole fixed prefix; proved byte-identical across two structurally different
  calls, and logs `prompt_cache_hit`/`_write`/`_miss` so a miss cannot hide.
- **Retention loops** to a short batch under a hard bound, and a bound that is HIT
  writes a real `error_logs` row rather than a console line.
- **A 5xx `GuardError` is now recorded** in all four workers. An auth outage 503s
  every screen and used to leave its evidence in an absence.
- **Account creation is logged.** Every person's history began midway through.
- **Permission columns narrowed** to the rights each module really has — 28 cells,
  22 server-gated, 5 dead removed, `teams.read` KEPT after it was found to gate a
  real screen.
- **A connection dot** in the shell, from the socket's own state.
- **A first-run block on `/home`**, shown only to a solo team with no articles.
- **`optionalIdList` caps mentions at 50** — below D1's 100-bound-parameter ceiling,
  because 101–512 threw inside notify and the reply saved with nobody told.
- **The machine surface got two guards it lacked**: an omitted required boolean now
  refuses instead of meaning "deactivate", and `expectedVersion` is exposed and
  forwarded by all four edit tools.
- **The live re-pull doors** (`?id=`) read one row instead of the whole collection.
- **Law R26 + `scripts/fork.mjs`** — the fork sweep is one command that derives its
  own subject and leaves `npm run check` green.
- **`ROUTE-CENSUS.md`** — 94 routes, 58 state-changing, one deliberately open and
  named. Generated and checked, so the next reviewer inherits the surface.
- **`vault-claims-match-reality`** — while `secrets.vault` does not exist, no
  document may say it does.

**Still NOT done, deliberately — do not re-file as new findings**
- the secrets vault is unsealed; it needs a passphrase only the owner may handle
- `AGENT_FREE_DAILY = 50` stays: the owner called it a business decision
- the 69-line merged-shard read chain stays (scaling beat lean_mean)
- `ctx.waitUntil` on `publishChange` NOT applied — it would keep R1's check green
  while changing what the code does
- caching the R16 count NOT applied — it breaks the law
- `emptyAction` NOT wired: this app composes creates in the host via
  `SectionWithCreate`, not as recipe actions, so pointing an empty state at a
  recipe action id would build a second, duplicate create path
