// R1 for content. The scan itself lives in `shared/test/publish-seam.ts`, shared by
// every mutating worker — the three copies this replaces each carried a private
// reader that sliced to the next EXPORTED function and never stripped comments.

import { join } from "node:path"

import { describePublishSeam } from "../../../shared/test/publish-seam"
import { ROUTES } from "../src/index"

describePublishSeam({
  worker: "content",
  routes: ROUTES,
  srcDir: join(__dirname, "..", "src"),
  housekeeping: {
    "POST /api/content/learning/upload":
      "Stores an uploaded file in R2 but changes no record — there's no row to patch, so nothing to broadcast (the create/edit that references the file pings its own row)."
  },
  indirectPublishers: [],
})
