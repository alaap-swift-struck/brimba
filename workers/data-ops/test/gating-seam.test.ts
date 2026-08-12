// R10 — the gating seam for data-ops. The scan itself lives in
// `shared/test/gating-seam.ts`, shared by every right-gated worker. This worker
// has NO identity-gated exceptions: every one of its writes is about team data,
// so every one can ask the role sheet.

import { join } from "node:path"

import { describeGatingSeam } from "../../../shared/test/gating-seam"
import { ROUTES } from "../src/index"

describeGatingSeam({
  worker: "data-ops",
  routes: ROUTES,
  srcDir: join(__dirname, "..", "src"),
  minRoutes: 8,
})
