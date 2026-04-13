---
id: adr-20260402-eliminate-frontend-effect-violations-master-plan
c3-seal: 59fdb8f2d816feabfe616f7633a4b582ec9a7f437be59dca1893be27de418094
title: Plan phased elimination of frontend effect violations
type: adr
goal: Plan the phased elimination of all currently-audited frontend violations of `rule-react-no-effects`.
status: proposed
date: "2026-04-02"
---

## Goal

Plan the phased elimination of all currently-audited frontend violations of `rule-react-no-effects`.

Approach:

- one master plan with phased execution rather than independent mini-plans
- Phase 1: state/workflow core (`useKannaState`, `ChatInput`, `SettingsPage`)
- Phase 2: modal/dialog identity cleanup (`NewProjectModal`, `app-dialog`)
- Phase 3: presentation cleanup (`ChatPage` empty-state animation)
- Phase 4: re-audit and verification
The plan intentionally preserves allowed boundary Effects such as socket subscriptions, `ResizeObserver`, xterm lifecycle wiring, and focused DOM/layout adapter hooks.
