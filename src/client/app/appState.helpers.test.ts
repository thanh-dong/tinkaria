import { describe, expect, test } from "bun:test"
import {
  clearPendingSessionBootstrapAfterAttempt,
  transitionPendingSessionBootstrapToError,
  type PendingSessionBootstrap,
} from "./appState.helpers"

function pendingBootstrap(kind: PendingSessionBootstrap["kind"], phase: PendingSessionBootstrap["phase"]): PendingSessionBootstrap {
  return {
    chatId: "chat-target",
    kind,
    phase,
    sourceLabels: kind === "fork" ? ["Source"] : ["Source A", "Source B"],
    previewTitle: kind === "fork" ? "Fork: Source" : "Merge: Source A + Source B",
    previewIntent: kind === "fork" ? "Investigate the timeout." : "Combine the verified findings.",
  }
}

describe("transitionPendingSessionBootstrapToError", () => {
  test("marks fork bootstrap failures as sticky errors for the active chat", () => {
    expect(transitionPendingSessionBootstrapToError(
      pendingBootstrap("fork", "starting"),
      "chat-target",
      "Fork failed upstream",
    )).toEqual({
      chatId: "chat-target",
      kind: "fork",
      phase: "error",
      sourceLabels: ["Source"],
      previewTitle: "Fork: Source",
      previewIntent: "Investigate the timeout.",
      errorMessage: "Fork failed upstream",
    })
  })

  test("marks merge bootstrap failures as sticky errors for the active chat", () => {
    expect(transitionPendingSessionBootstrapToError(
      pendingBootstrap("merge", "starting"),
      "chat-target",
      "Merge failed upstream",
    )).toEqual({
      chatId: "chat-target",
      kind: "merge",
      phase: "error",
      sourceLabels: ["Source A", "Source B"],
      previewTitle: "Merge: Source A + Source B",
      previewIntent: "Combine the verified findings.",
      errorMessage: "Merge failed upstream",
    })
  })

  test("ignores failures from other chats", () => {
    expect(transitionPendingSessionBootstrapToError(
      pendingBootstrap("merge", "starting"),
      "chat-other",
      "should be ignored",
    )).toEqual(pendingBootstrap("merge", "starting"))
  })
})

describe("clearPendingSessionBootstrapAfterAttempt", () => {
  test("clears successful fork bootstrap placeholders", () => {
    expect(clearPendingSessionBootstrapAfterAttempt(
      pendingBootstrap("fork", "starting"),
      "chat-target",
    )).toBeNull()
  })

  test("keeps failed merge bootstrap errors visible until dismissal", () => {
    expect(clearPendingSessionBootstrapAfterAttempt(
      {
        ...pendingBootstrap("merge", "error"),
        errorMessage: "Merge failed upstream",
      },
      "chat-target",
    )).toEqual({
      chatId: "chat-target",
      kind: "merge",
      phase: "error",
      sourceLabels: ["Source A", "Source B"],
      previewTitle: "Merge: Source A + Source B",
      previewIntent: "Combine the verified findings.",
      errorMessage: "Merge failed upstream",
    })
  })

  test("ignores cleanup for other chats", () => {
    expect(clearPendingSessionBootstrapAfterAttempt(
      pendingBootstrap("fork", "compacting"),
      "chat-other",
    )).toEqual(pendingBootstrap("fork", "compacting"))
  })
})
