# Security sentry — brimba · 2026-08-12

**Security 99/100 (A) · sweep coverage 100% · 1 finding (0 critical, 0 high, 0 medium, 1 low) · ship.**

Previous run: 100/100 with 2 LOWs. This run: 99 with 1 LOW. The number moved because the code moved — three scaling rounds added an operations database, an idempotency store, two rate ceilings and a streaming upload path. All were swept; one new hardening item surfaced and the two older LOWs are closed.

```
CONTROL COVERAGE                        passing/applicable   ratio   weight
C1  Authorization ........................... 45/45          1.00      15
C3  Query safety .......................... 281/281          1.00      12
C5  Secret hygiene .......................... 12/12          1.00      12
C2  Authentication .......................... 45/45          1.00      10
C7  Credentials at rest ....................... 4/4          1.00      10
C4  Boundary validation ..................... 51/51          1.00       8
C10 Output scoping ......................... 22/22          1.00       8
C6  Surface minimization ...................... 7/7          1.00       6
C8  Fail-closed gates ....................... 11/11          1.00       6
C9  Resource bounds ......................... 26/26          1.00       5
C11 Render safety ............................ 3/3           1.00       4
C12 Invariant locking ...................... 64/64          1.00       2
C13 Dependency health ........................ 1/1          1.00       2
                        ControlScore = 100 × 100.00 ÷ 100 = 100
FINDINGS PENALTY        0×25 + 0×10 + 0×3 + 1×1 = 1
POSTURE                 100 − 1 = 99/100  → grade A
SWEEP COVERAGE          12/12 classes × 45/45 state-changing routes = 100%
```

## The one finding

### LOW — every signed-out caller shares one retry-key identity

**Where:** `shared/workers/concurrency.ts:ownerOf`

**The risk.** A retry key is bound to its claimer by `SHA-256(Cookie header)`. An unauthenticated request has no cookie, so every signed-out caller hashes to the *same* owner. In principle, caller A could replay caller B's stored response for the same route.

**Why it is LOW and not higher.** It is currently unreachable. Every route the idempotency seam wraps is a `mutation` in a ROUTES table, and every one of those gates — so an unauthenticated call throws before doing any work, and the seam *deletes the claim* on throw. There is never a stored body for a signed-out caller to replay. The weakness is one gate-removal away from mattering, not exploitable today.

**Fix.** Include the caller's IP in the digest when no session cookie is present: `SHA-256(cookie || "ip:" + CF-Connecting-IP)`. One line, no behaviour change for signed-in callers.

## Closed since the last run

- **`/media/*` predictable keys with no auth** — objects are now addressed by ULID under a per-team prefix, and the orphan sweep confirmed no cross-prefix reach.
- **Invite to a deactivated role** — reviewed and kept as today's behaviour by the owner.

## What was verified and refuted

Refuted candidates cost nothing, but the reasoning is the evidence:

- **39 SQL interpolations flagged as "not obviously safe"** — every one read individually. The activity feed's WHERE clauses are literal fragments with `?` placeholders and all values in `params`; the keyset cursor is base64, shape-validated, throws a clean 400 on garbage, and is `?`-bound; `bit()` emits 0 or 1; `versionPredicate` goes through `sqlString`. No injection.
- **Idempotency replay across callers** — the seam compares `owner` AND `route` before returning anything, and refuses with 409 on either mismatch.
- **The orphan sweep deleting the wrong team's files** — the R2 prefix is `${team.id}/` and the reference set is read from that same team's database. It cannot reach across a prefix.
- **The cross-team error read** — `SELECT … FROM error_logs` with no team filter is the owner dashboard behind `adminGuard`, cross-team by design and documented in ERROR-HANDLING.md.

## What this score does NOT mean

It is not "the app is 99% secure" and it is not a breach probability. It measures the presence of countable controls across the surface that was swept, minus what was proven broken. It cannot see unknown unknowns or logic flaws nobody looked for. The 100% sweep coverage beside it is what makes it worth reading at all.

**Ship.** No critical, no high.
