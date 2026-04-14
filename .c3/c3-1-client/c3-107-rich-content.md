---
id: c3-107
c3-seal: 0afc412470af324cb08b311590a6c1a9ffed9381bed0d3d31b19c6cf692ab795
title: rich-content
type: component
category: foundation
parent: c3-1
goal: Shared rich-content viewer primitives for transcript and preview artifacts, including overlays, embedded renders, remote iframe-style embeds, toolbar controls, table of contents, and markdown hints.
uses:
    - recipe-agent-turn-render-flow
    - ref-component-identity-mapping
    - ref-live-transcript-render-contract
    - ref-mcp-app-hosting
    - ref-responsive-modal-pattern
    - rule-bun-test-conventions
    - rule-error-extraction
    - rule-react-no-effects
    - rule-rule-strict-typescript
    - rule-transcript-boundary-regressions
---

## Goal

Shared rich-content viewer primitives for transcript and preview artifacts, including overlays, embedded renders, remote iframe-style embeds, toolbar controls, table of contents, and markdown hints.

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | Rich artifact source payloads from transcript and file preview flows | c3-111 |
| IN | Shared UI primitives used by overlays and toolbars | c3-104 |
| OUT | Reusable overlay and viewer building blocks for transcript artifacts, including Diashort and other direct embeds | c3-106 |
| OUT | Reusable overlay and viewer building blocks for local file preview and other message surfaces | c3-111 |
## Related Refs

| Ref | Role |
| --- | --- |
| ref-component-identity-mapping |  |
| ref-responsive-modal-pattern |  |
| ref-mcp-app-hosting |  |
| ref-live-transcript-render-contract |  |
| recipe-agent-turn-render-flow |  |
## Related Rules

| Rule | Constraint |
| --- | --- |
| rule-bun-test-conventions | Overlay, hint, render/source mode, and embed behavior stay regression-tested |
| rule-react-no-effects | Viewer primitives stay declarative and reusable |
| rule-rule-strict-typescript | Artifact viewer props and content modes stay strongly typed |
| rule-error-extraction |  |
| rule-transcript-boundary-regressions |  |
## Container Connection

Part of c3-1 (client). This is the reusable rich-artifact rendering layer underneath transcript cards and preview modals, so new structured content features can reuse one visual/runtime contract instead of bespoke shells, including direct remote embeds when a hosted artifact is more useful than raw source.
