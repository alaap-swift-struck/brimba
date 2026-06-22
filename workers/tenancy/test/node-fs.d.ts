// Minimal ambient types for the Node built-ins the seam guard test reads source
// off disk with (this project's restricted `types` set excludes @types/node — see
// node-sqlite.d.ts for the same pattern). Just the slice publish-seam.test.ts uses.
declare const __dirname: string
declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string
  export function readdirSync(path: string): string[]
}
declare module "node:path" {
  export function join(...parts: string[]): string
}
