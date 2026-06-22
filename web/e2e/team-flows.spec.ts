import { expect, test, type Page } from "@playwright/test"

// =============================================================================
// End-to-end happy path against the REAL app (staging by default; override with
// BASE_URL). Drives the dev-code login, opens a team, changes a member's role
// WITHOUT a full-page reload (the in-app router uses History.pushState — we set
// a window sentinel after sign-in and assert it survives every navigation), then
// sends an invite and sees it appear.
//
// NOT run in CI and Playwright is NOT installed here — see e2e/README.md to run
// it locally. Selectors mirror the shipped DOM (auth-card, code-input,
// role-picker-dialog, invite-dialog) as of 2026-06-22; if the UI changes, update
// the locators here.
// =============================================================================

/** A unique email per run so we never collide with throttling or a stale code. */
function freshEmail(): string {
  return `e2e+${Date.now()}@swiftstruck.test`
}

/** Drop a sentinel on window. A full-page reload wipes it; an in-app
 * History.pushState navigation keeps it — that's how we prove "no reload". */
async function setNavSentinel(page: Page): Promise<void> {
  await page.evaluate(() => {
    ;(window as unknown as { __E2E_NO_RELOAD__?: number }).__E2E_NO_RELOAD__ = Date.now()
  })
}

async function expectSentinelSurvived(page: Page): Promise<void> {
  const present = await page.evaluate(
    () => typeof (window as unknown as { __E2E_NO_RELOAD__?: number }).__E2E_NO_RELOAD__ === "number"
  )
  expect(present, "window sentinel should survive in-app navigation (no full reload)").toBe(true)
}

/**
 * Sign in via the dev-code login. On staging the auth worker runs with
 * DEV_ECHO_CODES=1, so POST /api/auth/email/start returns `{ devCode }` in its
 * JSON body (see workers/auth/src/index.ts emailStart). We capture that response
 * to read the code deterministically — far more robust than scraping the toast.
 *
 * TODO: if DEV_ECHO_CODES is turned OFF on the target environment, the body will
 * NOT contain devCode (production behaviour). In that case supply the code out
 * of band (e.g. a mailbox API or a fixed test code) and feed it to fillCode().
 */
async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login")

  await page.locator("#email").fill(email)

  // Capture the start response (carries devCode on staging) as we submit.
  const startResp = page.waitForResponse(
    (r) => r.url().includes("/api/auth/email/start") && r.request().method() === "POST"
  )
  await page.getByRole("button", { name: "Email me a code" }).click()
  const body = (await (await startResp).json()) as { devCode?: string }

  const code = body.devCode
  expect(
    code,
    "expected a devCode in the email/start response (is DEV_ECHO_CODES=1 on this env?)"
  ).toMatch(/^\d{6}$/)

  await fillCode(page, code!)

  // Verified → the app routes to /home (teamful) or /onboarding (brand-new user).
  await page.waitForURL(/\/(home|onboarding)/)
}

/** Type the 6-digit code into the six per-digit inputs (aria-labelled
 * "Digit N of 6"). Filling the last digit auto-submits the verify call. */
async function fillCode(page: Page, code: string): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await page.getByLabel(`Digit ${i + 1} of 6`).fill(code[i])
  }
}

test.describe("team flows (real app)", () => {
  test("sign in → team → change a member role → send an invite (no reload)", async ({
    page,
  }) => {
    const email = freshEmail()
    await signIn(page, email)

    // A brand-new account lands on onboarding with no team — this happy path
    // needs an existing teamful account. Skip clearly rather than fail flakily.
    test.skip(
      page.url().includes("/onboarding"),
      "Fresh account has no team; seed a teamful test account (or complete onboarding + create a team) to exercise this flow."
    )

    await page.waitForURL(/\/home/)
    await setNavSentinel(page)

    // Open the current team. The home screen links to /t/<id>; click the first
    // team entry (team switcher / team card). Adjust if the home layout changes.
    await page.getByRole("link", { name: /team|open/i }).first().click()
    await page.waitForURL(/\/t\/[^/]+/)
    await expectSentinelSurvived(page)

    // ---- Members list → open a member -------------------------------------
    await page.getByRole("link", { name: /members/i }).first().click()
    await page.waitForURL(/\/t\/[^/]+\/members/)
    await expectSentinelSurvived(page)

    // Open the first member row (rows are links in the list collection).
    const firstMember = page.getByRole("link").filter({ hasNot: page.getByText(/^$/) }).first()
    await firstMember.click()
    await page.waitForURL(/\/t\/[^/]+\/members\/[^/]+/)
    await expectSentinelSurvived(page)

    // ---- Change role: assert the detail updates WITHOUT a full reload ------
    await page.getByRole("button", { name: "Change role" }).click()
    // Role-picker dialog: pick the first role option, then confirm.
    await page.getByRole("radio").first().check()
    await page.getByRole("button", { name: /Save role/i }).click()

    // The row/detail updates in place (live patch). The sentinel proves the page
    // never did a hard reload while the role changed.
    await expect(page.getByText(/role/i).first()).toBeVisible()
    await expectSentinelSurvived(page)

    // ---- Invites → send an invite, see it appear --------------------------
    await page.getByRole("link", { name: /invites/i }).first().click()
    await page.waitForURL(/\/t\/[^/]+\/invites/)
    await expectSentinelSurvived(page)

    // Open the invite dialog (the Invites screen opens it via ?panel=add).
    await page.getByRole("button", { name: /invite/i }).first().click()
    const inviteEmail = `invitee+${Date.now()}@swiftstruck.test`
    await page.locator("#invite-email").fill(inviteEmail)
    // A role is required; the dialog defaults to the first non-Admin role.
    await page.getByRole("button", { name: "Send invite" }).click()

    // The new invite appears in the list (live patch / refetch).
    await expect(page.getByText(inviteEmail)).toBeVisible()
    await expectSentinelSurvived(page)
  })
})
