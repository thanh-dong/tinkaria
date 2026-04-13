---
id: c3-206
c3-seal: b341af2eca9e0b4a09ce63b3e35bf953a7758c32f23bf758767e385d356175d3
title: orchestration
type: component
category: feature
parent: c3-2
goal: SessionOrchestrator manages cross-session agent delegation, spawn/send/wait/close operations, depth and concurrency limits, and cancellation cascades.
uses:
    - ref-component-identity-mapping
    - rule-bun-test-conventions
    - rule-error-extraction
    - rule-prefixed-logging
    - rule-rule-bun-runtime
    - rule-rule-strict-typescript
---

## Goal

SessionOrchestrator manages cross-session agent delegation, spawn/send/wait/close operations, depth and concurrency limits, and cancellation cascades.

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | Project/chat state and turn execution callbacks | c3-210 |
| IN | Persistent chat/project store backing spawned sessions | c3-201 |
| OUT | MCP orchestration tools exposed to Claude turns | c3-210 |
| OUT | Delegated child turn lifecycle requests | c3-216 |
## Related Refs

| Ref | Role |
| --- | --- |
| ref-component-identity-mapping |  |
## Related Rules

| Rule | Constraint |
| --- | --- |
| rule-bun-test-conventions | Focused Bun coverage for spawn/send/wait/close and cancellation behavior |
| rule-error-extraction | Timeout and disposal failures must surface safely |
| rule-prefixed-logging | Delegation activity is logged with greppable prefixes |
| rule-rule-bun-runtime | Server orchestration stays on Bun-native APIs |
| rule-rule-strict-typescript | Strict typing across orchestration state and tool payloads |
## Container Connection

Part of c3-2 (server). This is the cross-session coordination layer beside AgentCoordinator: it turns tool-mediated delegation into spawned chats, waiters, and cancellation cascades without introducing hidden shared state.
