import { describe, test, expect } from "bun:test"
import {
  snapshotSubject,
  terminalEventSubject,
  commandSubject,
  ALL_SNAPSHOTS,
  ALL_TERMINAL_EVENTS,
  ALL_COMMANDS,
} from "./nats-subjects"

describe("snapshotSubject", () => {
  test("sidebar", () => {
    expect(snapshotSubject({ type: "sidebar" })).toBe("runtime.snap.sidebar")
  })

  test("local-workspaces", () => {
    expect(snapshotSubject({ type: "local-workspaces" })).toBe("runtime.snap.local-workspaces")
  })

  test("update", () => {
    expect(snapshotSubject({ type: "update" })).toBe("runtime.snap.update")
  })

  test("chat with chatId", () => {
    expect(snapshotSubject({ type: "chat", chatId: "abc-123" })).toBe("runtime.snap.chat.abc-123")
  })

  test("terminal with terminalId", () => {
    expect(snapshotSubject({ type: "terminal", terminalId: "term-456" })).toBe("runtime.snap.terminal.term-456")
  })
})

describe("terminalEventSubject", () => {
  test("generates correct subject", () => {
    expect(terminalEventSubject("term-789")).toBe("runtime.evt.terminal.term-789")
  })
})

describe("commandSubject", () => {
  test("generates correct subject", () => {
    expect(commandSubject("chat.send")).toBe("runtime.cmd.chat.send")
  })

  test("system commands", () => {
    expect(commandSubject("system.ping")).toBe("runtime.cmd.system.ping")
  })
})

describe("wildcards", () => {
  test("ALL_SNAPSHOTS", () => {
    expect(ALL_SNAPSHOTS).toBe("runtime.snap.>")
  })

  test("ALL_TERMINAL_EVENTS", () => {
    expect(ALL_TERMINAL_EVENTS).toBe("runtime.evt.terminal.>")
  })

  test("ALL_COMMANDS", () => {
    expect(ALL_COMMANDS).toBe("runtime.cmd.>")
  })
})
