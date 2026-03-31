import { describe, test, expect } from "bun:test"
import { computeUnifiedDiff } from "./FileContentView"

describe("computeUnifiedDiff", () => {
  test("identical strings produce all context lines", () => {
    const result = computeUnifiedDiff("a\nb\nc", "a\nb\nc")
    expect(result).toEqual([
      { type: "context", content: " a" },
      { type: "context", content: " b" },
      { type: "context", content: " c" },
    ])
  })

  test("complete replacement", () => {
    const result = computeUnifiedDiff("old", "new")
    expect(result).toEqual([
      { type: "removed", content: "-old" },
      { type: "added", content: "+new" },
    ])
  })

  test("single line edit in multi-line content", () => {
    const result = computeUnifiedDiff("a\nb\nc", "a\nB\nc")
    expect(result).toEqual([
      { type: "context", content: " a" },
      { type: "removed", content: "-b" },
      { type: "added", content: "+B" },
      { type: "context", content: " c" },
    ])
  })

  test("multi-line additions", () => {
    const result = computeUnifiedDiff("a\nc", "a\nb1\nb2\nc")
    expect(result).toEqual([
      { type: "context", content: " a" },
      { type: "added", content: "+b1" },
      { type: "added", content: "+b2" },
      { type: "context", content: " c" },
    ])
  })

  test("multi-line deletions", () => {
    const result = computeUnifiedDiff("a\nb1\nb2\nc", "a\nc")
    expect(result).toEqual([
      { type: "context", content: " a" },
      { type: "removed", content: "-b1" },
      { type: "removed", content: "-b2" },
      { type: "context", content: " c" },
    ])
  })

  test("empty old string (all additions)", () => {
    const result = computeUnifiedDiff("", "a\nb")
    expect(result).toEqual([
      { type: "added", content: "+a" },
      { type: "added", content: "+b" },
    ])
  })

  test("empty new string (all removals)", () => {
    const result = computeUnifiedDiff("a\nb", "")
    expect(result).toEqual([
      { type: "removed", content: "-a" },
      { type: "removed", content: "-b" },
    ])
  })

  test("both empty strings produce empty result", () => {
    const result = computeUnifiedDiff("", "")
    expect(result).toEqual([])
  })
})
