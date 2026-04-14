import { describe, test, expect, afterEach } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { codeExtension } from "./server"

let tempDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "code-ext-test-"))
  tempDirs.push(dir)
  return dir
}

function getManifestHandler(projectPath: string) {
  const routes = codeExtension.routes({ projectPath })
  const route = routes.find((r) => r.path === "/manifest" && r.method === "GET")
  if (!route) throw new Error("No /manifest route found")
  return route.handler
}

async function callManifest(projectPath: string): Promise<{ status: number; body: unknown }> {
  const handler = getManifestHandler(projectPath)
  const req = new Request(`http://localhost/api/ext/code/manifest?projectPath=${encodeURIComponent(projectPath)}`)
  const res = await handler(req, {})
  const body = await res.json()
  return { status: res.status, body }
}

afterEach(async () => {
  for (const dir of tempDirs) {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
  tempDirs = []
})

describe("code extension", () => {
  test("has correct manifest metadata", () => {
    expect(codeExtension.id).toBe("code")
    expect(codeExtension.name).toBe("Code")
    expect(codeExtension.detect).toContain("package.json")
    expect(codeExtension.detect).toContain("Cargo.toml")
    expect(codeExtension.detect).toContain("go.mod")
    expect(codeExtension.detect).toContain("pyproject.toml")
  })

  test("exposes /manifest GET route", () => {
    const routes = codeExtension.routes({ projectPath: "/tmp/fake" })
    const manifest = routes.find((r) => r.path === "/manifest")
    expect(manifest).toBeDefined()
    expect(manifest!.method).toBe("GET")
  })
})

describe("/manifest with package.json", () => {
  test("parses valid package.json", async () => {
    const dir = await makeTempDir()
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({
        name: "test",
        version: "1.0.0",
        scripts: { dev: "vite" },
        dependencies: { react: "^19" },
        devDependencies: { typescript: "^5" },
      }),
    )

    const { status, body } = await callManifest(dir)
    expect(status).toBe(200)

    const result = body as { manifests: Array<Record<string, unknown>> }
    expect(result.manifests).toHaveLength(1)

    const m = result.manifests[0]
    expect(m.language).toBe("javascript")
    expect(m.name).toBe("test")
    expect(m.version).toBe("1.0.0")
    expect(m.scripts).toEqual({ dev: "vite" })
    expect(m.dependencies).toEqual({ react: "^19" })
    expect(m.devDependencies).toEqual({ typescript: "^5" })
  })
})

describe("/manifest with no manifest files", () => {
  test("returns empty manifests array", async () => {
    const dir = await makeTempDir()

    const { status, body } = await callManifest(dir)
    expect(status).toBe(200)

    const result = body as { manifests: unknown[] }
    expect(result.manifests).toEqual([])
  })
})

describe("/manifest with malformed JSON", () => {
  test("handles malformed package.json gracefully", async () => {
    const dir = await makeTempDir()
    await writeFile(join(dir, "package.json"), "{ not valid json !!!")

    const { status, body } = await callManifest(dir)
    expect(status).toBe(200)

    const result = body as { manifests: Array<Record<string, unknown>> }
    expect(result.manifests).toHaveLength(1)
    expect(result.manifests[0].error).toBeDefined()
    expect(result.manifests[0].language).toBe("javascript")
  })
})

describe("/manifest with Cargo.toml", () => {
  test("parses valid Cargo.toml", async () => {
    const dir = await makeTempDir()
    await writeFile(
      join(dir, "Cargo.toml"),
      `[package]
name = "my-crate"
version = "0.3.1"
edition = "2021"

[dependencies]
serde = "1.0"
tokio = "1.28"
`,
    )

    const { status, body } = await callManifest(dir)
    expect(status).toBe(200)

    const result = body as { manifests: Array<Record<string, unknown>> }
    expect(result.manifests).toHaveLength(1)

    const m = result.manifests[0]
    expect(m.language).toBe("rust")
    expect(m.name).toBe("my-crate")
    expect(m.version).toBe("0.3.1")
    expect(m.dependencies).toEqual({ serde: "1.0", tokio: "1.28" })
  })
})

describe("/manifest with go.mod", () => {
  test("parses valid go.mod", async () => {
    const dir = await makeTempDir()
    await writeFile(
      join(dir, "go.mod"),
      `module github.com/user/myapp

go 1.21

require (
\tgolang.org/x/text v0.14.0
\tgithub.com/gin-gonic/gin v1.9.1
)
`,
    )

    const { status, body } = await callManifest(dir)
    expect(status).toBe(200)

    const result = body as { manifests: Array<Record<string, unknown>> }
    expect(result.manifests).toHaveLength(1)

    const m = result.manifests[0]
    expect(m.language).toBe("go")
    expect(m.name).toBe("github.com/user/myapp")
    expect(m.version).toBe("1.21")
    expect(m.dependencies).toEqual({
      "golang.org/x/text": "v0.14.0",
      "github.com/gin-gonic/gin": "v1.9.1",
    })
  })
})

describe("/manifest with multiple manifests", () => {
  test("returns all detected manifests", async () => {
    const dir = await makeTempDir()
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "frontend", version: "2.0.0" }),
    )
    await writeFile(
      join(dir, "go.mod"),
      `module github.com/user/backend

go 1.22
`,
    )

    const { status, body } = await callManifest(dir)
    expect(status).toBe(200)

    const result = body as { manifests: Array<Record<string, unknown>> }
    expect(result.manifests).toHaveLength(2)

    const languages = result.manifests.map((m) => m.language)
    expect(languages).toContain("javascript")
    expect(languages).toContain("go")
  })
})
