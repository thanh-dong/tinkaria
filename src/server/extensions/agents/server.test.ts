import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { agentsExtension } from "./server"

/** Helper: create a temp project dir, return its path */
async function makeTempProject(): Promise<string> {
  return mkdtemp(join(tmpdir(), "agents-ext-test-"))
}

/** Helper: invoke a route handler by path */
function findRoute(projectPath: string, method: string, path: string) {
  const routes = agentsExtension.routes({ projectPath })
  return routes.find((r) => r.method === method && r.path === path)
}

/** Helper: build a minimal GET request */
function fakeRequest(path: string): Request {
  return new Request(`http://localhost${path}`)
}

describe("agents extension", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await makeTempProject()
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  // ── /claude-md ──────────────────────────────────────────

  describe("GET /claude-md", () => {
    test("parses CLAUDE.md into structured sections", async () => {
      const claudeMd = [
        "## Architecture",
        "Event sourcing with JSONL logs.",
        "",
        "## Dev",
        "```bash",
        "bun run dev",
        "```",
      ].join("\n")

      await writeFile(join(tmpDir, "CLAUDE.md"), claudeMd)

      const route = findRoute(tmpDir, "GET", "/claude-md")
      expect(route).toBeDefined()

      const res = await route!.handler(fakeRequest("/claude-md"), {})
      expect(res.status).toBe(200)
      expect(res.headers.get("Content-Type")).toBe("application/json")

      const body = await res.json()
      expect(body.sections).toBeArrayOfSize(2)
      expect(body.sections[0].heading).toBe("Architecture")
      expect(body.sections[0].content).toBe("Event sourcing with JSONL logs.")
      expect(body.sections[1].heading).toBe("Dev")
      expect(body.sections[1].content).toContain("bun run dev")
    })

    test("returns empty sections when CLAUDE.md does not exist", async () => {
      const route = findRoute(tmpDir, "GET", "/claude-md")
      expect(route).toBeDefined()

      const res = await route!.handler(fakeRequest("/claude-md"), {})
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.sections).toBeArrayOfSize(0)
    })

    test("handles content before the first heading", async () => {
      const claudeMd = [
        "# Tinkaria",
        "",
        "Top-level intro paragraph.",
        "",
        "## Setup",
        "Run bun install.",
      ].join("\n")

      await writeFile(join(tmpDir, "CLAUDE.md"), claudeMd)

      const route = findRoute(tmpDir, "GET", "/claude-md")
      const res = await route!.handler(fakeRequest("/claude-md"), {})
      const body = await res.json()

      // preamble before first ## gets captured with empty heading
      expect(body.sections.length).toBeGreaterThanOrEqual(2)
      expect(body.sections[0].heading).toBe("")
      expect(body.sections[0].content).toContain("Top-level intro paragraph.")
      expect(body.sections[1].heading).toBe("Setup")
    })
  })

  // ── /skills ─────────────────────────────────────────────

  describe("GET /skills", () => {
    test("lists .md files from .claude/commands/", async () => {
      const cmdDir = join(tmpDir, ".claude", "commands")
      await mkdir(cmdDir, { recursive: true })
      await writeFile(join(cmdDir, "deploy.md"), "Deploy the app to prod")
      await writeFile(join(cmdDir, "lint.md"), "Run linter and fix issues")

      const route = findRoute(tmpDir, "GET", "/skills")
      expect(route).toBeDefined()

      const res = await route!.handler(fakeRequest("/skills"), {})
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.skills).toBeArrayOfSize(2)

      const names = body.skills.map((s: { name: string }) => s.name).sort()
      expect(names).toEqual(["deploy", "lint"])

      const deploy = body.skills.find((s: { name: string }) => s.name === "deploy")
      expect(deploy.filename).toBe("deploy.md")
      expect(deploy.content).toBe("Deploy the app to prod")
    })

    test("returns empty array when .claude/commands/ does not exist", async () => {
      const route = findRoute(tmpDir, "GET", "/skills")
      const res = await route!.handler(fakeRequest("/skills"), {})
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.skills).toBeArrayOfSize(0)
    })

    test("ignores non-.md files in commands dir", async () => {
      const cmdDir = join(tmpDir, ".claude", "commands")
      await mkdir(cmdDir, { recursive: true })
      await writeFile(join(cmdDir, "valid.md"), "A skill")
      await writeFile(join(cmdDir, "notes.txt"), "Not a skill")
      await writeFile(join(cmdDir, ".hidden"), "Also not a skill")

      const route = findRoute(tmpDir, "GET", "/skills")
      const res = await route!.handler(fakeRequest("/skills"), {})
      const body = await res.json()

      expect(body.skills).toBeArrayOfSize(1)
      expect(body.skills[0].name).toBe("valid")
    })
  })

  // ── /agents-md ──────────────────────────────────────────

  describe("GET /agents-md", () => {
    test("parses .claude/agents.md into sections", async () => {
      const agentsMd = [
        "## reviewer",
        "You are a code reviewer. Be thorough.",
        "",
        "## deployer",
        "Handle deployment pipelines.",
      ].join("\n")

      await mkdir(join(tmpDir, ".claude"), { recursive: true })
      await writeFile(join(tmpDir, ".claude", "agents.md"), agentsMd)

      const route = findRoute(tmpDir, "GET", "/agents-md")
      expect(route).toBeDefined()

      const res = await route!.handler(fakeRequest("/agents-md"), {})
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.found).toBe(true)
      expect(body.sections).toBeArrayOfSize(2)
      expect(body.sections[0].heading).toBe("reviewer")
      expect(body.sections[0].content).toBe("You are a code reviewer. Be thorough.")
      expect(body.sections[1].heading).toBe("deployer")
      expect(body.sections[1].content).toBe("Handle deployment pipelines.")
    })

    test("returns found:false and empty sections when agents.md missing", async () => {
      const route = findRoute(tmpDir, "GET", "/agents-md")
      const res = await route!.handler(fakeRequest("/agents-md"), {})
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.found).toBe(false)
      expect(body.sections).toBeArrayOfSize(0)
    })
  })
})
