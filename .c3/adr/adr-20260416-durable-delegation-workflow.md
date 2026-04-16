---
id: adr-20260416-durable-delegation-workflow
c3-seal: 60b4e4be21b5a5f2b7d50e3c6f9759ee9e8e3713111a1df37690db5ea8ae944b
title: durable-delegation-workflow
type: adr
goal: 'Enable Tinkaria''s orchestration layer to persist delegation relationships (parent to child agent chains) across session boundaries, providing a durable workflow execution primitive: orchestrate, delegate, await, reconcile. Current orchestration state (origins, children, waiters) lives in in-memory Maps and is destroyed when a parent turn ends or the server restarts.'
status: proposed
date: "2026-04-16"
---

## Goal

Enable Tinkaria's orchestration layer to persist delegation relationships (parent to child agent chains) across session boundaries, providing a durable workflow execution primitive: orchestrate, delegate, await, reconcile. Current orchestration state (origins, children, waiters) lives in in-memory Maps and is destroyed when a parent turn ends or the server restarts.

This ADR hardens the original durable-delegation design into an implementation-safe plan with explicit lifecycle ownership, idempotency, queue precedence, restart reconciliation, configurable resume gates, and verification gates.

Context: SessionOrchestrator (c3-206) currently owns cross-session agent delegation via in-memory Maps. wait_agent is turn-bound with a 120-second default timeout and is lost across restart. TranscriptConsumer (c3-226) already observes terminal child turn events while RunnerProxy (c3-210) already owns active-turn and queued-turn draining through drainQueuedTurn(). The durable workflow must reuse those seams without spreading delegation state across random call sites.

Decision 1 - Single Lifecycle Owner: Add a server-side DelegationCoordinator as the only owner of durable delegation lifecycle, idempotency, reconciliation, and resume decisions. SessionOrchestrator owns tool API and caller authorization only. DelegationCoordinator owns KV records, secondary indexes, CAS state transitions, result injection, orphan handling, and parent resume eligibility. TranscriptConsumer observes child terminal events and calls DelegationCoordinator.reconcileChildTerminal. RunnerProxy starts parent resume turns through drainDelegationResult.

Decision 2 - Durable Delegation Records in NATS KV: Store live delegation metadata in a workspace-scoped NATS KV bucket. Primary key: delegation.{workspaceId}.{delegationId}. Secondary child lookup key: delegation_by_child.{workspaceId}.{childChatId}.{delegationId}. Write ordering: primary MUST be written before secondary. Boot reconciliation rebuilds secondary from primary if mismatch. Record schema includes delegationId, workspaceId, parentChatId, childChatId, childProvider (claude or codex), instructionPreview, mode (blocking or background), resume (immediate or gate, default gate), status (active, completing, completed, failed, orphaned, stale), depth (0-2 max), resumeHint (optional, system-generated fallback from buildDelegatedContext), resultSummary, resultRef, isError, timestamps, agentResultEntryId, and revision/CAS metadata. All transitions use CAS guards. Duplicate terminal events are no-ops.

Decision 3 - EventStore Role: KV is live workflow state. EventStore is audit/replay/read-model history. Transcript is user-visible fact. JSONL events (delegation_initiated, delegation_completed, delegation_orphaned, delegation_stale) are audit only, not a second source of truth. Note: existing drainQueuedTurn uses EventStore as truth while drainDelegationResult uses KV as truth. Document this pattern difference clearly in code.

Decision 4 - Two Delegation Modes with Configurable Resume: spawn_agent gains mode (blocking or background, default blocking) and resume (immediate or gate, default gate), returns chatId and delegationId. Blocking with gate: inject results as they arrive, auto-resume parent only when ALL blocking children reach terminal state and parent is idle with no user queued turn. Blocking with immediate: each child completion independently triggers parent resume eligibility when parent is idle with no user queued turn. Background: passive agent_result injection, no awaiting_agents status, no auto-resume, resume setting ignored.

Decision 5 - User Input Precedence: User input always allowed during awaiting_agents. User queued input wins over auto-resume. drainDelegationResult must not fire while a queued user turn exists. This prevents background resume from racing ahead of explicit user intent.

Decision 6 - Synthetic agent_result Event: New transcript entry kind with delegationId, childChatId, childProvider, mode, instructionPreview, resumeHint, resultSummary, resultRef, isError, completedAt. Renders as system card with child link and collapsible result.

Decision 7 - resumeHint Authoring: Optional in spawn_agent. If omitted, system generates from last N parent transcript entries (reuses buildDelegatedContext approach). Stored in KV at creation time, not at resume time.

Decision 8 - Chat Status: awaiting_agents derived from KV state (idle chat with active blocking delegations). Sidebar badge from read model, not in-memory maps.

Decision 9 - Tinkaria-Only Orchestration: Provider-native SDK Agent tool disabled at prompt/tool registry boundary. Tinkaria is single source of truth for parent-child relationships.

Boot Reconciliation: On server boot DelegationCoordinator sweeps active KV delegations. Parent missing: mark orphaned. Child missing: mark orphaned or failed with evidence. Child already terminal: complete and inject idempotently. Child still active: keep active. Record too old: mark stale with log. Record stuck completing with agentResultEntryId: transition to completed. Record stuck completing without agentResultEntryId: check child, retry injection or mark failed. Secondary index missing: rebuild from primary. No stale delegation silently deleted.

Edge Cases: Duplicate terminals handled by CAS plus agentResultEntryId. Parent active when child completes: defer resume. User queued turn wins. Gate mode waits for all blocking children. Immediate mode resumes per-child. Background failure injects error card without marking parent failed. Context overflow handled by provider compaction plus resumeHint. Depth 3 rejected before child creation. Large results use event-store refs. Secondary index rebuilt on boot. Completing stuck state resolved by boot reconciliation.

Acceptance Criteria: Every child terminal produces zero or one parent agent_result. Server restart preserves delegation state. No double parent turns from queued user input and delegation resume race. User queued input runs before auto-resume. Sidebar derives awaiting_agents from KV without in-memory maps. Boot cleanup marks orphaned and stale with evidence. Depth 3 rejected before child creation. Resume immediate triggers per-child, resume gate waits for all. Secondary index consistent after boot. Completing stuck state handled on boot.

TDD Plan - RED tests: spawn persists delegation returning delegationId, restart reconstructs from KV, duplicate terminals produce exactly one agent_result, gate resumes after all children, immediate resumes per-child, user queued input wins over auto-resume, background never sets awaiting_agents, deleted parent marks orphaned, missing child reconciled, completing stuck resolved, depth 3 rejected, sidebar derives from KV, secondary index rebuilt on mismatch.

TDD Plan - GREEN order: 1) shared types (DurableDelegation, agent_result, awaiting_agents, tool mode/resume shapes), 2) DelegationCoordinator (KV adapter, indexes, CAS transitions, boot reconciliation, idempotent result injection, resumeHint fallback), 3) SessionOrchestrator (mode-aware spawn with resume option through coordinator), 4) TranscriptConsumer/server wiring (terminal reconciliation trigger), 5) RunnerProxy (drainDelegationResult with user precedence and resume-mode awareness), 6) Read models/sidebar/chat/messages (status badge, system card), 7) Provider/tool registry (disable SDK Agent).

Verification: Focused Bun tests, bunx @typescript/native-preview --noEmit typecheck, c3x check --include-adr, git diff --check, axi browser smoke for sidebar badge and system card rendering.

Affected: c3-206 orchestration, c3-226 transcript-runtime, c3-204 shared-types, c3-210 agent, c3-110 chat, c3-113 sidebar, c3-111 messages.

Reused: drainQueuedTurn shape (different durability source), EventStore append patterns, NATS KV bucket patterns, appendMessage for injection, TranscriptConsumer terminal events, ChatRecord.sessionToken, buildDelegatedContext for resumeHint fallback.
