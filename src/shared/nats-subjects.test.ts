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
    expect(snapshotSubject({ type: "sidebar" })).toBe("kanna.snap.sidebar")
  })

  test("local-projects", () => {
    expect(snapshotSubject({ type: "local-projects" })).toBe("kanna.snap.local-projects")
  })

  test("update", () => {
    expect(snapshotSubject({ type: "update" })).toBe("kanna.snap.update")
  })

  test("chat with chatId", () => {
    expect(snapshotSubject({ type: "chat", chatId: "abc-123" })).toBe("kanna.snap.chat.abc-123")
  })

  test("terminal with terminalId", () => {
    expect(snapshotSubject({ type: "terminal", terminalId: "term-456" })).toBe("kanna.snap.terminal.term-456")
  })
})

describe("terminalEventSubject", () => {
  test("generates correct subject", () => {
    expect(terminalEventSubject("term-789")).toBe("kanna.evt.terminal.term-789")
  })
})

describe("commandSubject", () => {
  test("generates correct subject", () => {
    expect(commandSubject("chat.send")).toBe("kanna.cmd.chat.send")
  })

  test("system commands", () => {
    expect(commandSubject("system.ping")).toBe("kanna.cmd.system.ping")
  })
})

describe("wildcards", () => {
  test("ALL_SNAPSHOTS", () => {
    expect(ALL_SNAPSHOTS).toBe("kanna.snap.>")
  })

  test("ALL_TERMINAL_EVENTS", () => {
    expect(ALL_TERMINAL_EVENTS).toBe("kanna.evt.terminal.>")
  })

  test("ALL_COMMANDS", () => {
    expect(ALL_COMMANDS).toBe("kanna.cmd.>")
  })
})
