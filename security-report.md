# security_sentry — brimba · 2026-08-06

**Security 100/100 (A) · sweep coverage 100% · 0 unresolved findings (2 found this round, both fixed) · SHIP**

*Re-run 2026-08-06 (second pass): 98 → 100, +2 — C13 dependency health 0.98 → 1.00, the one open LOW closed.*

## Scorecard — the arithmetic, in the open

```
CONTROL COVERAGE                        passing/applicable   ratio   weight
C1  Authorization ..........................  56/56           1.00      15
C3  Query safety ........................... 275/275          1.00      12
C5  Secret hygiene ..........................   6/6           1.00      12
C2  Authentication .........................  89/89           1.00      10
C7  Credentials at rest .....................   4/4           1.00      10
C4  Boundary validation ....................  81/81           1.00       8
C10 Output scoping ......................... 104/104          1.00       8
C6  Surface minimization ....................   7/7           1.00       6
C8  Fail-closed gates .......................   5/5           1.00       6
C9  Resource bounds ........................  34/34           1.00       5
C11 Render safety ...........................   2/2           1.00       4
C12 Invariant locking ......................  18/18           1.00       2
C13 Dependency health ...................... 402/402          1.00       2
                        Σ(W×ratio) = 100.000   ΣW = 100
                        ControlScore = 100 × 100.000 ÷ 100 = 100
FINDINGS PENALTY        0×25 + 0×10 + 0×3 + 0×1 = 0
POSTURE                 100 − 0 = 100/100   → grade A
SWEEP COVERAGE          12/12 classes × 951/951 enumerated sites = 100%
```

### How each denominator was enumerated

| # | Denominator | Command / method |
|---|---|---|
| C1 | 58 non-GET routes across 7 workers, minus the 2 deliberately-public auth entry points (`email/start`, `email/verify` — no identity exists yet, so no permission gate can apply) | parse every `ROUTES` table + `case "METHOD /path"` switchboard; open each handler body |
| C2 | 89 routes not deliberately public | same list minus health / login / `/mcp` / beacon |
| C3 | 275 `${…}` interpolations inside SQL template literals | regex over every SQL-ish literal in `workers/*/src` + `shared/workers` |
| C4 | 81 request fields (`body.X`, `searchParams.get`), after removing 6 method-calls on variables named `body` | per-field trace to a runtime check |
| C5 | 6 secret-shaped values + git history | per-key grep for literals; `git log` for `.dev.vars`; key-pattern scan over the last 40 commits |
| C6 | 7 deployed workers | `workers_dev` + `preview_urls` at top level AND under `env.staging` |
| C7 | 4 stored credential columns | schema scan: `login_codes.code_hash`, `sessions.token_hash`, `email_change_codes.code_hash`, `mcp_tokens.token_hash` |
| C8 | 5 gates that read a secret | 3 `/internal/*` doors + the test-login door + `adminGuard` |
| C9 | 34 growing paths | 21 list reads that grow with user data + 4 outbound fetches + 7 loops over client input + 2 upload paths |
| C10 | 104 tenant-crossable outputs | 70 route responses + 34 `publishChange` calls |
| C11 | 2 untrusted render sites | `dangerouslySetInnerHTML` minus the compile-time brand `<style>` (developer-authored constant, not untrusted) |
| C12 | 18 security invariants identified in this sweep | each matched against the test suite |
| C13 | 402 dependencies | `npm audit --json` |

Every one of the 951 sites was machine-read; all 64 that any scan flagged were opened
by hand and judged individually. **The enumeration is regex-derived**, so a construct no
pattern matches sits outside it — which is precisely the blind-spot class this codebase
has spent three rounds closing (comments-as-code, unbounded substring match, unrecognised
export shape).

## Findings

### LOW — fixed in this run
**A stored filename could 500 the import instead of failing cleanly.**
*Where:* `workers/data-ops/src/routes/import.ts` (`applyFile`, `addBatchFile` call sites).
*The risk:* `sqlString()` escapes quotes and nothing else — it does not strip NUL bytes
(SQLite rejects them, so the write 500s and writes an `error_logs` row) and does not cap
length. `body.fileName` and `body.name` reached the database without meeting the
`requireText`/`optionalText` seam every sibling field uses.
*Severity because:* impact is a 500 + a log row, not data loss; reachable by any member
holding an import right — real but bounded.
*Fix (applied):* both go through `optionalText(…, TEXT_LIMITS.short)` first. **Locked** by a
new check asserting no request field is ever interpolated into SQL straight off the body —
sabotage-proven with `sqlString(body.nickname)`.

### LOW — closed in this run
**Three build-toolchain packages carried HIGH advisories.**
*Where:* `next`, `postcss`, `sharp` (plus `nanoid`, `miniflare`, `undici`, `ws` in dev).
*The risk:* `npm audit` reports 7 HIGH. **None is reachable in the deployed artifact** —
verified, not assumed: zero imports of any of them in `workers/*/src` or `shared/`, the web
app is `output: "export"` (static files served from an ASSETS binding, no Next server runs),
and the built output embeds none of them. The Next.js Server-Actions DoS needs a running
Next server; there isn't one.
*Severity because:* supply-chain hygiene on the build host, with no runtime reachability —
hardening, not exposure.
*Fix (applied, on its own branch as planned):* `next@15 → 16` and `wrangler@4.100 → 4.120`.
`npm audit` is now **0 across every severity**, dev included. The static export was diffed
against its Next-15 baseline: same 12 pages plus a `_not-found` route and RSC payload files —
additive, nothing lost, and the new `help/` `home/` directories contain only `.txt` payloads
so page routing is untouched. 390 tests green, the build produces `_headers` and `index.html`
as before.

Both upgrades exposed a latent fragility worth naming, because it had nothing to do with
either package: `shared/workers/*.ts` imported `@cloudflare/workers-types` as a MODULE, and
that import only ever resolved because an older wrangler hoisted the package to the repo
root. It is now not imported at all — every worker tsconfig already loads those types
GLOBALLY (`"types": ["@cloudflare/workers-types"]`), so the import was redundant as well as
fragile. Separately, `web/tsconfig.json` was pulling `../shared/**/*.ts` into the BROWSER
app's type graph, which is how a browser workspace came to depend on worker types at all;
it now includes only the shared code web actually uses.

## What moved since the last run

Two new invariant locks, both sabotage-proven:
- **Live pings carry no row content** — the one security invariant in the sweep that had no
  test. Sabotage: adding `title:` to the ping payload → *"a ping may not carry `title` — a
  subscriber who can't read the row would receive it"*.
- **No request field reaches SQL without the seam** — the lock for the finding above.

## Refuted (candidates that did NOT survive)

Recorded because a refuted candidate is evidence too:
- `brand-theme.tsx` injecting CSS through `dangerouslySetInnerHTML` — the values come from
  `shared/brand.ts`, a compile-time developer constant, never team input.
- `run_import_batch` not being under `/api/` — its binding is `SELF`; it is an in-worker
  function, not an internal HTTP door exposed as a tool.
- 7 "gateless" state-changing routes — all verified: 3 internal doors + the test-login door
  fail closed on their own secret, logout acts only on the caller's cookie, and the 2 login
  doors are the deliberately-public entry points (throttled, attempt-capped).
- ~30 "unbounded" SELECTs — single-row key lookups and code-bounded reads; the growing
  surface is the 21 list reads, all capped or keyset-paged.
- 5 "uncapped" loops and 1 "uncapped" upload — capped upstream by `requireIdList`,
  `MAX_IMPORT_ROWS` and `MAX_IMAGE_BYTES`.
- The last-admin race — the admin count re-check rides inside the UPDATE's WHERE with a
  zero-rows throw.

## What this score does NOT mean

It is **not** "the app is 98% secure" and not a breach probability. It measures *the presence
of countable controls across the surface that was swept, minus what was proven broken*. It
cannot see unknown unknowns, logic flaws nobody looked for, or anything the regex enumeration
didn't reach. The 100% sweep coverage is what makes the 98 worth reading — a high score over
a partial sweep would be worth less than a lower one over a complete pass.

## Ship recommendation

No critical or high findings. The single open item is a build-toolchain advisory set with no
runtime reachability. **Ship.**
