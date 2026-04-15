---
id: adr-20260401-queued-follow-up-messages
c3-seal: 787c2251ab5bfd7f0d44d86783211d8a5697ddb0c828d7ec83d6d08d478e176b
title: chat-queue-follow-up-staging
type: adr
goal: Add client-side follow-up prompt staging for the existing chat workflow. While a turn is still processing, submit should append textarea content into one queued multi-paragraph buffer instead of forcing an immediate send or requiring session interruption. The change is scoped to existing C3-mapped components `c3-110` (chat) and `c3-112` (chat-input), with queue flush continuing to use the existing typed `chat.send` path so `ref-ref-websocket-protocol` and `ref-ref-provider-abstraction` remain intact.
status: implemented
date: "2026-04-01"
---

## Goal

Add client-side follow-up prompt staging for the existing chat workflow. While a turn is still processing, submit should append textarea content into one queued multi-paragraph buffer instead of forcing an immediate send or requiring session interruption. The change is scoped to existing C3-mapped components `c3-110` (chat) and `c3-112` (chat-input), with queue flush continuing to use the existing typed `chat.send` path so `ref-ref-websocket-protocol` and `ref-ref-provider-abstraction` remain intact.

Work Breakdown:

- Add focused RED tests for busy-submit queueing, queue restore, idle flush, and flush-failure recovery.
Add focused RED tests for busy-submit queueing, queue restore, idle flush, and flush-failure recovery.
Add focused RED tests for busy-submit queueing, queue restore, idle flush, and flush-failure recovery.
Add focused RED tests for busy-submit queueing, queue restore, idle flush, and flush-failure recovery.
Add focused RED tests for busy-submit queueing, queue restore, idle flush, and flush-failure recovery.
Add focused RED tests for busy-submit queueing, queue restore, idle flush, and flush-failure recovery.
Add focused RED tests for busy-submit queueing, queue restore, idle flush, and flush-failure recovery.
Add focused RED tests for busy-submit queueing, queue restore, idle flush, and flush-failure recovery.
Add focused RED tests for busy-submit queueing, queue restore, idle flush, and flush-failure recovery.
Add focused RED tests for busy-submit queueing, queue restore, idle flush, and flush-failure recovery.
Add focused RED tests for busy-submit queueing, queue restore, idle flush, and flush-failure recovery.
Add focused RED tests for busy-submit queueing, queue restore, idle flush, and flush-failure recovery.
Add focused RED tests for busy-submit queueing, queue restore, idle flush, and flush-failure recovery.
Add focused RED tests for busy-submit queueing, queue restore, idle flush, and flush-failure recovery.
Add focused RED tests for busy-submit queueing, queue restore, idle flush, and flush-failure recovery.
Add focused RED tests for busy-submit queueing, queue restore, idle flush, and flush-failure recovery.
- Implement minimal typed queue state in `useKannaState` and thread it through `ChatPage` into `ChatInput`.
Implement minimal typed queue state in `useKannaState` and thread it through `ChatPage` into `ChatInput`.
Implement minimal typed queue state in `useKannaState` and thread it through `ChatPage` into `ChatInput`.
Implement minimal typed queue state in `useKannaState` and thread it through `ChatPage` into `ChatInput`.
Implement minimal typed queue state in `useKannaState` and thread it through `ChatPage` into `ChatInput`.
Implement minimal typed queue state in `useKannaState` and thread it through `ChatPage` into `ChatInput`.
Implement minimal typed queue state in `useKannaState` and thread it through `ChatPage` into `ChatInput`.
Implement minimal typed queue state in `useKannaState` and thread it through `ChatPage` into `ChatInput`.
Implement minimal typed queue state in `useKannaState` and thread it through `ChatPage` into `ChatInput`.
Implement minimal typed queue state in `useKannaState` and thread it through `ChatPage` into `ChatInput`.
Implement minimal typed queue state in `useKannaState` and thread it through `ChatPage` into `ChatInput`.
Implement minimal typed queue state in `useKannaState` and thread it through `ChatPage` into `ChatInput`.
Implement minimal typed queue state in `useKannaState` and thread it through `ChatPage` into `ChatInput`.
Implement minimal typed queue state in `useKannaState` and thread it through `ChatPage` into `ChatInput`.
Implement minimal typed queue state in `useKannaState` and thread it through `ChatPage` into `ChatInput`.
Implement minimal typed queue state in `useKannaState` and thread it through `ChatPage` into `ChatInput`.
- Add simple queue UI plus `ArrowUp` restore behavior in the composer.
Add simple queue UI plus `ArrowUp` restore behavior in the composer.
Add simple queue UI plus `ArrowUp` restore behavior in the composer.
Add simple queue UI plus `ArrowUp` restore behavior in the composer.
Add simple queue UI plus `ArrowUp` restore behavior in the composer.
Add simple queue UI plus `ArrowUp` restore behavior in the composer.
Add simple queue UI plus `ArrowUp` restore behavior in the composer.
Add simple queue UI plus `ArrowUp` restore behavior in the composer.
Add simple queue UI plus `ArrowUp` restore behavior in the composer.
Add simple queue UI plus `ArrowUp` restore behavior in the composer.
Add simple queue UI plus `ArrowUp` restore behavior in the composer.
Add simple queue UI plus `ArrowUp` restore behavior in the composer.
Add simple queue UI plus `ArrowUp` restore behavior in the composer.
Add simple queue UI plus `ArrowUp` restore behavior in the composer.
Add simple queue UI plus `ArrowUp` restore behavior in the composer.
Add simple queue UI plus `ArrowUp` restore behavior in the composer.
- Run a no-slop pass, simplify pass, and review pass before verification.
Run a no-slop pass, simplify pass, and review pass before verification.
Run a no-slop pass, simplify pass, and review pass before verification.
Run a no-slop pass, simplify pass, and review pass before verification.
Run a no-slop pass, simplify pass, and review pass before verification.
Run a no-slop pass, simplify pass, and review pass before verification.
Run a no-slop pass, simplify pass, and review pass before verification.
Run a no-slop pass, simplify pass, and review pass before verification.
Run a no-slop pass, simplify pass, and review pass before verification.
Run a no-slop pass, simplify pass, and review pass before verification.
Run a no-slop pass, simplify pass, and review pass before verification.
Run a no-slop pass, simplify pass, and review pass before verification.
Run a no-slop pass, simplify pass, and review pass before verification.
Run a no-slop pass, simplify pass, and review pass before verification.
Run a no-slop pass, simplify pass, and review pass before verification.
Run a no-slop pass, simplify pass, and review pass before verification.
- Perform ref/rule compliance checks for `ref-ref-websocket-protocol`, `ref-ref-zustand-stores`, `ref-ref-provider-abstraction`, `rule-bun-test-conventions`, `rule-prefixed-logging`, and `rule-rule-strict-typescript`.
Perform ref/rule compliance checks for `ref-ref-websocket-protocol`, `ref-ref-zustand-stores`, `ref-ref-provider-abstraction`, `rule-bun-test-conventions`, `rule-prefixed-logging`, and `rule-rule-strict-typescript`.
Perform ref/rule compliance checks for `ref-ref-websocket-protocol`, `ref-ref-zustand-stores`, `ref-ref-provider-abstraction`, `rule-bun-test-conventions`, `rule-prefixed-logging`, and `rule-rule-strict-typescript`.
Perform ref/rule compliance checks for `ref-ref-websocket-protocol`, `ref-ref-zustand-stores`, `ref-ref-provider-abstraction`, `rule-bun-test-conventions`, `rule-prefixed-logging`, and `rule-rule-strict-typescript`.
Perform ref/rule compliance checks for `ref-ref-websocket-protocol`, `ref-ref-zustand-stores`, `ref-ref-provider-abstraction`, `rule-bun-test-conventions`, `rule-prefixed-logging`, and `rule-rule-strict-typescript`.
Perform ref/rule compliance checks for `ref-ref-websocket-protocol`, `ref-ref-zustand-stores`, `ref-ref-provider-abstraction`, `rule-bun-test-conventions`, `rule-prefixed-logging`, and `rule-rule-strict-typescript`.
Perform ref/rule compliance checks for `ref-ref-websocket-protocol`, `ref-ref-zustand-stores`, `ref-ref-provider-abstraction`, `rule-bun-test-conventions`, `rule-prefixed-logging`, and `rule-rule-strict-typescript`.
Perform ref/rule compliance checks for `ref-ref-websocket-protocol`, `ref-ref-zustand-stores`, `ref-ref-provider-abstraction`, `rule-bun-test-conventions`, `rule-prefixed-logging`, and `rule-rule-strict-typescript`.
Perform ref/rule compliance checks for `ref-ref-websocket-protocol`, `ref-ref-zustand-stores`, `ref-ref-provider-abstraction`, `rule-bun-test-conventions`, `rule-prefixed-logging`, and `rule-rule-strict-typescript`.
Perform ref/rule compliance checks for `ref-ref-websocket-protocol`, `ref-ref-zustand-stores`, `ref-ref-provider-abstraction`, `rule-bun-test-conventions`, `rule-prefixed-logging`, and `rule-rule-strict-typescript`.
Perform ref/rule compliance checks for `ref-ref-websocket-protocol`, `ref-ref-zustand-stores`, `ref-ref-provider-abstraction`, `rule-bun-test-conventions`, `rule-prefixed-logging`, and `rule-rule-strict-typescript`.
Perform ref/rule compliance checks for `ref-ref-websocket-protocol`, `ref-ref-zustand-stores`, `ref-ref-provider-abstraction`, `rule-bun-test-conventions`, `rule-prefixed-logging`, and `rule-rule-strict-typescript`.
Perform ref/rule compliance checks for `ref-ref-websocket-protocol`, `ref-ref-zustand-stores`, `ref-ref-provider-abstraction`, `rule-bun-test-conventions`, `rule-prefixed-logging`, and `rule-rule-strict-typescript`.
Perform ref/rule compliance checks for `ref-ref-websocket-protocol`, `ref-ref-zustand-stores`, `ref-ref-provider-abstraction`, `rule-bun-test-conventions`, `rule-prefixed-logging`, and `rule-rule-strict-typescript`.
Perform ref/rule compliance checks for `ref-ref-websocket-protocol`, `ref-ref-zustand-stores`, `ref-ref-provider-abstraction`, `rule-bun-test-conventions`, `rule-prefixed-logging`, and `rule-rule-strict-typescript`.
Perform ref/rule compliance checks for `ref-ref-websocket-protocol`, `ref-ref-zustand-stores`, `ref-ref-provider-abstraction`, `rule-bun-test-conventions`, `rule-prefixed-logging`, and `rule-rule-strict-typescript`.
- Finish with `c3x check` and mark the ADR implemented after verification.
Risks:
Finish with `c3x check` and mark the ADR implemented after verification.
Risks:
Finish with `c3x check` and mark the ADR implemented after verification.
Risks:
Finish with `c3x check` and mark the ADR implemented after verification.
Risks:
Finish with `c3x check` and mark the ADR implemented after verification.
Risks:
Finish with `c3x check` and mark the ADR implemented after verification.
Risks:
Finish with `c3x check` and mark the ADR implemented after verification.
Risks:
Finish with `c3x check` and mark the ADR implemented after verification.
Risks:
Finish with `c3x check` and mark the ADR implemented after verification.
Risks:
Finish with `c3x check` and mark the ADR implemented after verification.
Risks:
Finish with `c3x check` and mark the ADR implemented after verification.
Risks:
Finish with `c3x check` and mark the ADR implemented after verification.
Risks:
Finish with `c3x check` and mark the ADR implemented after verification.
Risks:
Finish with `c3x check` and mark the ADR implemented after verification.
Risks:
Finish with `c3x check` and mark the ADR implemented after verification.
Risks:
Finish with `c3x check` and mark the ADR implemented after verification.
Risks:
- Duplicate flushes on runtime state churn.
Duplicate flushes on runtime state churn.
Duplicate flushes on runtime state churn.
Duplicate flushes on runtime state churn.
Duplicate flushes on runtime state churn.
Duplicate flushes on runtime state churn.
Duplicate flushes on runtime state churn.
Duplicate flushes on runtime state churn.
Duplicate flushes on runtime state churn.
Duplicate flushes on runtime state churn.
Duplicate flushes on runtime state churn.
Duplicate flushes on runtime state churn.
Duplicate flushes on runtime state churn.
Duplicate flushes on runtime state churn.
Duplicate flushes on runtime state churn.
Duplicate flushes on runtime state churn.
- Draft/queue state confusion.
Draft/queue state confusion.
Draft/queue state confusion.
Draft/queue state confusion.
Draft/queue state confusion.
Draft/queue state confusion.
Draft/queue state confusion.
Draft/queue state confusion.
Draft/queue state confusion.
Draft/queue state confusion.
Draft/queue state confusion.
Draft/queue state confusion.
Draft/queue state confusion.
Draft/queue state confusion.
Draft/queue state confusion.
Draft/queue state confusion.
- Divergence between busy UI state and actual send gating.
Divergence between busy UI state and actual send gating.
Divergence between busy UI state and actual send gating.
Divergence between busy UI state and actual send gating.
Divergence between busy UI state and actual send gating.
Divergence between busy UI state and actual send gating.
Divergence between busy UI state and actual send gating.
Divergence between busy UI state and actual send gating.
Divergence between busy UI state and actual send gating.
Divergence between busy UI state and actual send gating.
Divergence between busy UI state and actual send gating.
Divergence between busy UI state and actual send gating.
Divergence between busy UI state and actual send gating.
Divergence between busy UI state and actual send gating.
Divergence between busy UI state and actual send gating.
Divergence between busy UI state and actual send gating.
