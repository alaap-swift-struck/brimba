import { defineConfig, devices } from "@playwright/test"

// Playwright e2e config. Drives the REAL app against a running URL (staging by
// default). This file is NOT type-checked by `tsc -p web` (e2e/** is excluded in
// web/tsconfig.json) and Playwright is NOT installed in CI — run it locally with
// `npm install -D @playwright/test && npx playwright install` then
// `npm run test:e2e --workspace=brimba-web`. See e2e/README.md.

const BASE_URL =
  process.env.BASE_URL ?? "https://brimba-staging.swift-struck.workers.dev"

export default defineConfig({
  testDir: "./e2e",
  // Sequential: the flow mutates shared team state (role changes, invites).
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
})
