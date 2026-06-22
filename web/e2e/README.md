# Web e2e (Playwright)

End-to-end tests that drive the **real, deployed app** in a browser. They are
**not** part of `npm run check` and Playwright is intentionally **not installed**
in this repo (no browser binaries in CI). Run them locally, on demand.

## What the spec covers

`team-flows.spec.ts` — one happy path:

1. **Sign in** with the dev-code login (the auth worker echoes the 6-digit code
   in the `/api/auth/email/start` response when `DEV_ECHO_CODES=1`, which staging
   runs with — see `workers/auth/src/index.ts`).
2. Land on **/home**, then open the team at **/t/&lt;id&gt;**.
3. Open the **members** list → open a **member**.
4. **Change their role** and assert the detail updates with **no full-page
   reload** — a `window.__E2E_NO_RELOAD__` sentinel is set after sign-in and must
   survive every navigation (the in-app router uses `History.pushState`; a hard
   reload would wipe it).
5. Open **invites**, **send an invite**, and assert it appears.

## Run it locally

```bash
# from the repo root
npm install -D --workspace=brimba-web @playwright/test
npx --workspace=brimba-web playwright install chromium

# against staging (default)
npm run test:e2e --workspace=brimba-web

# against another environment
BASE_URL=http://localhost:3000 npm run test:e2e --workspace=brimba-web
```

`BASE_URL` defaults to the staging URL
(`https://brimba-staging.swift-struck.workers.dev`, see `OPERATIONS.md`).

## Notes / TODOs

- **Dev code retrieval** is done by reading `devCode` from the `email/start`
  response body. If `DEV_ECHO_CODES` is turned **off** on the target environment
  (production behaviour), the body won't contain it — supply the code out of band
  (mailbox API or a fixed test code) and feed it to `fillCode()`. This is flagged
  with a `TODO` in `signIn()`.
- The flow needs a **teamful** test account. A brand-new account lands on
  `/onboarding` with no team, so the test `skip`s itself there. Seed a test
  account that already belongs to a team (or extend the spec to complete
  onboarding + create a team) to exercise the full path.
- Selectors mirror the shipped DOM as of 2026-06-22 (auth-card, code-input,
  role-picker-dialog, invite-dialog). If those components change, update the
  locators in the spec.
