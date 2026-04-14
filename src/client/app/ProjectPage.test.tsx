import { describe, test, expect } from "bun:test"
import { ProjectPage } from "./ProjectPage"

describe("ProjectPage", () => {
  test("exports ProjectPage component", () => {
    expect(typeof ProjectPage).toBe("function")
  })
})
