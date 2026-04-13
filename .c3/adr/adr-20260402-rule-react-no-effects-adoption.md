---
id: adr-20260402-rule-react-no-effects-adoption
c3-seal: c5bc343ce27a232096a812886db94815c1e50b8c9eaa58103d87c8c369afe445
title: Adopt react-no-effects as client React standard
type: adr
goal: Adopt `rule-react-no-effects` as the standard for browser React code in Kanna. The rule is based on the React 19.2 guidance in "You Might Not Need an Effect" and narrows effect usage to true external-system synchronization only.
status: implemented
date: "2026-04-02"
---

## Goal

Adopt `rule-react-no-effects` as the standard for browser React code in Kanna. The rule is based on the React 19.2 guidance in "You Might Not Need an Effect" and narrows effect usage to true external-system synchronization only.

Affected client components:

- `c3-101` app-shell
- `c3-103` theme
- `c3-104` ui-primitives
- `c3-110` chat
- `c3-111` messages
- `c3-112` chat-input
- `c3-113` sidebar
- `c3-114` terminal
- `c3-115` right-sidebar
- `c3-116` settings
- `c3-117` projects
Adoption intent:

- eliminate effect-driven derived state and event workflows
- push resets to identity boundaries via `key`
- push user-caused workflows into event handlers
- prefer store/subscription APIs over ad-hoc component subscriptions
- keep any remaining effects isolated behind explicit boundary hooks/components
