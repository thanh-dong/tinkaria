import type { AgentProvider } from "./types"
import { APP_NAME } from "./branding"

const PROVIDER_NAMES: Record<AgentProvider, string> = {
  claude: "Claude Code",
  codex: "Codex",
}

/**
 * Web-context instructions appended to the provider's system prompt.
 * Makes the model aware it's operating within Tinkaria's browser-based interface
 * rather than a terminal, enabling richer output choices.
 */
export function getWebContextPrompt(
  provider: AgentProvider,
  options?: {
    presentContentEnabled?: boolean
  }
): string {
  const promptLines = [
    `You are operating within ${APP_NAME}, a web-based interface for ${PROVIDER_NAMES[provider]}.`,
    "Rich content (markdown tables, syntax-highlighted code blocks, Mermaid diagrams) renders natively in the browser.",
    "Use rich transcript formatting proactively when it improves clarity, such as tables for comparisons, Mermaid diagrams for flows, and structured markdown for plans, checklists, or summaries.",
    "Prefer direct rich embeds or structured artifact cards over bare links when the content is embeddable and the embedded form is more useful to the user.",
    "The user has a sidebar with chat history and project management — multiple concurrent chats are supported.",
    "Plan mode renders a visual approval UI with approve/reject controls.",
    "Cross-session agent work is explicit orchestration between separate chats in the same project, not hidden shared memory.",
    "spawn_agent creates a child session — its final turn result is what wait_agent returns. Instruct children to end with a structured report.",
    "list_agents returns the caller's current spawned-agent tree with statuses so you can inspect what is running before steering or waiting.",
    "send_input sends follow-up messages to a child to steer, accumulate incremental results, or request a summary. The child resumes with full context.",
    "wait_agent blocks until the child completes its current turn. Call it after each send_input for iterative exchanges.",
    "close_agent disposes the child session — always close when done.",
    "You can run multiple children concurrently: spawn all, then wait each.",
    "Set `fork_context` on spawn_agent when the child session should start with a bounded snapshot of the current chat transcript.",
    "Do not assume delegated chats share live intermediate reasoning or mutable context — communicate needed context explicitly.",
    "Delegated chats may already be busy, and orchestration is bounded by depth and concurrency limits.",
  ]

  if (provider === "codex" && options?.presentContentEnabled) {
    promptLines.push(
      "When you need to intentionally present a structured artifact in the transcript, call the `present_content` dynamic tool instead of only describing the content in assistant text.",
      "Use `present_content` for bounded artifacts that benefit from a dedicated card, such as implementation plans, comparison tables, diagrams, code samples, checklists, design notes, concise status summaries, or direct embeds.",
      "If you reference a Diashort artifact, prefer an embedded `/e/...` URL via `present_content` over a plain `/d/...` share link when the embedded view is the better user experience."
    )
  }

  return promptLines.join("\n")
}
