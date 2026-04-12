import { describe, expect, test } from "bun:test"
import { getToolErrorHint } from "./ToolCallMessage"

describe("getToolErrorHint", () => {
  test("returns permission hint for permission denied errors", () => {
    expect(getToolErrorHint("Error: EACCES: permission denied, open '/etc/shadow'"))
      .toBe("The tool couldn't access a file. Check file permissions.")
  })

  test("returns command hint for command not found errors", () => {
    expect(getToolErrorHint("bash: foobar: command not found"))
      .toBe("The command isn't installed or isn't in PATH.")
  })

  test("returns timeout hint for timeout errors", () => {
    expect(getToolErrorHint("Operation timed out after 30000ms"))
      .toBe("The operation took too long.")
  })

  test("returns timeout hint for 'timeout' variant", () => {
    expect(getToolErrorHint("Request timeout exceeded"))
      .toBe("The operation took too long.")
  })

  test("returns file hint for ENOENT errors", () => {
    expect(getToolErrorHint("Error: ENOENT: no such file or directory, open '/missing'"))
      .toBe("A referenced file or directory doesn't exist.")
  })

  test("returns null for unrecognized hard errors", () => {
    expect(getToolErrorHint("TypeError: Cannot read properties of undefined"))
      .toBeNull()
  })

  test("returns null for empty strings", () => {
    expect(getToolErrorHint("")).toBeNull()
  })
})
