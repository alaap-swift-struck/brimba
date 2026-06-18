// Minimal ambient types for Node's built-in node:sqlite (a real Node 24 module
// that this project's restricted `types` set doesn't include). Just the slice
// the integration tests use — D1 is SQLite, so this is enough to drive the SQL.
declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(path: string)
    exec(sql: string): void
    prepare(sql: string): {
      run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint }
      get(...params: unknown[]): unknown
      all(...params: unknown[]): unknown[]
    }
  }
}
