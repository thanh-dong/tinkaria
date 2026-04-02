import { describe, expect, test } from "bun:test"
import viteConfig from "../../vite.config"

describe("vite dev watch config", () => {
  test("ignores unrelated markdown files and the tauri shell tree", () => {
    expect(viteConfig.server?.watch?.ignored).toEqual([
      "**/*.md",
      "**/*.markdown",
      "**/*.mdx",
      "**/src-tauri/**",
    ])
  })
})
