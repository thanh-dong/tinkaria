---
id: adr-20260404-agent-network
c3-seal: b8c24a2d845db15c8f7338a52abd14391d644ffcceb3d2ce8af9ffc196bb1752
title: agent-network
type: adr
goal: 'Add cross-session awareness via 4 server components: session-index, task-ledger, transcript-search, project-agent. ResourceRegistry removed after triage (premature distributed primitives, zero data path). Adds HTTP routes, CLI binary, and wires into existing EventStore message pipeline.'
status: accepted
date: "2026-04-04"
---

# agent-network
## Goal

Add cross-session awareness via 4 server components: session-index, task-ledger, transcript-search, project-agent. ResourceRegistry removed after triage (premature distributed primitives, zero data path). Adds HTTP routes, CLI binary, and wires into existing EventStore message pipeline.
