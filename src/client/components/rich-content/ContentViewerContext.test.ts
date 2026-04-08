import { describe, test, expect } from "bun:test"
import { clampEmbedZoom, viewerReducer, createInitialState, type ViewerAction } from "./ContentViewerContext"

describe("ContentViewerContext reducer", () => {
  describe("code viewer", () => {
    test("creates initial state with lineNumbers false", () => {
      const state = createInitialState("code")
      expect(state).toEqual({ type: "code", lineNumbers: false })
    })
    test("TOGGLE_LINE_NUMBERS flips lineNumbers", () => {
      const state = createInitialState("code")
      const next = viewerReducer(state, { type: "TOGGLE_LINE_NUMBERS" })
      expect(next).toEqual({ type: "code", lineNumbers: true })
      const reverted = viewerReducer(next, { type: "TOGGLE_LINE_NUMBERS" })
      expect(reverted).toEqual({ type: "code", lineNumbers: false })
    })
  })
  describe("diff viewer", () => {
    test("creates initial state with unified mode", () => {
      const state = createInitialState("diff")
      expect(state).toEqual({ type: "diff", viewMode: "unified" })
    })
    test("SET_VIEW_MODE sets view mode idempotently", () => {
      const state = createInitialState("diff")
      const split = viewerReducer(state, { type: "SET_VIEW_MODE", payload: "split" })
      expect(split).toEqual({ type: "diff", viewMode: "split" })
      const unified = viewerReducer(split, { type: "SET_VIEW_MODE", payload: "unified" })
      expect(unified).toEqual({ type: "diff", viewMode: "unified" })
      const noop = viewerReducer(state, { type: "SET_VIEW_MODE", payload: "unified" })
      expect(noop).toEqual({ type: "diff", viewMode: "unified" })
    })
  })
  describe("embed viewer", () => {
    test("creates initial state with render mode and zoom 1", () => {
      const state = createInitialState("embed")
      expect(state).toEqual({ type: "embed", renderMode: "render", zoom: 1 })
    })
    test("SET_RENDER_MODE changes render mode", () => {
      const state = createInitialState("embed")
      const next = viewerReducer(state, { type: "SET_RENDER_MODE", payload: "source" })
      expect(next).toEqual({ type: "embed", renderMode: "source", zoom: 1 })
    })
    test("ZOOM_IN increases zoom by 0.25", () => {
      const state = createInitialState("embed")
      const next = viewerReducer(state, { type: "ZOOM_IN" })
      expect(next).toEqual({ type: "embed", renderMode: "render", zoom: 1.25 })
    })
    test("ZOOM_OUT decreases zoom by 0.25 with 0.25 floor", () => {
      const state = createInitialState("embed")
      const zoomed = viewerReducer(state, { type: "ZOOM_OUT" })
      expect(zoomed).toEqual({ type: "embed", renderMode: "render", zoom: 0.75 })
      const floor = viewerReducer(
        { type: "embed", renderMode: "render", zoom: 0.25 },
        { type: "ZOOM_OUT" },
      )
      expect(floor).toEqual({ type: "embed", renderMode: "render", zoom: 0.25 })
    })
    test("ZOOM_IN clamps at max 5", () => {
      const state = { type: "embed" as const, renderMode: "render" as const, zoom: 5 }
      const next = viewerReducer(state, { type: "ZOOM_IN" })
      expect(next).toEqual({ type: "embed", renderMode: "render", zoom: 5 })
    })
    test("ZOOM_RESET sets zoom back to 1", () => {
      const state = { type: "embed" as const, renderMode: "render" as const, zoom: 2.5 }
      const next = viewerReducer(state, { type: "ZOOM_RESET" })
      expect(next).toEqual({ type: "embed", renderMode: "render", zoom: 1 })
    })
    test("SET_ZOOM clamps arbitrary zoom values", () => {
      const state = createInitialState("embed")
      expect(viewerReducer(state, { type: "SET_ZOOM", payload: 3.5 })).toEqual({
        type: "embed",
        renderMode: "render",
        zoom: 3.5,
      })
      expect(viewerReducer(state, { type: "SET_ZOOM", payload: 99 })).toEqual({
        type: "embed",
        renderMode: "render",
        zoom: 5,
      })
      expect(viewerReducer(state, { type: "SET_ZOOM", payload: 0.1 })).toEqual({
        type: "embed",
        renderMode: "render",
        zoom: 0.25,
      })
    })
  })
  describe("markdown viewer", () => {
    test("creates initial state with tocOpen false and empty headings", () => {
      const state = createInitialState("markdown")
      expect(state).toEqual({ type: "markdown", tocOpen: false, headings: [] })
    })
    test("TOGGLE_TOC flips tocOpen", () => {
      const state = createInitialState("markdown")
      const next = viewerReducer(state, { type: "TOGGLE_TOC" })
      expect(next).toEqual({ type: "markdown", tocOpen: true, headings: [] })
    })
    test("REGISTER_HEADINGS sets headings array", () => {
      const state = createInitialState("markdown")
      const headings = [
        { level: 1, text: "Title", id: "title" },
        { level: 2, text: "Section", id: "section" },
      ]
      const next = viewerReducer(state, { type: "REGISTER_HEADINGS", payload: headings })
      expect(next).toEqual({ type: "markdown", tocOpen: false, headings })
    })
  })
  test("returns same state for unknown action on any viewer type", () => {
    const state = createInitialState("code")
    // @ts-expect-error — testing unknown action
    const next = viewerReducer(state, { type: "UNKNOWN_ACTION" })
    expect(next).toBe(state)
  })
})

describe("clampEmbedZoom", () => {
  test("clamps zoom and falls back for non-finite values", () => {
    expect(clampEmbedZoom(0.1)).toBe(0.25)
    expect(clampEmbedZoom(2)).toBe(2)
    expect(clampEmbedZoom(99)).toBe(5)
    expect(clampEmbedZoom(Number.NaN)).toBe(1)
  })
})
