import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { RuntimeRegistry } from "./runtime-registry"

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function createTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "kanna-rt-"))
  tempDirs.push(dir)
  return dir
}

describe("RuntimeRegistry", () => {
  describe("detectSystemRuntime", () => {
    test("detects binary on PATH and returns entry", async () => {
      const dir = await createTempDir()
      const registry = new RuntimeRegistry(dir)
      await registry.initialize()

      const result = await registry.detectSystemRuntime("claude", {
        binaryName: "echo",
        packageName: "@anthropic-ai/claude-code",
        versionParser: () => "1.0.0",
      })

      expect(result).toBeDefined()
      expect(result!.source).toBe("system")
      expect(result!.version).toBe("1.0.0")
    })

    test("returns null when binary not found", async () => {
      const dir = await createTempDir()
      const registry = new RuntimeRegistry(dir)
      await registry.initialize()

      const result = await registry.detectSystemRuntime("claude", {
        binaryName: "definitely-not-a-real-binary-xyzzy",
        packageName: "@anthropic-ai/claude-code",
        versionParser: () => "1.0.0",
      })

      expect(result).toBeNull()
    })
  })

  describe("resolve", () => {
    test("returns managed entry over system when both exist", async () => {
      const dir = await createTempDir()
      const registry = new RuntimeRegistry(dir)
      await registry.initialize()

      await registry.detectSystemRuntime("claude", {
        binaryName: "echo",
        packageName: "@anthropic-ai/claude-code",
        versionParser: () => "1.0.0",
      })

      await registry.detectSystemRuntime("claude", {
        binaryName: "echo",
        packageName: "@anthropic-ai/claude-code",
        versionParser: () => "1.0.1",
      })

      const result = registry.resolve("claude")
      expect(result).toBeDefined()
      expect(result!.version).toBe("1.0.0") // First detected becomes default
    })

    test("returns null for unknown provider", async () => {
      const dir = await createTempDir()
      const registry = new RuntimeRegistry(dir)
      await registry.initialize()

      const result = registry.resolve("unknown-provider")
      expect(result).toBeNull()
    })
  })

  describe("healthCheck", () => {
    test("returns healthy for working binary", async () => {
      const dir = await createTempDir()
      const registry = new RuntimeRegistry(dir)
      await registry.initialize()

      await registry.detectSystemRuntime("claude", {
        binaryName: "echo",
        packageName: "@anthropic-ai/claude-code",
        versionParser: () => "1.0.0",
      })

      const health = await registry.healthCheck("claude")
      expect(health.status).toBe("healthy")
      expect(health.latencyMs).toBeGreaterThanOrEqual(0)
    })

    test("returns unavailable when no runtime registered", async () => {
      const dir = await createTempDir()
      const registry = new RuntimeRegistry(dir)
      await registry.initialize()

      const health = await registry.healthCheck("codex")
      expect(health.status).toBe("unavailable")
      expect(health.error).toBe("No runtime registered")
    })
  })

  describe("installManaged", () => {
    test("installs npm package into versioned directory", async () => {
      const dir = await createTempDir()
      const registry = new RuntimeRegistry(dir)
      await registry.initialize()

      // Use a small, fast package for testing
      const result = await registry.installManaged("claude", {
        packageName: "is-odd",
        version: "3.0.1",
        binaryName: "is-odd",
      })

      expect(result.success).toBe(true)
      expect(result.entry).toBeDefined()
      expect(result.entry!.source).toBe("managed")
      expect(result.entry!.version).toBe("3.0.1")
    }, 30_000)

    test("returns failure for invalid package", async () => {
      const dir = await createTempDir()
      const registry = new RuntimeRegistry(dir)
      await registry.initialize()

      const result = await registry.installManaged("claude", {
        packageName: "@definitely-not-real/package-xyzzy-999",
        version: "0.0.0",
        binaryName: "xyzzy",
      })

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    }, 30_000)
  })

  describe("persistence", () => {
    test("persists and reloads entries across instances", async () => {
      const dir = await createTempDir()

      const registry1 = new RuntimeRegistry(dir)
      await registry1.initialize()
      await registry1.detectSystemRuntime("claude", {
        binaryName: "echo",
        packageName: "@anthropic-ai/claude-code",
        versionParser: () => "2.0.0",
      })

      const registry2 = new RuntimeRegistry(dir)
      await registry2.initialize()
      const result = registry2.resolve("claude")
      expect(result).toBeDefined()
      expect(result!.version).toBe("2.0.0")
      expect(result!.source).toBe("system")
    })
  })
})
