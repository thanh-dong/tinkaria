import { readdir } from "node:fs/promises"
import { join, basename } from "node:path"
import type { ServerExtension } from "../../../shared/extension-types"

// ── Helpers ───────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function parseMarkdownSections(content: string): { heading: string; content: string }[] {
  const sections: { heading: string; content: string }[] = []
  const lines = content.split("\n")
  let currentHeading = ""
  let currentContent: string[] = []

  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (currentHeading || currentContent.length > 0) {
        sections.push({ heading: currentHeading, content: currentContent.join("\n").trim() })
      }
      currentHeading = line.slice(3).trim()
      currentContent = []
    } else {
      currentContent.push(line)
    }
  }
  if (currentHeading || currentContent.length > 0) {
    sections.push({ heading: currentHeading, content: currentContent.join("\n").trim() })
  }
  return sections
}

// ── Route handlers ────────────────────────────────────────

function handleClaudeMd(projectPath: string) {
  return async (_req: Request, _params: Record<string, string>): Promise<Response> => {
    const filePath = join(projectPath, "CLAUDE.md")
    const file = Bun.file(filePath)

    if (!(await file.exists())) {
      return jsonResponse({ sections: [] })
    }

    const text = await file.text()
    return jsonResponse({ sections: parseMarkdownSections(text) })
  }
}

function handleSkills(projectPath: string) {
  return async (_req: Request, _params: Record<string, string>): Promise<Response> => {
    const cmdDir = join(projectPath, ".claude", "commands")

    let entries: string[]
    try {
      entries = await readdir(cmdDir)
    } catch (_e: unknown) {
      return jsonResponse({ skills: [] })
    }

    const mdFiles = entries.filter((f) => f.endsWith(".md"))
    const skills = await Promise.all(
      mdFiles.map(async (filename) => {
        const content = await Bun.file(join(cmdDir, filename)).text()
        return {
          name: basename(filename, ".md"),
          filename,
          content,
        }
      }),
    )

    return jsonResponse({ skills })
  }
}

function handleAgentsMd(projectPath: string) {
  return async (_req: Request, _params: Record<string, string>): Promise<Response> => {
    const filePath = join(projectPath, ".claude", "agents.md")
    const file = Bun.file(filePath)

    if (!(await file.exists())) {
      return jsonResponse({ found: false, sections: [] })
    }

    const text = await file.text()
    return jsonResponse({ found: true, sections: parseMarkdownSections(text) })
  }
}

// ── Extension export ──────────────────────────────────────

export const agentsExtension: ServerExtension = {
  id: "agents",
  name: "Agents",
  icon: "bot",
  detect: ["CLAUDE.md", ".claude/"],
  routes(ctx) {
    return [
      { method: "GET", path: "/claude-md", handler: handleClaudeMd(ctx.projectPath) },
      { method: "GET", path: "/skills", handler: handleSkills(ctx.projectPath) },
      { method: "GET", path: "/agents-md", handler: handleAgentsMd(ctx.projectPath) },
    ]
  },
}
