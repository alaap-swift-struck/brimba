"use client"

// Form-draft persistence (CACHING.md §11). The data cache keeps FETCHED data warm
// across navigation; this keeps UNSAVED form input from being lost. A half-filled
// form whose screen unmounts (you navigated elsewhere in the same tab) would
// otherwise reset to empty on return — the input lived only in component state.
//
// We persist each form's values to sessionStorage (survives navigation AND reload
// within the tab session; gone when the tab closes), keyed by a stable draft id the
// caller supplies (e.g. "learning:new:<teamId>" or "learning:edit:<recordId>").
//
// Lifetime: a draft is CLEARED on submit (the record now exists) and on an explicit
// dismiss (Esc / backdrop / the close button) — dismissing a form discards it. It is
// PRESERVED when the form simply unmounts from navigation — that's the case we're
// protecting. Also cleared for everyone on sign-out (clearAllFormDrafts).

import * as React from "react"

const PREFIX = "brimba:draft:"
const storageKey = (id: string) => PREFIX + id

function read<T>(id: string): T | null {
  try {
    const raw = sessionStorage.getItem(storageKey(id))
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write<T>(id: string, value: T): void {
  try {
    sessionStorage.setItem(storageKey(id), JSON.stringify(value))
  } catch {
    // quota / private-mode / disabled storage — drafts are best-effort, never fatal.
  }
}

/** Drop a single saved draft. */
export function clearFormDraft(id: string): void {
  try {
    sessionStorage.removeItem(storageKey(id))
  } catch {
    // ignore
  }
}

/** Drop every saved draft (call on sign-out so one user's drafts never leak to the next). */
export function clearAllFormDrafts(): void {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i)
      if (k?.startsWith(PREFIX)) sessionStorage.removeItem(k)
    }
  } catch {
    // ignore
  }
}

/**
 * Session-scoped form state. A drop-in for `useState(initial)` that restores a saved
 * draft when the form becomes `active`, and persists every change while it stays
 * active. `id` is the stable draft key; pass `undefined`/`""` to turn persistence off
 * (behaves like plain state). Call the returned `clear()` on submit / explicit dismiss.
 */
export function useFormDraft<T extends object>(
  id: string | undefined,
  initial: T,
  active: boolean
): [T, (next: T | ((prev: T) => T)) => void, () => void, number] {
  // Keep the latest `initial` without re-seeding every render (it's a fresh literal
  // each time); we re-seed only when the form (re)activates.
  const initialRef = React.useRef(initial)
  initialRef.current = initial

  // Restore SYNCHRONOUSLY: lazy-init when mounted already active, and re-seed on the
  // inactive→active edge (a reopened dialog). Synchronous (not an effect) so even
  // UNCONTROLLED inputs — the rich-text editor — mount with the saved value, not empty.
  const [values, setValuesRaw] = React.useState<T>(() =>
    active && id ? (read<T>(id) ?? initial) : initial
  )
  // Bumped each time the form re-activates — key uncontrolled editors by it so they
  // remount with the restored value.
  const [seed, setSeed] = React.useState(0)
  const prevActive = React.useRef(active)
  if (active !== prevActive.current) {
    prevActive.current = active
    if (active) {
      setValuesRaw(id ? (read<T>(id) ?? initialRef.current) : initialRef.current)
      setSeed((s) => s + 1)
    }
  }

  const setValues = React.useCallback(
    (next: T | ((prev: T) => T)) => {
      setValuesRaw((prev) => {
        const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next
        if (active && id) write(id, v)
        return v
      })
    },
    [active, id]
  )

  const clear = React.useCallback(() => {
    if (id) clearFormDraft(id)
  }, [id])

  return [values, setValues, clear, seed]
}
