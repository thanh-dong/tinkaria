---
id: adr-20260404-agent-network
c3-seal: d41679a697be8fdaec82aa1eff194de591d19ae13dad0e57d0d0b52584c91519
title: agent-network
type: adr
goal: 'Add cross-session awareness via 4 server components: session-index, task-ledger, transcript-search, project-agent. ResourceRegistry removed after triage (premature distributed primitives, zero data path). Adds HTTP routes, CLI binary, and wires into existing EventStore message pipeline.'
status: accepted
date: "2026-04-04"
---
