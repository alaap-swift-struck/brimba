// R1 for tenancy. The scan itself lives in `shared/test/publish-seam.ts`, shared by
// every mutating worker — the three copies this replaces each carried a private
// reader that sliced to the next EXPORTED function and never stripped comments.

import { join } from "node:path"

import { describePublishSeam } from "../../../shared/test/publish-seam"
import { ROUTES } from "../src/index"

describePublishSeam({
  worker: "tenancy",
  routes: ROUTES,
  srcDir: join(__dirname, "..", "src"),
  housekeeping: {
    "POST /api/tenancy/switch-team":
      "flips the caller's OWN current-team pointer — nobody else's screen changes, so there is no row for anyone to patch",
    "POST /api/tenancy/admin/migrate-teams":
      "an owner operation that rolls team-schema migrations; it changes structure, not records, and runs outside any team's live channel",
    "POST /api/tenancy/admin/move-module":
      "an owner operation relocating a module's database; the records are identical afterwards, so there is nothing to broadcast",
  },
  indirectPublishers: ["createTeam", "acceptPendingInvites", "acceptInvite"],
})
