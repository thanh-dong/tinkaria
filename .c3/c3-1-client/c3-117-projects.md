---
id: c3-117
c3-seal: aec9d77d8edd8dbdd54781ee472c013f409838ea9195ed44c49e398e0f4c1ecd
title: projects
type: component
category: feature
parent: c3-1
goal: 'Render the `/` local-projects screen: connection/setup states, recent-session resume cards, project stats, workspace cards, and the add-project modal, all with semantic UI ids that map the home screen back into C3.'
uses:
    - c3-108
    - recipe-project-c3-app-flow
    - recipe-project-c3-jtbd-flow
    - ref-component-identity-mapping
    - ref-mcp-app-jtbd
    - ref-project-c3-app-surface
    - ref-responsive-modal-pattern
    - ref-screen-composition-patterns
    - rule-react-no-effects
    - rule-rule-strict-typescript
    - rule-ui-component-usage
    - rule-ui-identity-composition
---

## Goal

Render the `/` local-projects screen: connection/setup states, recent-session resume cards, project stats, workspace cards, and the add-project modal, all with semantic UI ids that map the home screen back into C3.

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | Route placement from the app shell for / | c3-101 |
| IN | Local project and discovered session state from TinkariaState | c3-110 |
| IN | Shared semantic ui-id helpers for homepage tagging | c3-108 |
| OUT | Project open/create and session-resume intents back into app state | c3-110 |
## Related Refs

| Ref | Role |
| --- | --- |
| ref-ref-websocket-protocol | Project list comes from server discovery via WebSocket |
| c3-108 |  |
| ref-component-identity-mapping |  |
| ref-responsive-modal-pattern |  |
| ref-project-c3-app-surface |  |
| recipe-project-c3-app-flow |  |
| recipe-project-c3-jtbd-flow |  |
| ref-mcp-app-jtbd |  |
| ref-screen-composition-patterns |  |
## Related Rules

| Rule | Constraint |
| --- | --- |
| rule-rule-strict-typescript | Strict typing enforced across all source files |
| rule-react-no-effects |  |
| rule-ui-identity-composition |  |
| rule-ui-component-usage |  |
## Container Connection

Part of c3-1 (client). This is the home screen subtree under `/`: PageHeader, LocalDev cards, recent-session resume affordances, workspace grid, and NewProjectModal together define the route-level project discovery experience.
