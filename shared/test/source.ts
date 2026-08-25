// READING SOURCE OFF DISK, ONCE AND CORRECTLY.
//
// Several Laws are enforced by tests that read the repository's own source and
// assert a shape. That works — but only if the reading is right, and between
// June and August 2026 eight separate checks were found to be blind or
// half-blind, each in its own way:
//
//   - `src.slice(src.indexOf("export async function x"))` reads to END OF FILE,
//     so every later function's code counts as this one's. `idempotent-transitions`
//     was green for two months on other functions' text.
//   - grepping source that still has its comments, so `// no LIMIT needed here`
//     satisfies the very bound it describes the absence of.
//   - a walker over `workers/*/src` used by a law whose own exemption names
//     `shared/workers/http.ts` — a path it can never reach.
//   - a file list hardcoded in the test, so the two workers that most needed the
//     rule were invisible to it.
//
// None of these fail loudly. A check that enumerates the wrong subject does not
// error; it passes, for ever, and the Law it claims to enforce is decoration.
// So the reading lives here, in one place, and every check imports it.
//
// The rule that follows from this file existing: **a check must derive its own
// subject list from the code, and must be proven to FAIL before it counts.**

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

/** The repo root, found by climbing until a directory holds all three
 * workspaces. Deliberately not `import.meta.url`: this module is compiled by the
 * WORKER tsconfigs too, which carry `@cloudflare/workers-types` and no Node URL
 * types. And deliberately a THROW rather than a fallback — a source scanner that
 * quietly resolves to the wrong root reports "all clear" on an empty file list,
 * which is the exact failure this module exists to end. */
function findRoot(): string {
  let d = "."
  for (let i = 0; i < 8; i++) {
    try {
      const here = readdirSync(d)
      if (here.includes("workers") && here.includes("shared") && here.includes("web")) return d
    } catch {
      /* not a directory we can read — keep climbing */
    }
    d = join(d, "..")
  }
  throw new Error("shared/test/source.ts: could not find the repo root — no ancestor holds workers/, shared/ and web/")
}

export const ROOT = findRoot()

/** A path with the root prefix removed, for readable failure messages.
 *
 * NOT `p.slice(ROOT.length)`. When `findRoot()` returns `"."` — which it does
 * whenever a suite runs from the repo root — `join(".", "workers")` normalises
 * away the dot to `"workers"`, so slicing one character off produced
 * `orkers/auth/src/index.ts`. Harmless in a failure message, and NOT harmless in
 * the several checks that filter or EXEMPT by path prefix: an exemption for
 * `workers/…` silently matched nothing, so the thing it excused was never
 * excused and the thing it should have caught was never caught. Found by the
 * privilege-guard scan on 2026-08-25. */
const rel = (p: string) => {
  const stripped = ROOT === "." ? p : p.slice(ROOT.length)
  return stripped.replace(/^[/\\]/, "")
}

export const read = (p: string) => readFileSync(p, "utf8")

// Comments are NOT code — so `// no LIMIT needed here` cannot satisfy the very
// bound it describes the absence of, and a comment naming a seam cannot stand in
// for calling it.
//
// A LEFT-TO-RIGHT SCANNER, not two regexes. The regex version ran the BLOCK pass
// first, so a block-open sequence occurring inside a LINE comment opened a block
// that was never opened and swallowed everything up to the next terminator. One
// line in the root layout named a path ending "icons" then a slash-star, and
// that ate the next 1,500 characters of real code — including the JSX every
// mounted component appears in, so a check asking "is this component rendered?"
// answered no about a component plainly on screen.
//
// Fifteen files in this repo contain the pattern, three of them worker entry
// points that Law checks read THROUGH this function. Found on 2026-08-25 only
// because a NEW check failed on something visibly present. Every older check
// using it had simply been reading less of those files than it believed.
//
// Strings and template literals are preserved WHOLE — R14 reads LIMIT out of
// them — and a `//` inside one is not a comment.
//
// REGEX LITERALS ARE THE SECOND FAULT, found 2026-08-25 by the fork sweep. The
// scanner had no concept of one, so `/["]/` looked like a slash followed by an
// opening double quote — and that "string" ran to the next quote ANYWHERE in the
// file, preserving everything in between, comments included. SIXTEEN files leaked
// comment prose into what the Law checks read as code, which is the same disease
// as the block-comment fault above and in the same direction: a check that finds
// a word in a comment believes it found the code.
//
// Telling a regex from a division needs the token before it, so the scanner now
// tracks the last significant character it emitted. That is the standard
// heuristic and it is not perfect — but the alternative is a full tokeniser, and
// the failure mode of the heuristic is a division treated as a regex, which is
// visible immediately, rather than a quote silently eating a file.
export function stripComments(src: string): string {
  // A `/` here opens a regex, not a division: nothing can be divided by these.
  // `>` earns its place via `=>`: a regex returned straight from an arrow
  // function is the single most common shape in this repo's own checks.
  const OPENS_REGEX = /[(,=:[!&|?{};+\-*%~^<>]$/
  const KEYWORD_BEFORE = /\b(return|typeof|case|in|of|do|else|yield|await|new|delete|void|instanceof)$/
  let out = ""
  let i = 0
  while (i < src.length) {
    const c = src[i]
    const next = src[i + 1]
    // A comment, in either form. Line comments end at the newline (which is
    // kept, so line numbers survive); block comments end at their terminator.
    if (c === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i++
      continue
    }
    if (c === "/" && next === "*") {
      i += 2
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++
      i += 2
      out += " "
      continue
    }
    // A REGEX LITERAL, copied verbatim. Decided by what came before: after a
    // value (`a / b`) a slash divides; after an operator, a comma, an opening
    // bracket or a keyword, it opens a pattern. A `/` inside a [character class]
    // does not close it — `/[/]/` is one regex, not two slashes.
    if (c === "/") {
      const before = out.replace(/\s+$/, "")
      if (before === "" || OPENS_REGEX.test(before) || KEYWORD_BEFORE.test(before)) {
        out += c
        i++
        let inClass = false
        while (i < src.length && src[i] !== "\n") {
          const ch = src[i]
          if (ch === "\\") {
            out += src.slice(i, i + 2)
            i += 2
            continue
          }
          if (ch === "[") inClass = true
          else if (ch === "]") inClass = false
          else if (ch === "/" && !inClass) {
            out += ch
            i++
            break
          }
          out += ch
          i++
        }
        continue
      }
    }
    // A string or template literal is copied verbatim — its contents are data,
    // and a `//` inside a URL is not the start of a comment.
    if (c === '"' || c === "'" || c === "`") {
      const quote = c
      out += c
      i++
      let depth = 0
      while (i < src.length) {
        const ch = src[i]
        if (ch === "\\") {
          out += src.slice(i, i + 2)
          i += 2
          continue
        }
        if (quote === "`" && ch === "$" && src[i + 1] === "{") depth++
        else if (quote === "`" && ch === "}" && depth > 0) depth--
        else if (ch === quote && depth === 0) {
          out += ch
          i++
          break
        }
        out += ch
        i++
      }
      continue
    }
    out += c
    i++
  }
  return out
}

/** The source of ONE top-level declaration, starting at `from`.
 *
 * A top-level declaration begins at column 0, so the next one ends this one.
 * Slicing to the next `export` instead swallows every private helper in between
 * and blames their code on the exported function above them; slicing to nothing
 * at all reads the rest of the file. Both have shipped here. */
export function declarationBody(src: string, from: number): string {
  const re = /\n(?:export |async function |function |const |class |type |interface )/g
  re.lastIndex = from + 1
  const next = re.exec(src)
  return src.slice(from, next ? next.index : undefined)
}

/** The body of the named top-level declaration, or "" if it is not there.
 * Returning "" rather than the whole file is deliberate: a renamed function
 * makes its check fail, instead of silently passing on everything else. */
export function namedBody(src: string, name: string): string {
  const at = src.indexOf(name)
  return at === -1 ? "" : declarationBody(src, at)
}

/** Every string literal in a chunk of TypeScript — template, double- and
 * single-quoted. A template literal comes back WHOLE, interpolations and nested
 * templates included, because SQL is often assembled that way and its LIMIT
 * belongs to the same statement as its SELECT. */
export function stringLiterals(src: string): string[] {
  const out: string[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (ch === "`") {
      let j = i + 1
      let depth = 0 // how many `${` we are inside — a backtick in there is nested
      while (j < src.length) {
        const c = src[j]
        if (c === "\\") { j += 2; continue }
        if (c === "$" && src[j + 1] === "{") { depth++; j += 2; continue }
        if (c === "}" && depth > 0) { depth--; j++; continue }
        if (c === "`" && depth === 0) break
        j++
      }
      out.push(src.slice(i + 1, j))
      i = j + 1
      continue
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1
      while (j < src.length && src[j] !== ch) j += src[j] === "\\" ? 2 : 1
      out.push(src.slice(i + 1, j))
      i = j + 1
      continue
    }
    i++
  }
  return out
}

/** Recursively collect files under `dir` matching `ext`, as [repo-relative, source]. */
function walkSources(dir: string, ext: string): [string, string][] {
  const out: [string, string][] = []
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith(ext)) out.push([rel(p), read(p)])
    }
  }
  walk(dir)
  return out
}

/** The workers, DERIVED — never a hand-written list, because a hardcoded subject
 * list does not fail when it is wrong, it passes and reports everything covered.
 *
 * A worker is a directory under `workers/` that HAS a `src`. That last clause is
 * not pedantry: running any npm command inside `workers/` leaves an empty
 * `workers/node_modules`, and on 2026-08-25 that one empty directory turned
 * thirteen law checks red at once — every check that walked `workers/*` and
 * assumed each entry was a worker. A gate that goes red because somebody typed
 * `npm ls` in the wrong folder teaches people to distrust the gate. */
export function workerNames(): string[] {
  return readdirSync(join(ROOT, "workers"), { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== "node_modules")
    .filter((e) => existsSync(join(ROOT, "workers", e.name, "src")))
    .map((e) => e.name)
    .sort()
}

/** Every worker's own `src` .ts file. Use this only for a rule that genuinely
 * means "code inside a worker" — most mean `serverSources`. */
export function workerSources(): [string, string][] {
  const out: [string, string][] = []
  for (const w of workerNames()) out.push(...walkSources(join(ROOT, "workers", w, "src"), ".ts"))
  return out
}

/** EVERY file that runs on a server: the workers AND the shared code they all
 * import. `shared/workers/` is where the seams live — gating, the data door,
 * http, activity, trace — so a rule about server behaviour that walks only
 * `workers/*` is blind to the most-used code in the base. R11's check was,
 * for a week, while carrying an exemption for a `shared/` path. */
export function serverSources(): [string, string][] {
  return [...workerSources(), ...walkSources(join(ROOT, "shared", "workers"), ".ts")]
}

/** Every *.tsx under web/components (recursively). */
export function componentFiles(): string[] {
  return walkSources(join(ROOT, "web", "components"), ".tsx").map(([p]) => join(ROOT, p))
}

/** The BODY of every `catch (…) { … }` in a chunk of source, brace-matched.
 *
 * A check that asks "does this worker record its errors?" by grepping the whole
 * FILE answers yes when the recording sits in some unrelated handler. The
 * gateway proved it: a sabotage that broke its central catch stayed green,
 * because the same door name appears in the browser error-beacon route forty
 * lines below. The question is only ever about the catch. */
export function catchBodies(src: string): string[] {
  const out: string[] = []
  const re = /catch\s*(?:\([^)]*\))?\s*\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    let depth = 1
    let i = m.index + m[0].length
    while (i < src.length && depth > 0) {
      if (src[i] === "{") depth++
      else if (src[i] === "}") depth--
      i++
    }
    out.push(src.slice(m.index, i))
  }
  return out
}
