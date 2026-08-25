import { expect, test, type BrowserContext, type Page } from "@playwright/test"

// =============================================================================
// THE TWO-BROWSER TEST — the one nothing in this repo has ever done.
//
// `workers/realtime/test/realtime.test.ts` says the Durable Object "is exercised
// live by the staging smoke". It is not: the smoke GETs /api/realtime/health,
// which proves the worker is up and nothing else. No test anywhere has opened a
// real socket, so the whole live layer — the DO fan-out, the client's row-level
// patch, the reconnect catch-up — has only ever been verified by hand.
//
// This spec opens TWO independent browser contexts against the REAL app and
// asserts the two things that matter:
//
//   Case A — DELIVERY.  A edits a record; B, already looking at it, sees the new
//            value with no reload. (The sentinel proves no reload.)
//   Case B — CATCH-UP.  B's link is severed, A changes the record while B is
//            down, then B reconnects. B must converge on the truth. This is the
//            case that matters most and the one nothing covered — a socket that
//            delivers while connected but comes back deaf is indistinguishable
//            from a working one until someone acts on a stale number.
//
// WHAT CASE B ACTUALLY PROVES, and how it refuses to pass by accident: it
// asserts the connection indicator LEAVES "live" (B really was cut off) and that
// B still shows the OLD title while disconnected (B really did miss the change).
// Without those two, a Case B where the socket never dropped is just Case A
// again, green and worthless.
//
// TWO SESSIONS, NOT TWO IDENTITIES. Both contexts hold the SAME freshly-minted
// scratch account — two devices, two sockets, two caches, one team channel. That
// exercises the whole live path (DO fan-out to a second socket, that socket's
// own patch + catch-up); what it does NOT cover is a second PERSON, which would
// need an invite round-trip to seed. Said plainly here rather than implied.
//
// SAFETY: staging only (production is refused outright, below), and the account
// is a fresh `e2e+<timestamp>@swiftstruck.test` that signs in through the ADMIN
// test-login door and creates its OWN team — so this never touches, reads or
// writes a real user's data. Same scratch pattern as team-flows.spec.ts.
//
// NOT run in CI and not part of `npm run check` — see e2e/README.md to run it.
// =============================================================================

const PRODUCTION = "brimba.swift-struck.workers.dev"
const BASE_URL = process.env.BASE_URL ?? "https://brimba-staging.swift-struck.workers.dev"

/** A unique email per run so we never collide with throttling or a stale code. */
function freshEmail(): string {
  return `e2e+live${Date.now()}@swiftstruck.test`
}

/** Drop a sentinel on window. A full-page reload wipes it; an in-app
 * History.pushState navigation — or a live socket patch — keeps it. That is how
 * "B saw the change WITHOUT reloading" is a fact rather than a hope. */
async function setNavSentinel(page: Page): Promise<void> {
  await page.evaluate(() => {
    ;(window as unknown as { __E2E_NO_RELOAD__?: number }).__E2E_NO_RELOAD__ = Date.now()
  })
}

async function expectSentinelSurvived(page: Page, why: string): Promise<void> {
  const present = await page.evaluate(
    () => typeof (window as unknown as { __E2E_NO_RELOAD__?: number }).__E2E_NO_RELOAD__ === "number"
  )
  expect(present, why).toBe(true)
}

/**
 * Sign in via the ADMIN TEST-LOGIN door — the SAME door team-flows.spec.ts
 * names, deliberately not a second mechanism. Login codes are never echoed
 * anywhere, in any environment; automated runs mint one through
 * POST /api/auth/admin/test-login with the x-admin-key header (a staging-only
 * secret; the door fails closed where it is unset and refuses outright when the
 * worker's ENVIRONMENT is production). Export TEST_LOGIN_KEY before running.
 *
 * ONE MINT, NOT TWO — this is the trap that makes the older spec's version
 * unrunnable, and it is worth spelling out. Both doors mint through
 * `mintLoginCode`, which refuses a second code for the same address while an
 * unconsumed one is less than RESEND_COOLDOWN_SECONDS (60) old. So clicking the
 * page's own "Email me a code" and THEN minting an admin code returns
 * `429 too_soon` with no `code` field, every time, on a brand-new address. The
 * order cannot simply be swapped either: the card only reveals its digit inputs
 * after ITS send succeeds, and that send is now the one that gets refused.
 *
 * So: mint once, and hand the code to the same `/api/auth/email/verify` door the
 * card itself calls. `page.request` shares the context's cookie jar, so the
 * session lands in this browser exactly as it would have from typing.
 */
async function signIn(page: Page, email: string, adminKey: string): Promise<void> {
  await page.goto("/login") // establish the origin so the session cookie belongs to it
  const minted = await page.request.post("/api/auth/admin/test-login", {
    headers: { "x-admin-key": adminKey },
    data: { email },
  })
  const body = (await minted.json()) as { code?: string; message?: string }
  expect(
    body.code,
    `test-login should mint a code (is TEST_LOGIN_KEY set on this env's auth worker?) — got: ${JSON.stringify(body)}`
  ).toMatch(/^\d{6}$/)

  const verified = await page.request.post("/api/auth/email/verify", {
    data: { email, code: body.code },
  })
  expect(verified.ok(), `verify should accept the minted code — got ${verified.status()}`).toBe(true)

  await page.goto("/home")
  await page.waitForURL(/\/(home|onboarding)/, { timeout: 60_000 })
}

/** A fresh account lands on /onboarding with no team. Complete it — that CREATES
 * the scratch team this whole spec then works inside, which is why this spec
 * never has to borrow one that belongs to somebody.
 *
 * WAIT FOR THE FORM, NOT THE ADDRESS. The teamless bounce is a CLIENT redirect
 * (`router.replace` inside useActiveTeam), so the URL is still /home for a
 * moment after sign-in — long enough for a `url().includes("/onboarding")` test
 * to read false and skip the whole thing, which then strands every later step on
 * a page that will never have the button it is waiting for. */
async function completeOnboarding(page: Page): Promise<void> {
  const firstName = page.locator("#first-name")
  await expect(
    firstName,
    "a freshly-minted account must land on onboarding — it has no team yet"
  ).toBeVisible({ timeout: 60_000 })
  await firstName.fill("Live")
  await page.locator("#last-name").fill("Sync")
  await page.getByRole("button", { name: "Continue" }).click()
  // Creating the team provisions its own database, so this is the slow step.
  await page.waitForURL(/\/home/, { timeout: 120_000 })
}

/** Record every socket the page opens, so the test can sever them on purpose and
 * — the half that stops a false green — SEE that a new one replaced them. A
 * reconnect nobody counted is indistinguishable from never having dropped. */
const SOCKET_SPY = `
  (() => {
    const spy = { opened: 0, sockets: [] }
    window.__E2E_WS__ = spy
    const Native = window.WebSocket
    function Wrapped(url, protocols) {
      const s = protocols === undefined ? new Native(url) : new Native(url, protocols)
      spy.opened++
      spy.sockets.push(s)
      return s
    }
    Wrapped.prototype = Native.prototype
    Wrapped.CONNECTING = 0; Wrapped.OPEN = 1; Wrapped.CLOSING = 2; Wrapped.CLOSED = 3
    window.WebSocket = Wrapped
  })()
`
type Spy = { opened: number; sockets: WebSocket[] }
const socketsOpened = (page: Page) =>
  page.evaluate(() => (window as unknown as { __E2E_WS__: Spy }).__E2E_WS__.opened)

/** The shell's connection indicator: live · reconnecting · offline. The shell
 * owns both sockets and renders the WORSE of the two, so this is the app's own
 * answer to "is what I am looking at still true?" — the right thing to assert
 * against, rather than the test's private idea of the socket's state. */
const linkState = (page: Page) => page.locator('[role="status"][data-state]').first()

/** The article's title on its detail screen — an <h1>, so this cannot
 * accidentally match a toast, a list row or a breadcrumb carrying the same words. */
const articleTitle = (page: Page, title: string) =>
  page.getByRole("heading", { level: 1, name: title })

/** Open the edit dialog and rename the article. */
async function rename(page: Page, to: string): Promise<void> {
  await page.getByRole("button", { name: "Edit" }).first().click()
  await page.locator("#learning-title").fill(to)
  await page.getByRole("button", { name: "Save changes" }).click()
  // A's OWN screen settling first is what makes the write a fact before we start
  // asking anything of B.
  await expect(articleTitle(page, to)).toBeVisible()
}

test.describe("live sync between two browsers", () => {
  // The config leaves `actionTimeout` at its default of NO timeout, so a click
  // on a locator that will never exist quietly eats the whole test budget and
  // reports "test timeout" from the cleanup line — pointing at everything except
  // the thing that hung. Bound it, so a wrong step names itself.
  test.use({ actionTimeout: 20_000 })

  test("A edits, B sees it — connected, and again after a reconnect", async ({ browser }) => {
    // The whole flow — sign in, onboard, seed an article, two edits and a
    // reconnect with backoff — is well past the config's 60s default.
    test.setTimeout(300_000)

    const adminKey = process.env.TEST_LOGIN_KEY ?? ""
    test.skip(
      adminKey === "",
      "export TEST_LOGIN_KEY — the e2e suite signs in through the staging test-login door. Skipping rather than failing, so an unconfigured machine doesn't turn the gate red."
    )
    // Not a warning, a refusal. This spec creates an account and writes records;
    // it must never be pointed at production, whatever BASE_URL says.
    expect(
      BASE_URL.includes(PRODUCTION) && !BASE_URL.includes("staging"),
      "live-sync.spec.ts writes data — it is staging-only and refuses production"
    ).toBe(false)

    const email = freshEmail()
    const stamp = Date.now()
    const titles = {
      created: `Live sync ${stamp}`,
      connected: `Renamed while connected ${stamp}`,
      offline: `Renamed while B was down ${stamp}`,
    }

    let ctxA: BrowserContext | undefined
    let ctxB: BrowserContext | undefined
    try {
      // ---- A: a brand-new scratch account with its own brand-new team --------
      ctxA = await browser.newContext()
      const pageA = await ctxA.newPage()
      await signIn(pageA, email, adminKey)
      await completeOnboarding(pageA)
      await pageA.waitForURL(/\/home/)

      // ---- A: seed the record both sides will watch -------------------------
      await pageA.goto("/learning")
      await pageA.getByRole("button", { name: "New article" }).first().click()
      await pageA.locator("#learning-title").fill(titles.created)
      await pageA.getByRole("button", { name: "Create article" }).click()
      // R22: creating a master record through a form OPENS it.
      await pageA.waitForURL(/\/t\/[^/]+\/learning\/[^/]+/, { timeout: 60_000 })
      const recordUrl = pageA.url()
      await expect(articleTitle(pageA, titles.created)).toBeVisible()

      // ---- B: a SECOND, independent browser on the same record --------------
      // Same session cookie, its own context: its own cache, its own socket.
      ctxB = await browser.newContext({ storageState: await ctxA.storageState() })
      await ctxB.addInitScript(SOCKET_SPY)
      const pageB = await ctxB.newPage()
      await pageB.goto(recordUrl)
      await expect(articleTitle(pageB, titles.created)).toBeVisible()
      await expect(
        linkState(pageB),
        "B must be live before any of this means anything"
      ).toHaveAttribute("data-state", "live", { timeout: 30_000 })
      await setNavSentinel(pageB)
      const socketsBefore = await socketsOpened(pageB)

      // =====================================================================
      // CASE A — DELIVERY. A edits; B, touching nothing, sees it.
      // =====================================================================
      await test.step("A edits a record and B sees it without reloading", async () => {
        await rename(pageA, titles.connected)

        await expect(
          articleTitle(pageB, titles.connected),
          "B never reloaded and never clicked — only the live channel can put this on screen"
        ).toBeVisible({ timeout: 30_000 })
        await expectSentinelSurvived(
          pageB,
          "B must have received the change through the socket, NOT through a page reload"
        )
      })

      // =====================================================================
      // CASE B — CATCH-UP. Sever B, change it behind B's back, let B back in.
      // =====================================================================
      await test.step("B misses a change while disconnected, then converges on reconnect", async () => {
        // Sever it two ways: the network really goes away (which is what a
        // dropped link IS), and the open sockets are closed outright so the
        // client cannot sit on a half-dead one.
        await ctxB.setOffline(true)
        await pageB.evaluate(() => {
          const spy = (window as unknown as { __E2E_WS__: Spy }).__E2E_WS__
          for (const s of spy.sockets) s.close()
        })

        // THE ASSERTION THAT STOPS THIS BEING CASE A AGAIN: the app itself must
        // report it is no longer live. If this passes while B is still
        // connected, everything below proves nothing.
        await expect(
          linkState(pageB),
          "B must actually be disconnected — otherwise this case is just Case A with extra steps"
        ).not.toHaveAttribute("data-state", "live", { timeout: 30_000 })

        // A changes the record while B is down.
        await rename(pageA, titles.offline)

        // …and B, being down, must NOT have it. This is the second half of the
        // proof: B genuinely missed the change, so convergence below is
        // catch-up rather than delivery.
        await expect(
          articleTitle(pageB, titles.connected),
          "a disconnected B should still be showing the OLD title — if it already has the new one it was never disconnected"
        ).toBeVisible()

        // Let B back on the network. The client reconnects on its own backoff
        // (1s, 2s, 4s … capped at 15s), then fires onReconnect → reconcile.
        await ctxB.setOffline(false)

        await expect(
          linkState(pageB),
          "B must get its link back on its own — no reload, no user action"
        ).toHaveAttribute("data-state", "live", { timeout: 90_000 })
        expect(
          await socketsOpened(pageB),
          "a reconnect means a NEW socket — if the count never moved, B never really dropped"
        ).toBeGreaterThan(socketsBefore)

        // The point of the whole spec: B converges on the truth it slept
        // through, with no reload and nobody touching it.
        await expect(
          articleTitle(pageB, titles.offline),
          "B reconnected and must catch up on what it missed — a link that comes back deaf is worse than one that stays down, because the dot says Live"
        ).toBeVisible({ timeout: 90_000 })
        await expectSentinelSurvived(
          pageB,
          "the catch-up must be a resync, NOT a page reload"
        )
      })
    } finally {
      await ctxB?.close()
      await ctxA?.close()
    }
  })
})
