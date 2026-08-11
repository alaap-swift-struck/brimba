// Ambient types for the Node built-ins the SEAM GUARD tests read source off disk
// with — the one place worker test code touches a filesystem.
//
// Why a shim at all: every worker's `types` is deliberately narrowed to
// `@cloudflare/workers-types`, because worker source must not be able to reach
// for a Node API that will not exist at runtime. The seam tests are the
// exception — they run under vitest on Node, and their whole method is reading
// a handler's own source to prove it gates, publishes and bounds what it should.
//
// Why it lives HERE: every worker tsconfig already includes `../../shared/**/*.ts`,
// and a `.d.ts` matches that glob — so one file serves all seven. It used to be
// five near-identical copies, which is exactly the drift this base is meant not
// to have: the one that grew a `withFileTypes` overload had it in auth only, so
// the same test written in another worker would fail to compile for a reason
// that had nothing to do with the test.
//
// Keep it MINIMAL — only what a seam test actually calls. This is a fence around
// Node, not a doorway into it.

declare const __dirname: string

declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string
  export function readdirSync(path: string): string[]
  export function readdirSync(
    path: string,
    opts: { withFileTypes: true }
  ): { name: string; isDirectory(): boolean }[]
}

declare module "node:path" {
  export function join(...parts: string[]): string
}
