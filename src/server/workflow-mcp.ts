import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod/v4"
import type { WorkflowEngine } from "./workflow-engine"
import type { WorkflowStore } from "./workflow-store"

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] }
}

export function createWorkflowMcpServer(engine: WorkflowEngine, store: WorkflowStore) {
  return createSdkMcpServer({
    name: "workflow",
    tools: [
      tool(
        "workflow_list",
        "List available workflows in this workspace",
        { workspaceId: z.string() },
        async () => json(await store.list()),
      ),
      tool(
        "workflow_run",
        "Execute a workflow by ID",
        {
          workspaceId: z.string(),
          workflowId: z.string(),
          triggeredBy: z.string().optional(),
        },
        async (args) => {
          const def = await store.get(args.workflowId)
          if (!def) return json({ error: "workflow not found" })
          const runId = await engine.start(args.workflowId, args.workspaceId, def, args.triggeredBy ?? "agent")
          return json({ runId })
        },
      ),
      tool(
        "workflow_cancel",
        "Cancel an active workflow run",
        {
          workspaceId: z.string(),
          runId: z.string(),
        },
        async (args) => {
          await engine.cancel(args.runId, args.workspaceId)
          return json({ ok: true })
        },
      ),
    ],
  })
}
