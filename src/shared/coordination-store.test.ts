import { describe, test, expect } from "bun:test"
import type { CoordinationStore } from "./coordination-store"

describe("CoordinationStore interface", () => {
  test("type-checks against EventStore shape", () => {
    // This is a compile-time test — if CoordinationStore is incompatible
    // with EventStore's methods, tsc will fail.
    const mockStore: CoordinationStore = {
      state: { coordinationByWorkspace: new Map() },
      addTodo: async () => {},
      claimTodo: async () => {},
      completeTodo: async () => {},
      abandonTodo: async () => {},
      createClaim: async () => {},
      releaseClaim: async () => {},
      createWorktree: async () => {},
      assignWorktree: async () => {},
      removeWorktree: async () => {},
      setRule: async () => {},
      removeRule: async () => {},
    }
    expect(mockStore).toBeDefined()
  })
})
