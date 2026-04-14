---
id: c3-206
c3-seal: 8e1fb09928dc408722e5ef36cfff8fd0ac5b0e912fa32da5b302384c67a418e5
title: orchestration
type: component
category: feature
parent: c3-2
goal: SessionOrchestrator manages cross-session agent delegation, spawn/send/wait/close operations, depth and concurrency limits, and cancellation cascades.
uses:
    - recipe-agent-turn-render-flow
    - ref-component-identity-mapping
    - ref-live-transcript-render-contract
    - rule-bun-test-conventions
    - rule-error-extraction
    - rule-prefixed-logging
    - rule-rule-bun-runtime
    - rule-rule-strict-typescript
    - rule-transcript-boundary-regressions
---

## Goal

SessionOrchestrator manages cross-session agent delegation, spawn/send/wait/close operations, depth and concurrency limits, and cancellation cascades.

### MCP Tools

`createOrchestrationMcpServer(orchestrator, callerChatId)` registers 5 tools:

| Tool | Args | Returns | Behavior |
| --- | --- | --- | --- |
| spawn_agent | instruction, provider?, fork_context? | { chatId } | Creates child session. Seeds with bounded parent transcript if fork_context=true. |
| list_agents | (none) | OrchestrationHierarchySnapshot | Returns full nested tree of all spawned + external children with live statuses. |
| send_input | targetChatId, content | "Input sent" | Follow-up message to existing child. Target must not be running. |
| wait_agent | targetChatId, timeoutMs? (default 120s) | { result, isError } | Blocks until child emits result entry. Auto-cancels on timeout. |
| close_agent | targetChatId | "Agent closed" | Disposes child, marks as closed tombstone. Clears pending waiters. |
All tools enforce ownership via `requireOwnedTarget()` — callers can only interact with their own spawned children.

### Depth and Concurrency Limits

| Limit | Default | Enforced At |
| --- | --- | --- |
| maxDepth | 3 | spawn_agent — rejects if child would exceed nesting depth |
| maxConcurrency | 10 | spawn_agent — counts active (spawning + running + waiting) agents per workspace |
Both configurable via `SessionOrchestratorArgs`.

### Child Status Resolution

Status is derived dynamically from coordinator state:

| Coordinator State | Orchestration Status |
| --- | --- |
| In activeTurns (starting/running) | running |
| waiting_for_user | waiting |
| failed | failed |
| Closed tombstone | closed |
| Not in activeTurns | completed |
### Cancellation Cascade

`cancelWithCascade(chatId)` performs recursive post-order cancellation:

1. Traverse `children` map to find all descendants
2. Cancel each descendant first (deepest first)
3. Cancel parent last
4. Call `cleanup()` to purge all origin tracking for the tree
### Delegated Context Algorithm (buildDelegatedContext)

When `fork_context=true`, the child receives a bounded excerpt from the parent:

**Constants:**

- MAX_DELEGATED_CONTEXT_ENTRIES = 24 (most recent)
- MAX_DELEGATED_CONTEXT_CHARS = 12,000 (total budget)
- MAX_DELEGATED_CONTEXT_LINE_CHARS = 600 (per-line truncation)
**Steps:**

1. Convert parent transcript entries to single-line summaries (truncated at 600 chars each)
2. Select last 24 lines
3. If zero lines, return undefined (no context)
4. Build header: "Forked parent chat context" + disclaimer + omission count
5. Join header + lines. If total <= 12k chars, return as-is
6. If over budget: trim from oldest line first, keep newest, until fits
7. Child instruction is NOT rewritten — context is appended separately by coordinator
### Hierarchy Tree (getHierarchy)

Builds nested `OrchestrationHierarchySnapshot` combining:

- **Internal children**: spawned via spawn_agent, tracked in `children` Map and `origins` Map
- **External children**: detected from `tool_call` entries with `toolKind === "subagent_task"` and `tool_result` entries with `receiverThreadIds`
- De-duplicated: if external child already tracked as internal, skip
Each node carries: chatId, status, instruction (first 120 chars), spawnedAt, lastStatusAt.

### Internal State

| Map | Keys | Values | Purpose |
| --- | --- | --- | --- |
| children | parentChatId | Set of childChatIds | Parent-child ownership |
| origins | childChatId | OriginRecord (parent, depth, instruction, timestamps, status) | Reverse lookup + metadata |
| externalChildren | callerChatId | Map of receiverId to ExternalAgentStateRecord | Codex subagent tracking |
| waiters | childChatId | Array of { resolve, reject, timer } | Pending wait_agent promises |
| tombstones | childChatId | true | Closed children (pruned periodically) |
## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | Project/chat state and turn execution callbacks | c3-210 |
| IN | Persistent chat/project store backing spawned sessions | c3-201 |
| OUT | MCP orchestration tools exposed to Claude turns | c3-210 |
| OUT | Delegated child turn lifecycle requests | c3-216 |
## Container Connection

Part of c3-2 (server). This is the cross-session coordination layer beside AgentCoordinator: it turns tool-mediated delegation into spawned chats, waiters, and cancellation cascades without introducing hidden shared state.
