# Interface-lessness meter — brimba · 2026-08-12
**Scope: whole app.** Meter **98/100** — the interface you reach Brimba through has very nearly stopped mattering.

| Dimension | Score | Why |
|---|---|---|
| Parity (same codebase) | 100 | 20 of 20 tools forward to a real gated route; zero re-implemented twins |
| Security equivalence | 100 | the bridged cookie makes the door re-gate; token re-verified per call; pinned to one team |
| Coverage | 92 | every excluded capability now named with its reason |
| Robustness equivalence | 100 | same doors ⇒ same guards, same idempotency, same deactivate-not-delete |
| Scale equivalence | 100 | same doors ⇒ same R14 caps and paging, plus a result cap on the tool response |
| Ergonomics | 92 | one catalogue feeds the agent AND MCP, machine-checked; cost model documented |

`meter = (100×30 + 100×25 + 92×15 + 100×12 + 100×8 + 92×10) / 100 = 98`

## The parity trace

Every tool goes through **one seam**:

```
tools/call → forwardTool → forwardToDoor(env[binding], { path, method, cookie, idempotencyKey })
                            └─ the SAME internal route the web app posts to
```

- **Same endpoint** — verified mechanically: all 20 tool `path` + `method` pairs match an entry in a worker's `ROUTES` table. Zero MCP-only routes.
- **Same function** — the route resolves to the same handler for both callers; there is no `mcpCreateX` twin anywhere in the tree.
- **Same gate re-checked** — the token is exchanged for a short-lived session pinned to the token's team, and that cookie rides the forward. The door runs `teamContext` → `requireRight` exactly as it does for a browser. **The token authenticates; the gate still authorises.**

That last point is the one this meter exists to catch, and it holds.

## Findings

**Coverage gap — CLOSED this run.** `MCP.md` documented the *principle* ("the catalogue is opt-in; internal endpoints are structurally unreachable") but not the *list*, so a reader could not tell a deliberate omission from an oversight — which the skill treats as a gap by definition. `MCP.md` §5 now itemises all 29 unexposed POST routes with a reason each: owner-only maintenance, identity-sensitive self-actions, membership changes with email side effects, permission granting, binary upload, bulk writes (superseded by `plan_import`), the stateful import session, and screen configuration.

**No divergences. No security-equivalence findings. No robustness or scale gaps.** Nothing was auto-fixed, because nothing needed consolidating.

## The one thing keeping it off 100

Coverage sits at 92 rather than 100 by choice, not by accident: a machine caller may **use** rights but not **grant** them, cannot switch teams, and cannot invite people. Those are deliberate security boundaries. Raising coverage would mean lowering them, so 98 is the ceiling this design should have.
