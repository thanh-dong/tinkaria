import { describe, expect, test } from "bun:test"
import viteConfig, { getAllowedHosts } from "../../vite.config"

describe("vite dev watch config", () => {
  test("ignores unrelated markdown files", () => {
    expect(viteConfig.server?.watch?.ignored).toEqual([
      "**/*.md",
      "**/*.markdown",
      "**/*.mdx",
    ])
  })
})

describe("getAllowedHosts", () => {
  test("uses vite defaults when no custom hosts are configured", () => {
    const original = process.env.KANNA_DEV_ALLOWED_HOSTS
    delete process.env.KANNA_DEV_ALLOWED_HOSTS

    try {
      expect(getAllowedHosts()).toBeUndefined()
    } finally {
      if (original === undefined) {
        delete process.env.KANNA_DEV_ALLOWED_HOSTS
      } else {
        process.env.KANNA_DEV_ALLOWED_HOSTS = original
      }
    }
  })

  test("accepts explicit host lists and true passthrough", () => {
    const original = process.env.KANNA_DEV_ALLOWED_HOSTS

    try {
      process.env.KANNA_DEV_ALLOWED_HOSTS = `["devbox.lan","preview.local"]`
      expect(getAllowedHosts()).toEqual(["devbox.lan", "preview.local"])

      process.env.KANNA_DEV_ALLOWED_HOSTS = "true"
      expect(getAllowedHosts()).toBe(true)
    } finally {
      if (original === undefined) {
        delete process.env.KANNA_DEV_ALLOWED_HOSTS
      } else {
        process.env.KANNA_DEV_ALLOWED_HOSTS = original
      }
    }
  })
})
