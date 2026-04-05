// src/server/project-cli.ts

export interface CliCommand {
  command: string
  args: Record<string, string | undefined>
}

export function parseProjectCliArgs(argv: string[]): CliCommand {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    return { command: "help", args: {} }
  }

  const flags: Record<string, string> = {}
  const positional: string[] = []

  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--") && i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
      flags[argv[i].slice(2)] = argv[i + 1]
      i++
    } else if (!argv[i].startsWith("--")) {
      positional.push(argv[i])
    }
  }

  const cmd = positional[0]
  const rest = positional.slice(1)
  // Normalize flag names to match API expectations
  const normalized: Record<string, string> = {}
  for (const [key, value] of Object.entries(flags)) {
    if (key === "project") normalized["projectId"] = value
    else normalized[key] = value
  }
  const args: Record<string, string | undefined> = { ...normalized }

  switch (cmd) {
    case "sessions":
      if (rest.length > 0) return { command: "session-detail", args: { ...args, chatId: rest[0] } }
      return { command: "sessions", args }
    case "search":
      return { command: "search", args: { ...args, query: rest.join(" ") } }
    case "tasks":
      if (rest.length > 0) return { command: "task-detail", args: { ...args, taskId: rest[0] } }
      return { command: "tasks", args }
    case "claim":
      return { command: "claim", args: { ...args, description: rest.join(" ") } }
    case "complete":
      return { command: "complete", args: { ...args, taskId: rest[0] } }
    case "delegate":
      return { command: "delegate", args: { ...args, request: rest.join(" ") } }
    default:
      return { command: "help", args: {} }
  }
}

export function formatOutput(command: string, data: unknown, json: boolean): string {
  if (json) return JSON.stringify(data, null, 2)

  if (command === "sessions" && Array.isArray(data)) {
    if (data.length === 0) return "No sessions found."
    const rows = data.map((s: Record<string, unknown>) =>
      `${s.chatId}  ${String(s.status).padEnd(8)}  ${String(s.provider).padEnd(6)}  ${String(s.intent ?? "").slice(0, 50)}`
    )
    return ["CHAT_ID   STATUS    PROVIDER  INTENT", ...rows].join("\n")
  }

  if (command === "tasks" && Array.isArray(data)) {
    if (data.length === 0) return "No tasks tracked."
    const rows = data.map((t: Record<string, unknown>) =>
      `${t.id}  ${String(t.status).padEnd(12)}  ${t.ownedBy}  ${String(t.description).slice(0, 50)}`
    )
    return ["ID     STATUS        OWNER     DESCRIPTION", ...rows].join("\n")
  }

  return JSON.stringify(data, null, 2)
}

export function getHelpText(): string {
  return `tinkaria-project — Cross-session project agent CLI

Commands:
  sessions                    List active/recent sessions with summaries
  sessions <chat-id>          Detailed summary of a specific session
  search <query>              Lexical search over project transcripts
  tasks                       List all tasks in the TaskLedger
  tasks <task-id>             Get task details
  claim <description>         Claim a new task for the current session
  complete <task-id>          Mark a task as complete
  delegate <request>          Submit a delegation request to the project agent

Flags:
  --json                      Output as JSON (default when stdout is not a TTY)
  --project <id>              Target project (default: current)
  --session <chat-id>         Identify calling session (for claim/complete)
  --port <port>               Tinkaria server port (default: 3210)
  --version                   CLI version
  --help                      Show this help`
}

export async function executeCommand(
  parsed: CliCommand,
  baseUrl: string,
): Promise<{ output: string; exitCode: number }> {
  const args = parsed.args
  const json = "json" in args || !process.stdout.isTTY

  try {
    let data: unknown
    switch (parsed.command) {
      case "help":
        return { output: getHelpText(), exitCode: 0 }
      case "sessions": {
        const projectId = args.projectId ?? ""
        const res = await fetch(`${baseUrl}/api/project/sessions?projectId=${encodeURIComponent(projectId)}`)
        data = await res.json()
        break
      }
      case "session-detail": {
        const res = await fetch(`${baseUrl}/api/project/sessions/${args.chatId}`)
        if (res.status === 404) return { output: formatOutput("error", { error: "Session not found" }, json), exitCode: 1 }
        data = await res.json()
        break
      }
      case "search": {
        const res = await fetch(`${baseUrl}/api/project/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: args.query, limit: 10 }),
        })
        data = await res.json()
        break
      }
      case "tasks": {
        const res = await fetch(`${baseUrl}/api/project/tasks`)
        data = await res.json()
        break
      }
      case "task-detail": {
        const res = await fetch(`${baseUrl}/api/project/tasks/${args.taskId}`)
        if (res.status === 404) return { output: formatOutput("error", { error: "Task not found" }, json), exitCode: 1 }
        data = await res.json()
        break
      }
      case "claim": {
        const res = await fetch(`${baseUrl}/api/project/claim`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: args.description, session: args.session, branch: args.branch ?? null }),
        })
        if (res.status === 400) return { output: formatOutput("error", await res.json(), json), exitCode: 1 }
        data = await res.json()
        break
      }
      case "complete": {
        const res = await fetch(`${baseUrl}/api/project/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId: args.taskId, outputs: [] }),
        })
        if (res.status === 404) return { output: formatOutput("error", { error: "Task not found" }, json), exitCode: 1 }
        data = await res.json()
        break
      }
      case "delegate": {
        const res = await fetch(`${baseUrl}/api/project/delegate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ request: args.request, projectId: args.projectId ?? "" }),
        })
        data = await res.json()
        break
      }
      default:
        return { output: getHelpText(), exitCode: 1 }
    }
    return { output: formatOutput(parsed.command, data, json), exitCode: 0 }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { output: JSON.stringify({ error: message, code: 2 }), exitCode: 2 }
  }
}
