import { describe, expect, test } from "bun:test"
import { highlight } from "sugar-high"
import { getLanguagePreset } from "./syntaxPresets"

function hasToken(html: string, tokenClass: string): boolean {
  return html.includes(`sh__token--${tokenClass}`)
}

describe("getLanguagePreset", () => {
  test("returns preset for known languages", () => {
    expect(getLanguagePreset("go")).toBeDefined()
    expect(getLanguagePreset("java")).toBeDefined()
    expect(getLanguagePreset("bash")).toBeDefined()
    expect(getLanguagePreset("sql")).toBeDefined()
    expect(getLanguagePreset("ruby")).toBeDefined()
  })

  test("returns same preset for language aliases", () => {
    expect(getLanguagePreset("sh")).toBe(getLanguagePreset("bash"))
    expect(getLanguagePreset("shell")).toBe(getLanguagePreset("bash"))
    expect(getLanguagePreset("rb")).toBe(getLanguagePreset("ruby"))
    expect(getLanguagePreset("golang")).toBe(getLanguagePreset("go"))
    expect(getLanguagePreset("kt")).toBe(getLanguagePreset("kotlin"))
  })

  test("returns undefined for unknown languages", () => {
    expect(getLanguagePreset("brainfuck")).toBeUndefined()
  })
})

describe("bash preset highlights # comments", () => {
  test("recognizes hash comments", () => {
    const preset = getLanguagePreset("bash")!
    const result = highlight("echo hello # this is a comment", preset)
    expect(hasToken(result, "comment")).toBe(true)
  })

  test("recognizes bash keywords", () => {
    const preset = getLanguagePreset("bash")!
    const result = highlight("if [ -f file ]; then\n  echo ok\nfi", preset)
    expect(hasToken(result, "keyword")).toBe(true)
  })
})

describe("go preset highlights correctly", () => {
  test("recognizes go keywords", () => {
    const preset = getLanguagePreset("go")!
    const result = highlight("func main() { defer close(ch) }", preset)
    expect(hasToken(result, "keyword")).toBe(true)
  })
})

describe("sql preset highlights -- comments", () => {
  test("recognizes double-dash comments", () => {
    const preset = getLanguagePreset("sql")!
    const result = highlight("SELECT * FROM users -- get all users", preset)
    expect(hasToken(result, "comment")).toBe(true)
  })

  test("recognizes sql keywords", () => {
    const preset = getLanguagePreset("sql")!
    const result = highlight("SELECT id FROM users WHERE active = true", preset)
    expect(hasToken(result, "keyword")).toBe(true)
  })
})

describe("ruby preset highlights # comments", () => {
  test("recognizes hash comments", () => {
    const preset = getLanguagePreset("ruby")!
    const result = highlight("puts 'hello' # comment", preset)
    expect(hasToken(result, "comment")).toBe(true)
  })
})
