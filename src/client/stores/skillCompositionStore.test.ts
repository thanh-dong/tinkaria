import { describe, test, expect, afterEach } from "bun:test"
import { useSkillCompositionStore, parseSkillsFromContent, formatContentWithSkills, sortSkillsByFrequency } from "./skillCompositionStore"

afterEach(() => {
  useSkillCompositionStore.setState({ selections: {}, usageCounts: {} })
})

describe("skillCompositionStore", () => {
  test("initially has no selections", () => {
    const state = useSkillCompositionStore.getState()
    expect(state.getSelectedSkills("chat-1")).toEqual([])
  })

  test("toggleSkill adds a skill", () => {
    const store = useSkillCompositionStore.getState()
    store.toggleSkill("chat-1", "c3")
    expect(useSkillCompositionStore.getState().getSelectedSkills("chat-1")).toEqual(["c3"])
  })

  test("toggleSkill removes a skill when already selected", () => {
    const store = useSkillCompositionStore.getState()
    store.toggleSkill("chat-1", "c3")
    store.toggleSkill("chat-1", "c3")
    expect(useSkillCompositionStore.getState().getSelectedSkills("chat-1")).toEqual([])
  })

  test("toggleSkill handles multiple skills", () => {
    const store = useSkillCompositionStore.getState()
    store.toggleSkill("chat-1", "c3")
    store.toggleSkill("chat-1", "frontend-design")
    store.toggleSkill("chat-1", "commit")
    expect(useSkillCompositionStore.getState().getSelectedSkills("chat-1")).toEqual([
      "c3",
      "frontend-design",
      "commit",
    ])
  })

  test("clearSkills removes all skills for a chat", () => {
    const store = useSkillCompositionStore.getState()
    store.toggleSkill("chat-1", "c3")
    store.toggleSkill("chat-1", "frontend-design")
    store.clearSkills("chat-1")
    expect(useSkillCompositionStore.getState().getSelectedSkills("chat-1")).toEqual([])
  })

  test("selections are isolated per chat", () => {
    const store = useSkillCompositionStore.getState()
    store.toggleSkill("chat-1", "c3")
    store.toggleSkill("chat-2", "commit")
    expect(useSkillCompositionStore.getState().getSelectedSkills("chat-1")).toEqual(["c3"])
    expect(useSkillCompositionStore.getState().getSelectedSkills("chat-2")).toEqual(["commit"])
  })

  test("getSelectedSkills returns empty for unknown chat", () => {
    expect(useSkillCompositionStore.getState().getSelectedSkills("nonexistent")).toEqual([])
  })
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

describe("formatContentWithSkills", () => {
  test("returns content unchanged when no skills", () => {
    expect(formatContentWithSkills("hello", [])).toBe("hello")
  })

  test("prepends single skill", () => {
    expect(formatContentWithSkills("build it", ["c3"])).toBe("[Skills: /c3]\n\nbuild it")
  })

  test("prepends multiple skills", () => {
    expect(formatContentWithSkills("build it", ["c3", "frontend-design"])).toBe(
      "[Skills: /c3, /frontend-design]\n\nbuild it"
    )
  })

  test("roundtrips through parse", () => {
    const original = "build the thing"
    const skills = ["c3", "frontend-design", "commit"]
    const formatted = formatContentWithSkills(original, skills)
    const parsed = parseSkillsFromContent(formatted)
    expect(parsed).toEqual({ skills, content: original })
  })
})
