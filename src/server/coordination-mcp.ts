import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod/v4"
import { randomUUID } from "node:crypto"
import type { CoordinationStore } from "../shared/coordination-store"
import type { WorkspaceCoordinationSnapshot } from "../shared/workspace-types"
import { deriveCoordinationSnapshot } from "./read-models"

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] }
}

/** Fetch the full snapshot, using remote getSnapshot when state is not in-process. */
async function getProjectSnapshot(store: CoordinationStore, workspaceId: string): Promise<WorkspaceCoordinationSnapshot> {
  if (store.getSnapshot) {
    return store.getSnapshot(workspaceId)
  }
  return deriveCoordinationSnapshot(store.state, workspaceId)
}

/** Read back an entity after mutation — tries in-process state first, falls back to snapshot. */
async function readBackEntity(
  store: CoordinationStore,
  workspaceId: string,
  collection: "todos" | "claims" | "worktrees" | "rules",
  entityId: string,
): Promise<unknown> {
  const coord = store.state.coordinationByWorkspace.get(workspaceId)
  if (coord) return coord[collection].get(entityId) ?? { id: entityId }
  const snapshot = await getProjectSnapshot(store, workspaceId)
  const list = snapshot[collection] as Array<{ id: string }>
  return list.find((e) => e.id === entityId) ?? { id: entityId }
}

export function createCoordinationMcpServer(store: CoordinationStore) {
  return createSdkMcpServer({
    name: "project-coordination",
    tools: [
      tool(
        "workspace_todo_add",
        "Add a shared todo to a project's coordination board. Returns the created todo.",
        {
          workspaceId: z.string().describe("The project ID"),
          description: z.string().describe("What needs to be done"),
          priority: z.enum(["high", "normal", "low"]).optional().describe("Priority level (default: normal)"),
          createdBy: z.string().optional().describe("Session or user creating the todo"),
        },
        async (args) => {
          const todoId = randomUUID()
          await store.addTodo(args.workspaceId, todoId, args.description, args.priority ?? "normal", args.createdBy ?? "unknown")
          return json(await readBackEntity(store, args.workspaceId, "todos", todoId))
        },
      ),
      tool(
        "workspace_todo_claim",
        "Claim a todo for a session. Sets status to 'claimed'.",
        {
          workspaceId: z.string().describe("The project ID"),
          todoId: z.string().describe("The todo to claim"),
          sessionId: z.string().describe("The session claiming the todo"),
        },
        async (args) => {
          await store.claimTodo(args.workspaceId, args.todoId, args.sessionId)
          return json(await readBackEntity(store, args.workspaceId, "todos", args.todoId))
        },
      ),
      tool(
        "workspace_todo_complete",
        "Mark a todo as complete with optional output artifacts.",
        {
          workspaceId: z.string().describe("The project ID"),
          todoId: z.string().describe("The todo to complete"),
          outputs: z.array(z.string()).optional().describe("Output file paths or artifact references"),
        },
        async (args) => {
          await store.completeTodo(args.workspaceId, args.todoId, args.outputs ?? [])
          return json(await readBackEntity(store, args.workspaceId, "todos", args.todoId))
        },
      ),
      tool(
        "workspace_todo_abandon",
        "Abandon a todo. Sets status to 'abandoned'.",
        {
          workspaceId: z.string().describe("The project ID"),
          todoId: z.string().describe("The todo to abandon"),
        },
        async (args) => {
          await store.abandonTodo(args.workspaceId, args.todoId)
          return json(await readBackEntity(store, args.workspaceId, "todos", args.todoId))
        },
      ),
      tool(
        "workspace_claim_create",
        "Declare intent to work on files. If files overlap with an existing active claim, the claim is created with 'conflict' status.",
        {
          workspaceId: z.string().describe("The project ID"),
          intent: z.string().describe("What you intend to do with these files"),
          files: z.array(z.string()).describe("File paths being claimed"),
          sessionId: z.string().describe("The session creating the claim"),
        },
        async (args) => {
          const claimId = randomUUID()
          await store.createClaim(args.workspaceId, claimId, args.intent, args.files, args.sessionId)
          return json(await readBackEntity(store, args.workspaceId, "claims", claimId))
        },
      ),
      tool(
        "workspace_claim_release",
        "Release a file claim when done working on those files.",
        {
          workspaceId: z.string().describe("The project ID"),
          claimId: z.string().describe("The claim to release"),
        },
        async (args) => {
          await store.releaseClaim(args.workspaceId, args.claimId)
          return json(await readBackEntity(store, args.workspaceId, "claims", args.claimId))
        },
      ),
      tool(
        "workspace_worktree_create",
        "Create a git worktree for isolated work on a branch.",
        {
          workspaceId: z.string().describe("The project ID"),
          branch: z.string().describe("Branch name for the worktree"),
          baseBranch: z.string().optional().describe("Base branch to create from (default: main)"),
        },
        async (args) => {
          const worktreeId = randomUUID()
          await store.createWorktree(args.workspaceId, worktreeId, args.branch, args.baseBranch ?? "main", "")
          return json(await readBackEntity(store, args.workspaceId, "worktrees", worktreeId))
        },
      ),
      tool(
        "workspace_worktree_assign",
        "Assign a worktree to a session.",
        {
          workspaceId: z.string().describe("The project ID"),
          worktreeId: z.string().describe("The worktree to assign"),
          sessionId: z.string().describe("The session to assign to"),
        },
        async (args) => {
          await store.assignWorktree(args.workspaceId, args.worktreeId, args.sessionId)
          return json(await readBackEntity(store, args.workspaceId, "worktrees", args.worktreeId))
        },
      ),
      tool(
        "workspace_worktree_remove",
        "Remove a worktree.",
        {
          workspaceId: z.string().describe("The project ID"),
          worktreeId: z.string().describe("The worktree to remove"),
        },
        async (args) => {
          await store.removeWorktree(args.workspaceId, args.worktreeId)
          return json({ ok: true, worktreeId: args.worktreeId })
        },
      ),
      tool(
        "workspace_rule_set",
        "Set a project rule or instruction that applies to all sessions.",
        {
          workspaceId: z.string().describe("The project ID"),
          ruleId: z.string().optional().describe("Rule ID (auto-generated if omitted)"),
          content: z.string().describe("The rule content"),
          setBy: z.string().optional().describe("Who set this rule"),
        },
        async (args) => {
          const ruleId = args.ruleId ?? randomUUID()
          await store.setRule(args.workspaceId, ruleId, args.content, args.setBy ?? "unknown")
          return json(await readBackEntity(store, args.workspaceId, "rules", ruleId))
        },
      ),
      tool(
        "workspace_rule_remove",
        "Remove a project rule.",
        {
          workspaceId: z.string().describe("The project ID"),
          ruleId: z.string().describe("The rule to remove"),
        },
        async (args) => {
          await store.removeRule(args.workspaceId, args.ruleId)
          return json({ ok: true, ruleId: args.ruleId })
        },
      ),
      tool(
        "workspace_snapshot_get",
        "Get the current coordination snapshot for a project — all active todos, claims, worktrees, and rules.",
        {
          workspaceId: z.string().describe("The project ID"),
        },
        async (args) => {
          const snapshot = await getProjectSnapshot(store, args.workspaceId)
          return json(snapshot)
        },
      ),
    ],
  })
}
