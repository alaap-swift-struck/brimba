// THE CLIENT HALF OF THE LOST-UPDATE GUARD — the Dropdown values screen.
//
// `updateSelectable` on the tenancy worker has always carried
// `versionPredicate(expectedVersion)`. The web client could not use it: no
// projection selected a timestamp, so `SelectableValue` had no version field, so
// `saveRename` had nothing to send. The guard existed and no caller could reach
// it — campaign lesson #10 in its purest form.
//
// Asserting "the row has an `updatedAt` field" would be a weak test: someone can
// keep the field and drop the argument, and the rename is unguarded again with
// every assertion still green. So this drives the REAL screen — the real
// `SelectableScreen`, the real `store`, the real `live-resources` — against a
// FAKE SERVER whose only rule is the one the door actually applies:
//
//     no expectation sent  → the predicate is EMPTY → the write LANDS
//     expectation matches  → the write lands
//     expectation is stale → 409 changed_elsewhere
//
// That middle-out shape is what makes the test honest in both directions. A
// client that sends nothing does not fail on a missing field — it fails by
// SILENTLY OVERWRITING somebody else's save, which is the actual bug.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { PermissionValue, SelectableValue } from "@shared/types"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SelectableScreen } from "@/components/selectable-screen"
import { primeCache } from "@/lib/store"

// The ONE seam swapped is the network door — everything between it and the DOM
// (the cache, `applyUpdated`, `patchRow`, the effects) is the shipped code.
// `ApiFailure` is the REAL class, because the screen branches on `instanceof`.
const net = vi.hoisted(() => ({
  selectable: vi.fn(),
  updateSelectable: vi.fn(),
  myPermissions: vi.fn(),
}))
vi.mock("@/lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/api")>()
  return { ApiFailure: real.ApiFailure, auth: {}, content: {}, tenancy: net }
})

// Toasts need a <Toaster/> mounted to render; the screen's success/failure
// reporting is captured here instead so the refusal can be asserted.
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("@swift-struck/ui/registry/primitives/sonner/sonner", () => ({ toast: toasts }))

import { ApiFailure } from "@/lib/api"

// This workspace runs vitest WITHOUT globals, so testing-library's automatic
// cleanup never registers — without it the previous test's rows are still in the
// document and a query resolves against a stale node.
afterEach(cleanup)

const ALL_RIGHTS: PermissionValue = {
  selectable_data: { read: true, create: true, edit: true, delete: true },
}

/** The tenancy door, reduced to the one rule that matters here. `updatedAt ??
 * createdAt` mirrors `versionPredicate`'s COALESCE, so a never-edited row still
 * has a version — the case a freshly created value is in. */
function fakeServer(row: SelectableValue) {
  const state = { ...row }
  const versionOf = (r: SelectableValue) => r.updatedAt ?? r.createdAt ?? null

  return {
    state,
    /** Someone ELSE saves first. Only the server moves; the screen keeps showing
     * the row it was handed, exactly as it does before a live ping arrives. */
    someoneElseSaves(value: string) {
      state.value = value
      state.updatedAt = "2026-08-25T10:00:00.000Z"
    },
    update(id: string, value: string, expectedVersion?: string | null) {
      if (id !== state.id) throw new ApiFailure(404, "not_found", "No such value.")
      // NO EXPECTATION = no predicate = last write wins. This is what the door
      // really does, and it is why an un-adopted client loses the other edit.
      if (expectedVersion && expectedVersion !== versionOf(state))
        throw new ApiFailure(
          409,
          "changed_elsewhere",
          "Someone else changed this while you had it open."
        )
      state.value = value
      state.updatedAt = "2026-08-25T11:00:00.000Z"
      return { updated: { ...state } }
    },
  }
}

/** A dropdown value as the door hands it over, never edited (so its version is
 * its `createdAt` — the COALESCE fallback). */
function freshValue(): SelectableValue {
  return {
    id: "V1",
    type: "File type",
    value: "Image file",
    isDefault: false,
    active: true,
    createdAt: "2026-08-25T09:00:00.000Z",
    updatedAt: null,
  }
}

/** Mount the screen with the list and rights already in cache, and wait for the
 * row to paint. Distinct team ids per test: the store's cache is module-level
 * and outlives one test. */
async function mountWith(teamId: string, shown: SelectableValue) {
  primeCache(`my-perms:${teamId}`, ALL_RIGHTS)
  primeCache(`selectable:${teamId}`, [shown])
  net.selectable.mockResolvedValue({ values: [shown], total: 1 })
  net.myPermissions.mockResolvedValue({ permissions: ALL_RIGHTS })
  render(<SelectableScreen teamId={teamId} />)
  await screen.findByText(shown.value)
}

/** Rename the row through the actual UI: pencil → type → save. */
async function renameInUi(from: string, to: string) {
  fireEvent.click(screen.getByLabelText(`Rename ${from}`))
  fireEvent.change(await screen.findByDisplayValue(from), { target: { value: to } })
  fireEvent.click(screen.getByLabelText("Save"))
}

beforeEach(() => {
  net.selectable.mockReset()
  net.updateSelectable.mockReset()
  net.myPermissions.mockReset()
  toasts.success.mockReset()
  toasts.error.mockReset()
})

describe("renaming a dropdown value reaches the lost-update guard", () => {
  it("is REFUSED when someone else saved while the rename was open", async () => {
    const shown = freshValue()
    const server = fakeServer(shown)
    net.updateSelectable.mockImplementation(
      async (id: string, value: string, expectedVersion?: string | null) =>
        server.update(id, value, expectedVersion)
    )

    await mountWith("t-stale", shown)

    // Someone else renames it first. Our screen still holds the older row.
    server.someoneElseSaves("Photo")

    await renameInUi("Image file", "Screenshot")

    await waitFor(() => expect(net.updateSelectable).toHaveBeenCalled())
    // The screen must SEND the version it was shown — without it the door has no
    // predicate and the write below would land.
    expect(
      net.updateSelectable.mock.calls[0]?.[2],
      "the rename must carry the version the screen was shown"
    ).toBe(shown.createdAt)

    await waitFor(() => expect(toasts.error).toHaveBeenCalled())
    expect(
      server.state.value,
      "the other person's save must survive — this is the lost update"
    ).toBe("Photo")
    expect(toasts.success).not.toHaveBeenCalled()
  })

  it("SUCCEEDS when the screen is holding the current version", async () => {
    const shown = freshValue()
    const server = fakeServer(shown)
    net.updateSelectable.mockImplementation(
      async (id: string, value: string, expectedVersion?: string | null) =>
        server.update(id, value, expectedVersion)
    )

    await mountWith("t-current", shown)
    await renameInUi("Image file", "Picture file")

    await waitFor(() => expect(toasts.success).toHaveBeenCalled())
    expect(net.updateSelectable.mock.calls[0]?.[2]).toBe(shown.createdAt)
    expect(server.state.value).toBe("Picture file")
    // R23's client half: the one row the door handed back is patched in.
    expect(await screen.findByText("Picture file")).toBeTruthy()
    expect(toasts.error).not.toHaveBeenCalled()
  })

  it("sends the row's updatedAt once it HAS one (not the createdAt forever)", async () => {
    // The fallback is for a never-edited row only. If the client kept sending
    // `createdAt` after the first edit, every save after the first would be
    // permanently stale and the screen would be unusable.
    const shown = { ...freshValue(), updatedAt: "2026-08-25T10:30:00.000Z" }
    const server = fakeServer(shown)
    net.updateSelectable.mockImplementation(
      async (id: string, value: string, expectedVersion?: string | null) =>
        server.update(id, value, expectedVersion)
    )

    await mountWith("t-edited", shown)
    await renameInUi("Image file", "Picture file")

    await waitFor(() => expect(net.updateSelectable).toHaveBeenCalled())
    expect(net.updateSelectable.mock.calls[0]?.[2]).toBe("2026-08-25T10:30:00.000Z")
    expect(server.state.value).toBe("Picture file")
  })
})
