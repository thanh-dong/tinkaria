---
id: c3-1
c3-seal: 1a2a94f60f17cf8bcc46830b1716f479ccd35f8357d7294e34ac4f3a4f0fe12c
title: client
type: container
boundary: service
parent: c3-0
goal: React 19 single-page application running in the browser — chat interface, terminal emulation, project management, settings UI.
---

## Goal

React 19 single-page application running in the browser — chat interface, terminal emulation, project management, settings UI.

## Components

| ID | Name | Category | Status | Goal Contribution |
| --- | --- | --- | --- | --- |
| c3-101 | app-shell | Foundation | active | Routing, layout, providers |
| c3-102 | stores | Foundation | active | Client-side UI state |
| c3-103 | theme | Foundation | active | Dark/light/system theming |
| c3-104 | ui-primitives | Foundation | active | Reusable Radix-based components |
| c3-110 | chat | Feature | active | Main chat interface |
| c3-111 | messages | Feature | active | Rich message rendering |
| c3-112 | chat-input | Feature | active | User input + model selection |
| c3-113 | sidebar | Feature | active | Navigation + project list |
| c3-115 | right-sidebar | Feature | active | File explorer panel |
| c3-117 | projects | Feature | active | Project discovery + creation |
## Responsibilities

- Render chat transcripts with rich message types (tool calls, diffs, todos, plans)
- Provide embedded terminal workspace via xterm.js
- Manage UI state (theme, layout, preferences) via Zustand stores
- Connect to server via WebSocket for real-time state updates
- Handle project navigation, sidebar, and settings UI
## Complexity Assessment

Moderate-to-Complex: 96 TSX/TS files, rich message rendering pipeline, multi-panel layout with resizable panes, terminal integration, drag-and-drop project ordering.
