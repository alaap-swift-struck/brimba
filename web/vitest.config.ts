import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

// Web unit tests. jsdom by default (the store test renders a hook); the pure
// tests (identity / screens / shape) don't care which env they run in. The `@/`
// and `@shared/` aliases mirror web/tsconfig.json so tests import the same way
// the app does. Playwright e2e specs (web/e2e) are NOT vitest tests — excluded.
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    exclude: ["node_modules", "e2e/**", ".next", "out"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "@shared": fileURLToPath(new URL("../shared", import.meta.url)),
    },
  },
})
