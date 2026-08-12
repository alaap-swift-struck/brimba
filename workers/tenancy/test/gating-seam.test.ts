// R10 — the gating seam for tenancy. The scan itself lives in
// `shared/test/gating-seam.ts`, shared by every right-gated worker; this file is
// the part that is genuinely tenancy's: its route table, and the identity-gated
// writes it has reviewed and accepted.

import { join } from "node:path"

import { describeGatingSeam } from "../../../shared/test/gating-seam"
import { ROUTES } from "../src/index"

describeGatingSeam({
  worker: "tenancy",
  routes: ROUTES,
  srcDir: join(__dirname, "..", "src"),
  minRoutes: 14,
  identityGated: {
    "POST /api/tenancy/bootstrap":
      "teamless onboarding — the caller has no team yet, so there is no role to check",
    "POST /api/tenancy/switch-team":
      "flips the caller's OWN current-team pointer; membership is validated inside",
    "POST /api/tenancy/teams":
      "creates the caller's own team — they become its Admin, so no prior right exists",
    "POST /api/tenancy/invitations/accept":
      "acceptance is proved by the invite's email matching the signed-in account",
  },
})
