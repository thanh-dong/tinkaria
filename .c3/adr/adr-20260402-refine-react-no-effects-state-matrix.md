---
id: adr-20260402-refine-react-no-effects-state-matrix
c3-seal: 4484b1ef89ec6398fd6af2e8dceb99412e4913629a50c76c9fb5c93d1d813831
title: Refine react-no-effects with state replacement matrix
type: adr
goal: Refine `rule-react-no-effects` so it gives concrete replacement choices for Kanna rather than only prohibitions.
status: implemented
date: "2026-04-02"
---

## Goal

Refine `rule-react-no-effects` so it gives concrete replacement choices for Kanna rather than only prohibitions.

Decision:

- Zustand is the current standard for shared browser-side client state and workflow coordination.
Zustand is the current standard for shared browser-side client state and workflow coordination.
Zustand is the current standard for shared browser-side client state and workflow coordination.
Zustand is the current standard for shared browser-side client state and workflow coordination.
Zustand is the current standard for shared browser-side client state and workflow coordination.
Zustand is the current standard for shared browser-side client state and workflow coordination.
Zustand is the current standard for shared browser-side client state and workflow coordination.
Zustand is the current standard for shared browser-side client state and workflow coordination.
Zustand is the current standard for shared browser-side client state and workflow coordination.
Zustand is the current standard for shared browser-side client state and workflow coordination.
Zustand is the current standard for shared browser-side client state and workflow coordination.
Zustand is the current standard for shared browser-side client state and workflow coordination.
Zustand is the current standard for shared browser-side client state and workflow coordination.
Zustand is the current standard for shared browser-side client state and workflow coordination.
Zustand is the current standard for shared browser-side client state and workflow coordination.
Zustand is the current standard for shared browser-side client state and workflow coordination.
- `useSyncExternalStore` or adapter hooks are the standard for external subscriptions.
`useSyncExternalStore` or adapter hooks are the standard for external subscriptions.
`useSyncExternalStore` or adapter hooks are the standard for external subscriptions.
`useSyncExternalStore` or adapter hooks are the standard for external subscriptions.
`useSyncExternalStore` or adapter hooks are the standard for external subscriptions.
`useSyncExternalStore` or adapter hooks are the standard for external subscriptions.
`useSyncExternalStore` or adapter hooks are the standard for external subscriptions.
`useSyncExternalStore` or adapter hooks are the standard for external subscriptions.
`useSyncExternalStore` or adapter hooks are the standard for external subscriptions.
`useSyncExternalStore` or adapter hooks are the standard for external subscriptions.
`useSyncExternalStore` or adapter hooks are the standard for external subscriptions.
`useSyncExternalStore` or adapter hooks are the standard for external subscriptions.
`useSyncExternalStore` or adapter hooks are the standard for external subscriptions.
`useSyncExternalStore` or adapter hooks are the standard for external subscriptions.
`useSyncExternalStore` or adapter hooks are the standard for external subscriptions.
`useSyncExternalStore` or adapter hooks are the standard for external subscriptions.
- TanStack Query is not currently installed and is not the default answer to Effect removal.
TanStack Query is not currently installed and is not the default answer to Effect removal.
TanStack Query is not currently installed and is not the default answer to Effect removal.
TanStack Query is not currently installed and is not the default answer to Effect removal.
TanStack Query is not currently installed and is not the default answer to Effect removal.
TanStack Query is not currently installed and is not the default answer to Effect removal.
TanStack Query is not currently installed and is not the default answer to Effect removal.
TanStack Query is not currently installed and is not the default answer to Effect removal.
TanStack Query is not currently installed and is not the default answer to Effect removal.
TanStack Query is not currently installed and is not the default answer to Effect removal.
TanStack Query is not currently installed and is not the default answer to Effect removal.
TanStack Query is not currently installed and is not the default answer to Effect removal.
TanStack Query is not currently installed and is not the default answer to Effect removal.
TanStack Query is not currently installed and is not the default answer to Effect removal.
TanStack Query is not currently installed and is not the default answer to Effect removal.
TanStack Query is not currently installed and is not the default answer to Effect removal.
- If TanStack Query is adopted later, it is reserved for pull-based remote server state such as fetch/cache/invalidate flows, not local UI state or NATS push subscriptions.
Why:
If TanStack Query is adopted later, it is reserved for pull-based remote server state such as fetch/cache/invalidate flows, not local UI state or NATS push subscriptions.
Why:
If TanStack Query is adopted later, it is reserved for pull-based remote server state such as fetch/cache/invalidate flows, not local UI state or NATS push subscriptions.
Why:
If TanStack Query is adopted later, it is reserved for pull-based remote server state such as fetch/cache/invalidate flows, not local UI state or NATS push subscriptions.
Why:
If TanStack Query is adopted later, it is reserved for pull-based remote server state such as fetch/cache/invalidate flows, not local UI state or NATS push subscriptions.
Why:
If TanStack Query is adopted later, it is reserved for pull-based remote server state such as fetch/cache/invalidate flows, not local UI state or NATS push subscriptions.
Why:
If TanStack Query is adopted later, it is reserved for pull-based remote server state such as fetch/cache/invalidate flows, not local UI state or NATS push subscriptions.
Why:
If TanStack Query is adopted later, it is reserved for pull-based remote server state such as fetch/cache/invalidate flows, not local UI state or NATS push subscriptions.
Why:
If TanStack Query is adopted later, it is reserved for pull-based remote server state such as fetch/cache/invalidate flows, not local UI state or NATS push subscriptions.
Why:
If TanStack Query is adopted later, it is reserved for pull-based remote server state such as fetch/cache/invalidate flows, not local UI state or NATS push subscriptions.
Why:
If TanStack Query is adopted later, it is reserved for pull-based remote server state such as fetch/cache/invalidate flows, not local UI state or NATS push subscriptions.
Why:
If TanStack Query is adopted later, it is reserved for pull-based remote server state such as fetch/cache/invalidate flows, not local UI state or NATS push subscriptions.
Why:
If TanStack Query is adopted later, it is reserved for pull-based remote server state such as fetch/cache/invalidate flows, not local UI state or NATS push subscriptions.
Why:
If TanStack Query is adopted later, it is reserved for pull-based remote server state such as fetch/cache/invalidate flows, not local UI state or NATS push subscriptions.
Why:
If TanStack Query is adopted later, it is reserved for pull-based remote server state such as fetch/cache/invalidate flows, not local UI state or NATS push subscriptions.
Why:
If TanStack Query is adopted later, it is reserved for pull-based remote server state such as fetch/cache/invalidate flows, not local UI state or NATS push subscriptions.
Why:
- The repo already uses Zustand extensively, so it is the lowest-friction replacement for mirrored local workflow state.
The repo already uses Zustand extensively, so it is the lowest-friction replacement for mirrored local workflow state.
The repo already uses Zustand extensively, so it is the lowest-friction replacement for mirrored local workflow state.
The repo already uses Zustand extensively, so it is the lowest-friction replacement for mirrored local workflow state.
The repo already uses Zustand extensively, so it is the lowest-friction replacement for mirrored local workflow state.
The repo already uses Zustand extensively, so it is the lowest-friction replacement for mirrored local workflow state.
The repo already uses Zustand extensively, so it is the lowest-friction replacement for mirrored local workflow state.
The repo already uses Zustand extensively, so it is the lowest-friction replacement for mirrored local workflow state.
The repo already uses Zustand extensively, so it is the lowest-friction replacement for mirrored local workflow state.
The repo already uses Zustand extensively, so it is the lowest-friction replacement for mirrored local workflow state.
The repo already uses Zustand extensively, so it is the lowest-friction replacement for mirrored local workflow state.
The repo already uses Zustand extensively, so it is the lowest-friction replacement for mirrored local workflow state.
The repo already uses Zustand extensively, so it is the lowest-friction replacement for mirrored local workflow state.
The repo already uses Zustand extensively, so it is the lowest-friction replacement for mirrored local workflow state.
The repo already uses Zustand extensively, so it is the lowest-friction replacement for mirrored local workflow state.
The repo already uses Zustand extensively, so it is the lowest-friction replacement for mirrored local workflow state.
- The React guidance behind this rule recommends explicit subscription boundaries rather than effect-driven synchronization.
The React guidance behind this rule recommends explicit subscription boundaries rather than effect-driven synchronization.
The React guidance behind this rule recommends explicit subscription boundaries rather than effect-driven synchronization.
The React guidance behind this rule recommends explicit subscription boundaries rather than effect-driven synchronization.
The React guidance behind this rule recommends explicit subscription boundaries rather than effect-driven synchronization.
The React guidance behind this rule recommends explicit subscription boundaries rather than effect-driven synchronization.
The React guidance behind this rule recommends explicit subscription boundaries rather than effect-driven synchronization.
The React guidance behind this rule recommends explicit subscription boundaries rather than effect-driven synchronization.
The React guidance behind this rule recommends explicit subscription boundaries rather than effect-driven synchronization.
The React guidance behind this rule recommends explicit subscription boundaries rather than effect-driven synchronization.
The React guidance behind this rule recommends explicit subscription boundaries rather than effect-driven synchronization.
The React guidance behind this rule recommends explicit subscription boundaries rather than effect-driven synchronization.
The React guidance behind this rule recommends explicit subscription boundaries rather than effect-driven synchronization.
The React guidance behind this rule recommends explicit subscription boundaries rather than effect-driven synchronization.
The React guidance behind this rule recommends explicit subscription boundaries rather than effect-driven synchronization.
The React guidance behind this rule recommends explicit subscription boundaries rather than effect-driven synchronization.
- Query libraries solve a different class of problem than most of Kanna's current Effect misuse.
Query libraries solve a different class of problem than most of Kanna's current Effect misuse.
Query libraries solve a different class of problem than most of Kanna's current Effect misuse.
Query libraries solve a different class of problem than most of Kanna's current Effect misuse.
Query libraries solve a different class of problem than most of Kanna's current Effect misuse.
Query libraries solve a different class of problem than most of Kanna's current Effect misuse.
Query libraries solve a different class of problem than most of Kanna's current Effect misuse.
Query libraries solve a different class of problem than most of Kanna's current Effect misuse.
Query libraries solve a different class of problem than most of Kanna's current Effect misuse.
Query libraries solve a different class of problem than most of Kanna's current Effect misuse.
Query libraries solve a different class of problem than most of Kanna's current Effect misuse.
Query libraries solve a different class of problem than most of Kanna's current Effect misuse.
Query libraries solve a different class of problem than most of Kanna's current Effect misuse.
Query libraries solve a different class of problem than most of Kanna's current Effect misuse.
Query libraries solve a different class of problem than most of Kanna's current Effect misuse.
Query libraries solve a different class of problem than most of Kanna's current Effect misuse.
