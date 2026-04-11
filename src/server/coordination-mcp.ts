import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod/v4"
import { randomUUID } from "node:crypto"
import type { CoordinationStore } from "../shared/coordination-store"
import type { ProjectCoordinationSnapshot } from "../shared/project-agent-types"
import { deriveCoordinationSnapshot } from "./read-models"

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] }
}

/** Fetch the full snapshot, using remote getSnapshot when state is not in-process. */
async function getProjectSnapshot(store: CoordinationStore, projectId: string): Promise<ProjectCoordinationSnapshot> {
  if (store.getSnapshot) {
    return store.getSnapshot(projectId)
  }
  return deriveCoordinationSnapshot(store.state, projectId)
}

/** Read back an entity after mutation — tries in-process state first, falls back to snapshot. */
async function readBackEntity(
  store: CoordinationStore,
  projectId: string,
  collection: "todos" | "claims" | "worktrees" | "rules",
  entityId: string,
): Promise<unknown> {
  const coord = store.state.coordinationByProject.get(projectId)
  if (coord) return coord[collection].get(entityId) ?? { id: entityId }
  const snapshot = await getProjectSnapshot(store, projectId)
  const list = snapshot[collection] as Array<{ id: string }>
  return list.find((e) => e.id === entityId) ?? { id: entityId }
}

export function createCoordinationMcpServer(store: CoordinationStore) {
  return createSdkMcpServer({
    name: "project-coordination",
    tools: [
      tool(
        "project_todo_add",
        "Add a shared todo to a project's coordination board. Returns the created todo.",
        {
          projectId: z.string().describe("The project ID"),
          description: z.string().describe("What needs to be done"),
          priority: z.enum(["high", "normal", "low"]).optional().describe("Priority level (default: normal)"),
          createdBy: z.string().optional().describe("Session or user creating the todo"),
        },
        async (args) => {
          const todoId = randomUUID()
          await store.addTodo(args.projectId, todoId, args.description, args.priority ?? "normal", args.createdBy ?? "unknown")
          return json(await readBackEntity(store, args.projectId, "todos", todoId))
        },
      ),
      tool(
        "project_todo_claim",
        "Claim a todo for a session. Sets status to 'claimed'.",
        {
          projectId: z.string().describe("The project ID"),
          todoId: z.string().describe("The todo to claim"),
          sessionId: z.string().describe("The session claiming the todo"),
        },
        async (args) => {
          await store.claimTodo(args.projectId, args.todoId, args.sessionId)
          return json(await readBackEntity(store, args.projectId, "todos", args.todoId))
        },
      ),
      tool(
        "project_todo_complete",
        "Mark a todo as complete with optional output artifacts.",
        {
          projectId: z.string().describe("The project ID"),
          todoId: z.string().describe("The todo to complete"),
          outputs: z.array(z.string()).optional().describe("Output file paths or artifact references"),
        },
        async (args) => {
          await store.completeTodo(args.projectId, args.todoId, args.outputs ?? [])
          return json(await readBackEntity(store, args.projectId, "todos", args.todoId))
        },
      ),
      tool(
        "project_todo_abandon",
        "Abandon a todo. Sets status to 'abandoned'.",
        {
          projectId: z.string().describe("The project ID"),
          todoId: z.string().describe("The todo to abandon"),
        },
        async (args) => {
          await store.abandonTodo(args.projectId, args.todoId)
          return json(await readBackEntity(store, args.projectId, "todos", args.todoId))
        },
      ),
      tool(
        "project_claim_create",
        "Declare intent to work on files. If files overlap with an existing active claim, the claim is created with 'conflict' status.",
        {
          projectId: z.string().describe("The project ID"),
          intent: z.string().describe("What you intend to do with these files"),
          files: z.array(z.string()).describe("File paths being claimed"),
          sessionId: z.string().describe("The session creating the claim"),
        },
        async (args) => {
          const claimId = randomUUID()
          await store.createClaim(args.projectId, claimId, args.intent, args.files, args.sessionId)
          return json(await readBackEntity(store, args.projectId, "claims", claimId))
        },
      ),
      tool(
        "project_claim_release",
        "Release a file claim when done working on those files.",
        {
          projectId: z.string().describe("The project ID"),
          claimId: z.string().describe("The claim to release"),
        },
        async (args) => {
          await store.releaseClaim(args.projectId, args.claimId)
          return json(await readBackEntity(store, args.projectId, "claims", args.claimId))
        },
      ),
      tool(
        "project_worktree_create",
        "Create a git worktree for isolated work on a branch.",
        {
          projectId: z.string().describe("The project ID"),
          branch: z.string().describe("Branch name for the worktree"),
          baseBranch: z.string().optional().describe("Base branch to create from (default: main)"),
        },
        async (args) => {
          const worktreeId = randomUUID()
          await store.createWorktree(args.projectId, worktreeId, args.branch, args.baseBranch ?? "main", "")
          return json(await readBackEntity(store, args.projectId, "worktrees", worktreeId))
        },
      ),
      tool(
        "project_worktree_assign",
        "Assign a worktree to a session.",
        {
          projectId: z.string().describe("The project ID"),
          worktreeId: z.string().describe("The worktree to assign"),
          sessionId: z.string().describe("The session to assign to"),
        },
        async (args) => {
          await store.assignWorktree(args.projectId, args.worktreeId, args.sessionId)
          return json(await readBackEntity(store, args.projectId, "worktrees", args.worktreeId))
        },
      ),
      tool(
        "project_worktree_remove",
        "Remove a worktree.",
        {
          projectId: z.string().describe("The project ID"),
          worktreeId: z.string().describe("The worktree to remove"),
        },
        async (args) => {
          await store.removeWorktree(args.projectId, args.worktreeId)
          return json({ ok: true, worktreeId: args.worktreeId })
        },
      ),
      tool(
        "project_rule_set",
        "Set a project rule or instruction that applies to all sessions.",
        {
          projectId: z.string().describe("The project ID"),
          ruleId: z.string().optional().describe("Rule ID (auto-generated if omitted)"),
          content: z.string().describe("The rule content"),
          setBy: z.string().optional().describe("Who set this rule"),
        },
        async (args) => {
          const ruleId = args.ruleId ?? randomUUID()
          await store.setRule(args.projectId, ruleId, args.content, args.setBy ?? "unknown")
          return json(await readBackEntity(store, args.projectId, "rules", ruleId))
        },
      ),
      tool(
        "project_rule_remove",
        "Remove a project rule.",
        {
          projectId: z.string().describe("The project ID"),
          ruleId: z.string().describe("The rule to remove"),
        },
        async (args) => {
          await store.removeRule(args.projectId, args.ruleId)
          return json({ ok: true, ruleId: args.ruleId })
        },
      ),
      tool(
        "project_snapshot_get",
        "Get the current coordination snapshot for a project — all active todos, claims, worktrees, and rules.",
        {
          projectId: z.string().describe("The project ID"),
        },
        async (args) => {
          const snapshot = await getProjectSnapshot(store, args.projectId)
          return json(snapshot)
        },
      ),
    ],
  })
}
