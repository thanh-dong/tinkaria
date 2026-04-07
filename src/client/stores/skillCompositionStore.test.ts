import { describe, test, expect, afterEach } from "bun:test"
import {
  useSkillCompositionStore,
  parseSkillsFromContent,
  sortSkillsByFrequency,
  getSkillPrefix,
  formatSkillCommand,
  computeSkillInsertion,
} from "./skillCompositionStore"

afterEach(() => {
  useSkillCompositionStore.setState({ usageCounts: {}, ribbonVisible: true })
})

describe("parseSkillsFromContent", () => {
  test("returns null skills for plain content", () => {
    const result = parseSkillsFromContent("just a normal message")
    expect(result).toEqual({ skills: null, content: "just a normal message" })
  })

  test("parses single skill from content", () => {
    const result = parseSkillsFromContent("[Skills: /c3]\n\ncheck the auth module")
    expect(result).toEqual({ skills: ["c3"], content: "check the auth module" })
  })

  test("parses multiple skills from content", () => {
    const result = parseSkillsFromContent("[Skills: /c3, /frontend-design]\n\nbuild the UI")
    expect(result).toEqual({ skills: ["c3", "frontend-design"], content: "build the UI" })
  })

  test("handles content with no trailing newlines after prefix", () => {
    const result = parseSkillsFromContent("[Skills: /commit]")
    expect(result).toEqual({ skills: ["commit"], content: "" })
  })

  test("preserves multiline content after skill prefix", () => {
    const result = parseSkillsFromContent("[Skills: /c3]\n\nline one\nline two\nline three")
    expect(result).toEqual({ skills: ["c3"], content: "line one\nline two\nline three" })
  })
})

describe("usageCounts", () => {
  test("recordUsage increments counts for each skill", () => {
    const store = useSkillCompositionStore.getState()
    store.recordUsage(["c3", "commit"])
    const state = useSkillCompositionStore.getState()
    expect(state.usageCounts["c3"]).toBe(1)
    expect(state.usageCounts["commit"]).toBe(1)
  })

  test("recordUsage accumulates over multiple calls", () => {
    const store = useSkillCompositionStore.getState()
    store.recordUsage(["c3"])
    store.recordUsage(["c3", "commit"])
    store.recordUsage(["c3"])
    const state = useSkillCompositionStore.getState()
    expect(state.usageCounts["c3"]).toBe(3)
    expect(state.usageCounts["commit"]).toBe(1)
  })

  test("recordUsage with empty array is a no-op", () => {
    const store = useSkillCompositionStore.getState()
    store.recordUsage([])
    expect(useSkillCompositionStore.getState().usageCounts).toEqual({})
  })
})

describe("sortSkillsByFrequency", () => {
  test("sorts skills by descending usage count", () => {
    const skills = ["commit", "c3", "review-pr"]
    const counts: Record<string, number> = { c3: 5, "review-pr": 2, commit: 0 }
    expect(sortSkillsByFrequency(skills, counts)).toEqual(["c3", "review-pr", "commit"])
  })

  test("preserves original order for skills with equal counts", () => {
    const skills = ["commit", "c3", "review-pr"]
    const counts: Record<string, number> = {}
    expect(sortSkillsByFrequency(skills, counts)).toEqual(["commit", "c3", "review-pr"])
  })

  test("handles mixed known and unknown counts", () => {
    const skills = ["alpha", "beta", "gamma"]
    const counts: Record<string, number> = { gamma: 3 }
    expect(sortSkillsByFrequency(skills, counts)).toEqual(["gamma", "alpha", "beta"])
  })
})

describe("getSkillPrefix", () => {
  test("returns / for claude", () => {
    expect(getSkillPrefix("claude")).toBe("/")
  })

  test("returns $ for codex", () => {
    expect(getSkillPrefix("codex")).toBe("$")
  })
})

describe("formatSkillCommand", () => {
  test("formats claude skill with slash prefix", () => {
    expect(formatSkillCommand("c3", "claude")).toBe("/c3")
  })

  test("formats codex skill with dollar prefix", () => {
    expect(formatSkillCommand("commit", "codex")).toBe("$commit")
  })
})

describe("computeSkillInsertion", () => {
  test("inserts at the beginning of empty text", () => {
    const result = computeSkillInsertion("", 0, 0, "/c3")
    expect(result).toEqual({ value: "/c3 ", cursorPosition: 4 })
  })

  test("inserts at cursor position in middle of text", () => {
    const result = computeSkillInsertion("hello world", 6, 6, "/c3")
    expect(result).toEqual({ value: "hello /c3 world", cursorPosition: 10 })
  })

  test("adds leading space when no space before cursor", () => {
    const result = computeSkillInsertion("build", 5, 5, "/c3")
    expect(result).toEqual({ value: "build /c3 ", cursorPosition: 10 })
  })

  test("no extra space when already preceded by space", () => {
    const result = computeSkillInsertion("build ", 6, 6, "/c3")
    expect(result).toEqual({ value: "build /c3 ", cursorPosition: 10 })
  })

  test("no extra space when preceded by newline", () => {
    const result = computeSkillInsertion("line1\n", 6, 6, "/c3")
    expect(result).toEqual({ value: "line1\n/c3 ", cursorPosition: 10 })
  })

  test("replaces selected text", () => {
    const result = computeSkillInsertion("hello world", 6, 11, "/c3")
    expect(result).toEqual({ value: "hello /c3 ", cursorPosition: 10 })
  })

  test("works with codex dollar prefix", () => {
    const result = computeSkillInsertion("", 0, 0, "$commit")
    expect(result).toEqual({ value: "$commit ", cursorPosition: 8 })
  })
})

describe("ribbonVisible", () => {
  test("defaults to true", () => {
    expect(useSkillCompositionStore.getState().ribbonVisible).toBe(true)
  })

  test("toggleRibbon flips visibility", () => {
    useSkillCompositionStore.getState().toggleRibbon()
    expect(useSkillCompositionStore.getState().ribbonVisible).toBe(false)
    useSkillCompositionStore.getState().toggleRibbon()
    expect(useSkillCompositionStore.getState().ribbonVisible).toBe(true)
  })
})
