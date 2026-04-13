---
id: ref-mcp-app-hosting
c3-seal: 0a5b7d3237e0263dd02b80ca11e23fbe38d3af46af5842e5aec382134d6e5830
title: mcp-app-hosting
type: ref
goal: Provision shared MCP Apps hosting for Tinkaria so the important user jobs can be completed from one base architecture instead of splitting project and chat into separate rendering models.
status: provisioned
---

## Goal

Provision shared MCP Apps hosting for Tinkaria so the important user jobs can be completed from one base architecture instead of splitting project and chat into separate rendering models.

## Choice

Use one shared server-side MCP Apps bridge plus one shared client embed shell. The server owns app manifests, registry, app-session lifecycle, and fallback-to-artifact decisions. The client owns only safe iframe/embed rendering, frame controls, and state handoff for app sessions.

Phase 1 hosting is constrained to read-only jobs only. App-originated runtime actions are out of scope until a separate authority boundary exists.

## Why

Tinkaria already has transcript-native artifact rendering through `present_content` and `rich-content`, and already normalizes generic MCP tool calls. Building MCP Apps on top of those paths keeps non-interactive fallback intact, limits protocol sprawl, and keeps project-scoped app surfaces compatible with transcript-hosted app sessions.

## How

Phase 1 baseline supports only the minimum host capabilities required for the important jobs:

- shared app manifest/session/embed types
- a server app registry for trusted app definitions
- Codex app-server recognition for app-capable MCP results
- a rich-content iframe/embed host with deterministic `present_content` fallback
- first-party or strict allowlisted origins only
- no privileged tool bridge from iframe/app to runtime
Later phases can add reconnect semantics, richer app polish, and expanded interaction once the authority model is explicit.
