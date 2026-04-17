---
id: adr-20260417-fix-subagent-flow-usage
c3-seal: be7154130fcd4ab885d9ea73a5264fc899729d5004be5243b1f6ff501b305bb7
title: fix-subagent-flow-usage
type: adr
goal: Verify the full subagent orchestration flow, isolate why Claude still works while Codex subagent use fails, and fix the root cause with RED-GREEN-TDD evidence.
status: implemented
date: "2026-04-17"
---

## Goal

Verify the full subagent orchestration flow, isolate why Claude still works while Codex subagent use fails, and fix the root cause with RED-GREEN-TDD evidence.

RED evidence:

- Focused Claude/MCP orchestration tests passed, proving the shared `SessionOrchestrator` path still works.
- Local `codex app-server generate-ts` and `generate-json-schema` for Codex CLI 0.121.0 prove `TurnStartParams` no longer contains `dynamicTools` while native `collabAgentToolCall` items expose `spawnAgent`, `sendInput`, `resumeAgent`, `wait`, and `closeAgent`.
- The first RED test expecting Codex-native collaboration instead of `dynamicTools` failed under the old code because the fake process never acknowledged a turn after the stale dynamicTools assertion tripped.
GREEN change:
- Stop sending the removed `dynamicTools` field to Codex app-server.
- Remove stale `DynamicToolDefinition` and `TurnStartParams.dynamicTools` from the local protocol shim.
- Update Codex prompt-context to describe Codex-native subagent collaboration via `collabAgentToolCall` / `spawnAgent` / `sendInput` / `wait` / `closeAgent` instead of Claude-style snake_case dynamic tools.
- Preserve legacy `item/tool/call` handling for `present_content`, `ask_user_question`, and orchestration so older app-server builds or synthetic events still stream typed transcript entries and fail closed.
- Add current optional `model` and `reasoningEffort` fields to `CollabAgentToolCallItem`.
Parent Delta:
- Component c3-216 codex: updated implementation/tests/protocol to current Codex app-server native collaboration contract.
- Component c3-207 prompt-context: updated prompt behavior and codemap ownership for `src/shared/web-context.ts` and `src/shared/web-context.test.ts`.
- Component c3-206 orchestration and c3-210 agent: no contract delta; Claude MCP orchestration and server queue/active-turn contracts remained covered by existing tests.
- Container c3-2 server: no responsibility/table delta; existing provider/runtime orchestration ownership remains correct.
Verification:
- `bun test src/server/codex-app-server.test.ts --test-name-pattern "dynamic|codex-native|collab agent|session orchestration"`
- `bun test src/shared/web-context.test.ts`
- `bun test src/server/orchestration.test.ts --test-name-pattern "codex-native|spawnAgent|sendInput|waitForResult|createOrchestrationMcpServer"`
- `bun test src/server/codex-app-server.test.ts src/shared/web-context.test.ts src/server/orchestration.test.ts src/server/runner-proxy.test.ts`
- `bunx @typescript/native-preview --noEmit -p tsconfig.json`
