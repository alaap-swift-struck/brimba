"use client"

// THE RETRY KEY — what makes pressing "save" again safe.
//
// The case this exists for is ordinary and invisible: you tap save on a slow
// connection, the request takes longer than the phone is willing to wait, the
// app says it failed, and you tap save again. The server received BOTH. Nothing
// was wrong with either one, so nothing complained — the team just got two.
//
// A key ties the second attempt to the first. The server (shared/workers/
// concurrency.ts) recognises it, replays what the first attempt did, and does
// not do it again.
//
// THE RULE THAT MAKES IT CORRECT: the same key means "this is the same attempt
// at the same thing". So a FAILED submit keeps its key — retrying is the point —
// and a SUCCESSFUL one throws its key away, because the next save is a new
// intention and must never be mistaken for a replay of the last.

/** A key per submit attempt. Random, so it cannot collide with anyone else's,
 * and shaped to the server's `KEY_SHAPE`. */
export function newSubmitKey(): string {
  return crypto.randomUUID().replace(/-/g, "")
}

// The key in force for the submit currently running. It is ambient rather than
// threaded through every module's onSubmit for the same reason LAW R22 lives in
// FormShell: a module should get the behaviour by existing, not by each screen
// remembering to pass an argument. One place sets it, one place reads it.
//
// Ambient state is worth a caveat: set and clear are strictly nested around a
// single awaited submit, and forms in this app open one at a time (they are
// dialogs). If two ever did overlap, the worst outcome is a refused save — the
// server rejects a key used for a different route — never a wrong one.
let inFlightKey: string | null = null

/** Run one submit under a key. */
export async function withSubmitKey<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = inFlightKey
  inFlightKey = key
  try {
    return await run()
  } finally {
    inFlightKey = previous
  }
}

/** The key the API client should attach, if we are inside a submit. */
export function currentSubmitKey(): string | null {
  return inFlightKey
}
