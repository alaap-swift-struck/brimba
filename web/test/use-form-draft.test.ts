// Form-draft persistence (CACHING.md §11): unsaved form input must survive
// navigating away and coming back. These lock the lifetime — restore on (re)mount,
// persist on change, clear on demand, and never leak across sign-out.

import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { clearAllFormDrafts, useFormDraft } from "@/lib/use-form-draft"

afterEach(() => sessionStorage.clear())

describe("useFormDraft", () => {
  it("returns the initial values when there is no saved draft", () => {
    const { result } = renderHook(() => useFormDraft("learning:new:t1", { title: "" }, true))
    expect(result.current[0]).toEqual({ title: "" })
  })

  it("persists changes and restores them on a fresh mount (the navigate-away case)", () => {
    const first = renderHook(() => useFormDraft("learning:new:t1", { title: "" }, true))
    act(() => first.result.current[1]({ title: "Half-written" }))
    // A brand-new mount, as after navigating elsewhere and reopening the form:
    const second = renderHook(() => useFormDraft("learning:new:t1", { title: "" }, true))
    expect(second.result.current[0]).toEqual({ title: "Half-written" })
  })

  it("clear() drops the draft so the next open starts fresh", () => {
    const a = renderHook(() => useFormDraft("learning:new:t1", { title: "" }, true))
    act(() => a.result.current[1]({ title: "x" }))
    act(() => a.result.current[2]())
    const b = renderHook(() => useFormDraft("learning:new:t1", { title: "" }, true))
    expect(b.result.current[0]).toEqual({ title: "" })
  })

  it("does not write while inactive (a closed form)", () => {
    const { result } = renderHook(() => useFormDraft("learning:new:t1", { title: "" }, false))
    act(() => result.current[1]({ title: "y" }))
    expect(sessionStorage.getItem("brimba:draft:learning:new:t1")).toBeNull()
  })

  it("is a no-op store when draftKey is omitted", () => {
    const { result } = renderHook(() => useFormDraft(undefined, { title: "" }, true))
    act(() => result.current[1]({ title: "z" }))
    expect(sessionStorage.length).toBe(0)
  })

  it("keys are isolated per form (edit vs new, per record)", () => {
    const newForm = renderHook(() => useFormDraft("learning:new:t1", { title: "" }, true))
    act(() => newForm.result.current[1]({ title: "drafting a new one" }))
    const editForm = renderHook(() => useFormDraft("learning:edit:abc", { title: "real" }, true))
    expect(editForm.result.current[0]).toEqual({ title: "real" })
  })

  it("clearAllFormDrafts wipes drafts but leaves other storage alone (sign-out)", () => {
    sessionStorage.setItem("brimba:draft:one", "1")
    sessionStorage.setItem("brimba:draft:two", "2")
    sessionStorage.setItem("unrelated", "keep")
    clearAllFormDrafts()
    expect(sessionStorage.getItem("brimba:draft:one")).toBeNull()
    expect(sessionStorage.getItem("brimba:draft:two")).toBeNull()
    expect(sessionStorage.getItem("unrelated")).toBe("keep")
  })
})
