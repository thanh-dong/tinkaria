import type { ServerExtension } from "../../../shared/extension-types"

interface ManifestResult {
  language: string
  name: string
  version: string
  scripts: Record<string, string>
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  error?: string
}

const MANIFEST_FILES = [
  { file: "package.json", parser: parsePackageJson },
  { file: "Cargo.toml", parser: parseCargoToml },
  { file: "go.mod", parser: parseGoMod },
  { file: "pyproject.toml", parser: parsePyprojectToml },
] as const

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

async function parsePackageJson(filePath: string): Promise<ManifestResult> {
  const text = await Bun.file(filePath).text()
  const pkg = JSON.parse(text)
  return {
    language: "javascript",
    name: pkg.name ?? "",
    version: pkg.version ?? "",
    scripts: pkg.scripts ?? {},
    dependencies: pkg.dependencies ?? {},
    devDependencies: pkg.devDependencies ?? {},
  }
}

async function parseCargoToml(filePath: string): Promise<ManifestResult> {
  const text = await Bun.file(filePath).text()
  const name = text.match(/\[package\][\s\S]*?name\s*=\s*"([^"]+)"/)?.[1] ?? ""
  const version = text.match(/\[package\][\s\S]*?version\s*=\s*"([^"]+)"/)?.[1] ?? ""
  const depsMatch = text.match(/\[dependencies\]([\s\S]*?)(?:\[|$)/)
  const deps: Record<string, string> = {}
  if (depsMatch) {
    for (const line of depsMatch[1].split("\n")) {
      const m = line.match(/^(\S+)\s*=\s*"?([^"\n]+)"?/)
      if (m) deps[m[1]] = m[2].trim()
    }
  }
  return {
    language: "rust",
    name,
    version,
    scripts: {},
    dependencies: deps,
    devDependencies: {},
  }
}

async function parseGoMod(filePath: string): Promise<ManifestResult> {
  const text = await Bun.file(filePath).text()
  const moduleName = text.match(/^module\s+(\S+)/m)?.[1] ?? ""
  const goVersion = text.match(/^go\s+(\S+)/m)?.[1] ?? ""
  const requireBlock = text.match(/require\s*\(([\s\S]*?)\)/)
  const deps: Record<string, string> = {}
  if (requireBlock) {
    for (const line of requireBlock[1].split("\n")) {
      const m = line.trim().match(/^(\S+)\s+(\S+)/)
      if (m) deps[m[1]] = m[2]
    }
  }
  return {
    language: "go",
    name: moduleName,
    version: goVersion,
    scripts: {},
    dependencies: deps,
    devDependencies: {},
  }
}

async function parsePyprojectToml(filePath: string): Promise<ManifestResult> {
  const text = await Bun.file(filePath).text()
  const name = text.match(/\[project\][\s\S]*?name\s*=\s*"([^"]+)"/)?.[1] ?? ""
  const version = text.match(/\[project\][\s\S]*?version\s*=\s*"([^"]+)"/)?.[1] ?? ""
  const depsMatch = text.match(/dependencies\s*=\s*\[([\s\S]*?)\]/)
  const deps: Record<string, string> = {}
  if (depsMatch) {
    for (const m of depsMatch[1].matchAll(/"([^"]+)"/g)) {
      const parts = m[1].split(/[><=~!]+/)
      deps[parts[0].trim()] = m[1].replace(parts[0].trim(), "").trim() || "*"
    }
  }
  return {
    language: "python",
    name,
    version,
    scripts: {},
    dependencies: deps,
    devDependencies: {},
  }
}

function handleManifest(projectPath: string) {
  return async (_req: Request, _params: Record<string, string>): Promise<Response> => {
    const results: ManifestResult[] = []

    for (const { file, parser } of MANIFEST_FILES) {
      const filePath = `${projectPath}/${file}`
      const bunFile = Bun.file(filePath)
      const exists = await bunFile.exists()
      if (!exists) continue

      try {
        const result = await parser(filePath)
        results.push(result)
      } catch (err: unknown) {
        const language = file === "package.json" ? "javascript"
          : file === "Cargo.toml" ? "rust"
          : file === "go.mod" ? "go"
          : "python"
        results.push({
          language,
          name: "",
          version: "",
          scripts: {},
          dependencies: {},
          devDependencies: {},
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return jsonResponse({ manifests: results })
  }
}

export const codeExtension: ServerExtension = {
  id: "code",
  name: "Code",
  icon: "code",
  detect: ["package.json", "Cargo.toml", "go.mod", "pyproject.toml"],
  routes(ctx) {
    return [
      { method: "GET", path: "/manifest", handler: handleManifest(ctx.projectPath) },
    ]
  },
}
