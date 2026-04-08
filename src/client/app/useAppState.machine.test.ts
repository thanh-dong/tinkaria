import { describe, expect, test } from "bun:test"
import {
  canStartQueuedFlush,
  clearQueuedSubmit,
  completeQueuedFlush,
  createProjectSelectionState,
  createSubmitPipelineState,
  failQueuedFlush,
  getQueuedFlushKey,
  getQueuedText,
  getSubmitPipelineMode,
  markPostFlushBusyObserved,
  queueSubmit,
  resolveProjectSelection,
  startQueuedFlush,
  transitionProjectSelection,
} from "./useAppState.machine"

describe("projectSelection machine", () => {
  test("prefers the active chat project over explicit and fallback selection", () => {
    let state = createProjectSelectionState()
    state = transitionProjectSelection(state, { type: "sidebar.loaded", firstProjectId: "project-fallback" })
    state = transitionProjectSelection(state, { type: "project.explicitly_selected", projectId: "project-explicit" })
    state = transitionProjectSelection(state, { type: "chat.snapshot_received", projectId: "project-chat" })

    expect(resolveProjectSelection(state)).toEqual({
      source: "chat_owned",
      projectId: "project-chat",
    })
  })

  test("falls back to the explicit selection after the active chat clears", () => {
    let state = createProjectSelectionState()
    state = transitionProjectSelection(state, { type: "sidebar.loaded", firstProjectId: "project-fallback" })
    state = transitionProjectSelection(state, { type: "project.explicitly_selected", projectId: "project-explicit" })
    state = transitionProjectSelection(state, { type: "chat.snapshot_received", projectId: "project-chat" })
    state = transitionProjectSelection(state, { type: "chat.cleared" })

    expect(resolveProjectSelection(state)).toEqual({
      source: "explicit",
      projectId: "project-explicit",
    })
  })

  test("uses the sidebar fallback when no explicit or chat-owned selection exists", () => {
    const state = transitionProjectSelection(createProjectSelectionState(), {
      type: "sidebar.loaded",
      firstProjectId: "project-fallback",
    })

    expect(resolveProjectSelection(state)).toEqual({
      source: "fallback",
      projectId: "project-fallback",
    })
  })
})

describe("submitPipeline machine", () => {
  test("queues follow-up text and enters queued mode", () => {
    const state = queueSubmit(createSubmitPipelineState(), {
      chatId: "chat-1",
      content: "Check layout",
      options: { provider: "codex" },
    })

    expect(getQueuedText(state, "chat-1")).toBe("Check layout")
    expect(getSubmitPipelineMode(state, "chat-1")).toBe("queued")
  })

  test("starts a flush only when the queue is eligible", () => {
    const queued = queueSubmit(createSubmitPipelineState(), {
      chatId: "chat-1",
      content: "Check layout",
    })

    expect(canStartQueuedFlush(queued, { chatId: "chat-1", isProcessing: false })).toBe(true)
    expect(canStartQueuedFlush(queued, { chatId: "chat-1", isProcessing: true })).toBe(false)

    const { state, flushRequest } = startQueuedFlush(queued, {
      chatId: "chat-1",
      isProcessing: false,
    })

    expect(flushRequest).toEqual({
      chatId: "chat-1",
      text: "Check layout",
      options: undefined,
      restoreBlockedKey: "chat-1:Check layout",
    })
    expect(getQueuedText(state, "chat-1")).toBe("")
    expect(getSubmitPipelineMode(state, "chat-1")).toBe("flushing")
  })

  test("holds in awaiting_busy_ack until runtime busy is observed", () => {
    const queued = queueSubmit(createSubmitPipelineState(), {
      chatId: "chat-1",
      content: "Check layout",
    })
    const { state: flushing } = startQueuedFlush(queued, {
      chatId: "chat-1",
      isProcessing: false,
    })
    const succeeded = completeQueuedFlush(flushing, "chat-1")

    expect(getSubmitPipelineMode(succeeded, "chat-1")).toBe("awaiting_busy_ack")

    const busyObserved = markPostFlushBusyObserved(succeeded, "chat-1")
    expect(getSubmitPipelineMode(busyObserved, "chat-1")).toBe("idle")
  })

  test("restores the failed flush text and blocks immediate retry until the queue changes", () => {
    const queued = queueSubmit(createSubmitPipelineState(), {
      chatId: "chat-1",
      content: "First message",
    })
    const { state: flushing } = startQueuedFlush(queued, {
      chatId: "chat-1",
      isProcessing: false,
    })
    const failed = failQueuedFlush(flushing, {
      chatId: "chat-1",
      flushedText: "First message",
    })

    expect(getQueuedText(failed, "chat-1")).toBe("First message")
    expect(getSubmitPipelineMode(failed, "chat-1")).toBe("blocked")
    expect(getQueuedFlushKey("chat-1", "First message")).toBe("chat-1:First message")

    const changedQueue = queueSubmit(failed, {
      chatId: "chat-1",
      content: "Second message",
    })
    expect(getQueuedText(changedQueue, "chat-1")).toBe("First message\n\nSecond message")
    expect(getSubmitPipelineMode(changedQueue, "chat-1")).toBe("queued")
  })

  test("clears queued submit state symmetrically", () => {
    const queued = queueSubmit(createSubmitPipelineState(), {
      chatId: "chat-1",
      content: "Check layout",
      options: { provider: "claude", planMode: true },
    })

    const cleared = clearQueuedSubmit(queued, "chat-1")
    expect(getQueuedText(cleared, "chat-1")).toBe("")
    expect(getSubmitPipelineMode(cleared, "chat-1")).toBe("idle")
  })
})
