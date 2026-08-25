// What every law check shares: where the repo is, and how it reads source.
//
// The laws used to live in ONE file — `web/test/rules.test.ts`, 1,203 lines and
// 29 checks — and it grew every time a review found a new invariant. Four more
// wanted to land in it at once, which is the point at which "one file" stops
// being simplicity and starts being a queue. It is now one file per theme
// (`ui`, `worker`, `doors`, `activity`, `live`, `count`, `doc-facts`, `meta`),
// and this module is the only thing they have in common.
//
// The source readers all come from ONE module and are re-exported here rather
// than re-imported eight times. R11's check once walked `workers/*/src` only
// while carrying an exemption for `shared/workers/http.ts` — a path it could
// never reach — so a per-check reader is how a check goes blind. See
// `shared/test/source.ts` for the eight faults that produced it.

import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url)) // web/test/rules
/** `web/` — the browser workspace. */
export const WEB = join(HERE, "..", "..")
/** The repo root. */
export const ROOT = join(WEB, "..")

export {
  componentFiles,
  declarationBody,
  read,
  serverSources,
  stringLiterals,
  stripComments,
  workerSources,
} from "../../../shared/test/source"
