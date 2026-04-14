---
id: c3-120
c3-seal: 8d3b7f1610f683f54732ac2becb4d160d16c4abbf2464635f857b54a0e3eeab5
title: extensions
type: component
category: feature
parent: c3-1
goal: Extension host for the Project Page — auto-detects relevant project extensions via filesystem probes, renders them as SegmentedControl tabs. Lazy-loads extension React components (c3 architecture, agents config, code overview).
uses:
    - ref-mobile-tabbed-page-pattern
    - ref-ref-tailwind-theming
    - ref-screen-composition-patterns
    - rule-error-extraction
    - rule-ui-component-usage
---

## Goal

Extension host for the Project Page — auto-detects relevant project extensions via filesystem probes, renders them as SegmentedControl tabs. Lazy-loads extension React components (c3 architecture, agents config, code overview).

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | SidebarData.workspaceGroups (localPath resolution) | c3-113 |
| IN | DetectionResult[] from /api/ext/detect | c3-227 |
| IN | Extension data from /api/ext/:id/* routes | c3-227 |
| IN | SegmentedControl tab component | c3-104 |
| OUT | Extension tab views rendered in ProjectPage | c3-101 |
## Related Refs

| Ref | Role |
| --- | --- |
| ref-mobile-tabbed-page-pattern | Compact header, alwaysShowLabels, no duplicate headings |
| ref-ref-tailwind-theming | Semantic CSS variable tokens only |
| ref-screen-composition-patterns | Card vocabulary for browse/discovery surfaces |
## Related Rules

| Rule | Role |
| --- | --- |
| rule-ui-component-usage | Use shared UI primitives for form elements |
| rule-error-extraction | error instanceof Error ? error.message : String(error) |
| rule-prefixed-logging | LOG_PREFIX for console.warn |
## Code Map

| File | Purpose |
| --- | --- |
| src/client/app/ProjectPage.tsx | Route component — detection fetch, tab bar, Suspense |
| src/client/extensions.config.ts | Extension registry with lazy import() |
| src/client/extensions/c3/client.tsx | C3 architecture tree/grid viewer |
| src/client/extensions/agents/client.tsx | Agent config structured cards |
| src/client/extensions/code/client.tsx | Language-specific project dashboard |
