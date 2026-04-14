import { describe, test, expect, afterEach } from "bun:test"
import { mkdtemp, rm, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { createExtensionRouter } from "./extension-router"
import type { ServerExtension, DetectionResult } from "../shared/extension-types"

let tempDirs: string[] = []

afterEach(async () => {
  for (const d of tempDirs) await rm(d, { recursive: true, force: true })
  tempDirs = []
})

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "ext-router-test-"))
  tempDirs.push(dir)
  return dir
}

/** Minimal c3 extension stub for testing */
function makeC3Extension(overrides?: Partial<ServerExtension>): ServerExtension {
  return {
    id: "c3",
    name: "C3 Docs",
    icon: "book",
    detect: [".c3/"],
    routes(ctx) {
      return [
        {
          method: "GET",
          path: "/list",
          handler: async (_req, _params) =>
            new Response(JSON.stringify({ items: [], projectPath: ctx.projectPath }), {
              headers: { "Content-Type": "application/json" },
            }),
        },
        {
          method: "GET",
          path: "/read/:id",
          handler: async (_req, params) =>
            new Response(JSON.stringify({ id: params.id, projectPath: ctx.projectPath }), {
              headers: { "Content-Type": "application/json" },
            }),
        },
        {
          method: "POST",
          path: "/write",
          handler: async (req, _params) => {
            const body = await req.json()
            return new Response(JSON.stringify({ ok: true, body }), {
              headers: { "Content-Type": "application/json" },
            })
          },
        },
      ]
    },
    ...overrides,
  }
}

describe("extension-router", () => {
  describe("GET /api/ext/detect", () => {
    test("detects extensions when probe files exist", async () => {
      const dir = await makeTempDir()
      await mkdir(path.join(dir, ".c3"), { recursive: true })

      const router = createExtensionRouter([makeC3Extension()])
      const req = new Request(`http://localhost/api/ext/detect?projectPath=${encodeURIComponent(dir)}`)
      const res = await router(req)

      expect(res.status).toBe(200)
      const body: DetectionResult[] = await res.json()
      expect(body).toHaveLength(1)
      expect(body[0].extensionId).toBe("c3")
      expect(body[0].detected).toBe(true)
    })

    test("returns detected:false for empty directory", async () => {
      const dir = await makeTempDir()

      const router = createExtensionRouter([makeC3Extension()])
      const req = new Request(`http://localhost/api/ext/detect?projectPath=${encodeURIComponent(dir)}`)
      const res = await router(req)

      expect(res.status).toBe(200)
      const body: DetectionResult[] = await res.json()
      expect(body).toHaveLength(1)
      expect(body[0].extensionId).toBe("c3")
      expect(body[0].detected).toBe(false)
    })

    test("returns 400 when projectPath is missing", async () => {
      const router = createExtensionRouter([makeC3Extension()])
      const req = new Request("http://localhost/api/ext/detect")
      const res = await router(req)

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBeDefined()
    })
  })

  describe("extension route dispatch", () => {
    test("GET dispatches to correct extension handler", async () => {
      const dir = await makeTempDir()
      const router = createExtensionRouter([makeC3Extension()])
      const req = new Request(`http://localhost/api/ext/c3/list?projectPath=${encodeURIComponent(dir)}`)
      const res = await router(req)

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.items).toEqual([])
      expect(body.projectPath).toBe(dir)
    })

    test("GET with path params dispatches correctly", async () => {
      const dir = await makeTempDir()
      const router = createExtensionRouter([makeC3Extension()])
      const req = new Request(`http://localhost/api/ext/c3/read/c3-101?projectPath=${encodeURIComponent(dir)}`)
      const res = await router(req)

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.id).toBe("c3-101")
      expect(body.projectPath).toBe(dir)
    })

    test("POST route match works", async () => {
      const dir = await makeTempDir()
      const router = createExtensionRouter([makeC3Extension()])
      const req = new Request(`http://localhost/api/ext/c3/write?projectPath=${encodeURIComponent(dir)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "hello" }),
      })
      const res = await router(req)

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.ok).toBe(true)
      expect(body.body.content).toBe("hello")
    })

    test("returns 404 for unknown extension ID", async () => {
      const dir = await makeTempDir()
      const router = createExtensionRouter([makeC3Extension()])
      const req = new Request(`http://localhost/api/ext/unknown/list?projectPath=${encodeURIComponent(dir)}`)
      const res = await router(req)

      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error).toBeDefined()
    })

    test("returns 400 when projectPath is missing on extension route", async () => {
      const router = createExtensionRouter([makeC3Extension()])
      const req = new Request("http://localhost/api/ext/c3/list")
      const res = await router(req)

      expect(res.status).toBe(400)
    })

    test("returns 404 for method mismatch (GET on POST-only route)", async () => {
      const dir = await makeTempDir()
      const router = createExtensionRouter([makeC3Extension()])
      // /write is POST-only, try GET
      const req = new Request(`http://localhost/api/ext/c3/write?projectPath=${encodeURIComponent(dir)}`)
      const res = await router(req)

      expect(res.status).toBe(404)
    })

    test("returns 404 for route not defined on extension", async () => {
      const dir = await makeTempDir()
      const router = createExtensionRouter([makeC3Extension()])
      const req = new Request(`http://localhost/api/ext/c3/nonexistent?projectPath=${encodeURIComponent(dir)}`)
      const res = await router(req)

      expect(res.status).toBe(404)
    })
  })
})
