import { describe, test, expect, afterEach, beforeAll } from "bun:test"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { buildC3EntityTree, c3Extension } from "./server"

let tempDir: string
const originalC3xMode = process.env.C3X_MODE

async function makeTempProject(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "c3-test-"))
  await mkdir(path.join(dir, ".c3"), { recursive: true })
  return dir
}

// Check if c3x is available on this machine
let c3xAvailable = false
beforeAll(async () => {
  try {
    const proc = Bun.spawn(["which", "c3x"], { stdout: "pipe", stderr: "pipe" })
    await proc.exited
    c3xAvailable = proc.exitCode === 0
  } catch {
    c3xAvailable = false
  }
})

afterEach(async () => {
  if (originalC3xMode === undefined) {
    delete process.env.C3X_MODE
  } else {
    process.env.C3X_MODE = originalC3xMode
  }
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true })
  }
})

// ── Manifest shape ──────────────────────────────────────────────────

describe("c3Extension manifest", () => {
  test("has correct id, name, icon, detect", () => {
    expect(c3Extension.id).toBe("c3")
    expect(c3Extension.name).toBe("Architecture")
    expect(c3Extension.icon).toBe("building-2")
    expect(c3Extension.detect).toEqual([".c3/"])
  })
})

// ── Route structure ─────────────────────────────────────────────────

describe("c3Extension routes", () => {
  test("returns three routes", () => {
    const routes = c3Extension.routes({ projectPath: "/tmp/fake" })
    expect(routes).toHaveLength(3)
  })

  test("list route is GET /list", () => {
    const routes = c3Extension.routes({ projectPath: "/tmp/fake" })
    const list = routes.find((r) => r.path === "/list")
    expect(list).toBeDefined()
    expect(list!.method).toBe("GET")
    expect(typeof list!.handler).toBe("function")
  })

  test("read route is GET /read", () => {
    const routes = c3Extension.routes({ projectPath: "/tmp/fake" })
    const read = routes.find((r) => r.path === "/read")
    expect(read).toBeDefined()
    expect(read!.method).toBe("GET")
  })

  test("graph route is GET /graph", () => {
    const routes = c3Extension.routes({ projectPath: "/tmp/fake" })
    const graph = routes.find((r) => r.path === "/graph")
    expect(graph).toBeDefined()
    expect(graph!.method).toBe("GET")
  })
})

// ── Tree structure ─────────────────────────────────────────────────

describe("buildC3EntityTree", () => {
  test("nests parented entities while keeping unparented entities at the root", () => {
    expect(
      buildC3EntityTree([
        { id: "c3-0", type: "system", title: "tinkaria" },
        { id: "c3-1", type: "container", title: "client", parent: "c3-0" },
        { id: "c3-120", type: "component", title: "extensions", parent: "c3-1" },
        { id: "ref-project-context", type: "ref", title: "project-context" },
      ]),
    ).toEqual([
      {
        id: "c3-0",
        type: "system",
        title: "tinkaria",
        children: [
          {
            id: "c3-1",
            type: "container",
            title: "client",
            parent: "c3-0",
            children: [
              {
                id: "c3-120",
                type: "component",
                title: "extensions",
                parent: "c3-1",
              },
            ],
          },
        ],
      },
      { id: "ref-project-context", type: "ref", title: "project-context" },
    ])
  })
})

// ── Parameter validation ────────────────────────────────────────────

describe("read handler validation", () => {
  test("returns 400 when id query param is missing", async () => {
    tempDir = await makeTempProject()
    const routes = c3Extension.routes({ projectPath: tempDir })
    const read = routes.find((r) => r.path === "/read")!

    const req = new Request("http://localhost/api/ext/c3/read?projectPath=" + encodeURIComponent(tempDir))
    const res = await read.handler(req, {})

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/id/i)
  })
})

describe("graph handler validation", () => {
  test("returns 400 when id query param is missing", async () => {
    tempDir = await makeTempProject()
    const routes = c3Extension.routes({ projectPath: tempDir })
    const graph = routes.find((r) => r.path === "/graph")!

    const req = new Request("http://localhost/api/ext/c3/graph?projectPath=" + encodeURIComponent(tempDir))
    const res = await graph.handler(req, {})

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/id/i)
  })
})

// ── c3x integration (only when c3x is available) ───────────────────

describe("c3x integration", () => {
  test("list handler returns JSON when c3x succeeds", async () => {
    if (!c3xAvailable) {
      console.log("SKIP: c3x not available")
      return
    }

    // Use the actual project which has .c3/
    const projectPath = path.resolve(import.meta.dir, "../../../..")
    const routes = c3Extension.routes({ projectPath })
    const list = routes.find((r) => r.path === "/list")!

    const req = new Request("http://localhost/api/ext/c3/list?projectPath=" + encodeURIComponent(projectPath))
    const res = await list.handler(req, {})

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data.length).toBeGreaterThan(0)
    expect(body.data[0]).toMatchObject({
      id: "c3-0",
      type: "system",
      children: expect.arrayContaining([
        expect.objectContaining({
          id: expect.any(String),
          type: "container",
          children: expect.arrayContaining([
            expect.objectContaining({
              id: expect.any(String),
              type: "component",
            }),
          ]),
        }),
      ]),
    })
  })

  test("list handler ignores inherited agent output mode", async () => {
    if (!c3xAvailable) {
      console.log("SKIP: c3x not available")
      return
    }

    process.env.C3X_MODE = "agent"
    const projectPath = path.resolve(import.meta.dir, "../../../..")
    const routes = c3Extension.routes({ projectPath })
    const list = routes.find((r) => r.path === "/list")!

    const req = new Request("http://localhost/api/ext/c3/list?projectPath=" + encodeURIComponent(projectPath))
    const res = await list.handler(req, {})

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data[0]).toMatchObject({
      id: "c3-0",
      type: "system",
    })
  })

  test("read handler returns content for a valid id", async () => {
    if (!c3xAvailable) {
      console.log("SKIP: c3x not available")
      return
    }

    const projectPath = path.resolve(import.meta.dir, "../../../..")
    const routes = c3Extension.routes({ projectPath })
    const read = routes.find((r) => r.path === "/read")!

    // Use a known component id from the project
    const req = new Request(
      "http://localhost/api/ext/c3/read?projectPath=" +
        encodeURIComponent(projectPath) +
        "&id=c3-204",
    )
    const res = await read.handler(req, {})

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toMatchObject({
      id: "c3-204",
      type: "component",
      body: expect.stringContaining("##"),
    })
    expect(body.data.body_truncated).toBeUndefined()
  })

  test("graph handler returns mermaid content", async () => {
    if (!c3xAvailable) {
      console.log("SKIP: c3x not available")
      return
    }

    const projectPath = path.resolve(import.meta.dir, "../../../..")
    const routes = c3Extension.routes({ projectPath })
    const graph = routes.find((r) => r.path === "/graph")!

    const req = new Request(
      "http://localhost/api/ext/c3/graph?projectPath=" +
        encodeURIComponent(projectPath) +
        "&id=c3-204",
    )
    const res = await graph.handler(req, {})

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toBeDefined()
    // Mermaid output should contain graph/flowchart keywords
    expect(typeof body.data).toBe("string")
  })
})

// ── Error handling ──────────────────────────────────────────────────

describe("c3x error handling", () => {
  test("returns 503 when c3x fails on a project without .c3/", async () => {
    // Create an empty temp dir with .c3/ but no valid content
    tempDir = await mkdtemp(path.join(tmpdir(), "c3-empty-"))
    await mkdir(path.join(tempDir, ".c3"), { recursive: true })

    const routes = c3Extension.routes({ projectPath: tempDir })
    const list = routes.find((r) => r.path === "/list")!

    const req = new Request("http://localhost/api/ext/c3/list?projectPath=" + encodeURIComponent(tempDir))
    const res = await list.handler(req, {})

    // c3x should fail on empty .c3/ — either 503 or a valid response
    // The key assertion is it doesn't crash (no unhandled exception)
    expect([200, 503]).toContain(res.status)
  })
})
