---
id: c3-120
c3-seal: 8d3b7f1610f683f54732ac2becb4d160d16c4abbf2464635f857b54a0e3eeab5
title: extensions
type: component
category: feature
parent: c3-1
goal: Extension host for the Project Page — auto-detects relevant project extensions via filesystem probes, renders them as SegmentedControl tabs. Lazy-loads extension React components (c3 architecture, agents config, code overview). User preferences (enable/disable) override detection results globally.
uses:
    - ref-mobile-tabbed-page-pattern
    - ref-ref-tailwind-theming
    - ref-screen-composition-patterns
    - ref-ref-event-sourcing
    - rule-error-extraction
    - rule-ui-component-usage
---

## Goal

Extension host for the Project Page — auto-detects relevant project extensions via filesystem probes, renders them as SegmentedControl tabs. Lazy-loads extension React components (c3 architecture, agents config, code overview). User preferences (enable/disable) override detection results globally.

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | SidebarData.workspaceGroups (localPath resolution) | c3-113 |
| IN | DetectionResult[] from /api/ext/detect | c3-227 |
| IN | Extension data from /api/ext/:id/* routes | c3-227 |
| IN | ExtensionPreferencesSnapshot via WS subscription | c3-227 |
| IN | SegmentedControl tab component | c3-104 |
| OUT | Extension tab views rendered in ProjectPage | c3-101 |
| OUT | ExtensionsTab settings UI in SettingsPage | c3-101 |
## Related Refs

| Ref | Role |
| --- | --- |
| ref-mobile-tabbed-page-pattern | Compact header, alwaysShowLabels, no duplicate headings |
| ref-ref-tailwind-theming | Semantic CSS variable tokens only |
| ref-screen-composition-patterns | Card vocabulary for browse/discovery surfaces |
| ref-ref-event-sourcing | Extension preferences persisted as event-sourced JSONL |
## Related Rules

| Rule | Role |
| --- | --- |
| rule-ui-component-usage | Use shared UI primitives for form elements |
| rule-error-extraction | error instanceof Error ? error.message : String(error) |
| rule-prefixed-logging | LOG_PREFIX for console.warn |

## Extension Preferences (Client)

Three-level visibility hierarchy determines whether an extension appears in a ProjectPage:

1. **Manifest declares** — extension exists in `clientExtensions` / `serverExtensions` registries
2. **Filesystem detects** — `/api/ext/detect` probes the project path; only detected extensions proceed
3. **User preferences override** — if `pref.enabled === false`, the extension is hidden even when detected

`useExtensionPreferencesSubscription` subscribes to the `extension-preferences` WebSocket topic and returns an `ExtensionPreferencesSnapshot`. ProjectPage's `activeExtensions` memo combines detection results with preferences: `detectedIds.includes(ext.id) && pref?.enabled !== false`.

`ExtensionsTab` (rendered in SettingsPage) lists all registered extensions with toggle switches. Toggling sends `extension.preference.set` command via the socket transport. Preferences are global (not per-project) in v1.

## Code Map

| File | Purpose |
| --- | --- |
| src/client/app/ProjectPage.tsx | Route component — detection fetch, preference-aware filtering, tab bar, Suspense |
| src/client/app/ExtensionsTab.tsx | Settings UI — lists extensions with enable/disable toggles |
| src/client/app/useExtensionPreferencesSubscription.ts | WS subscription hook for ExtensionPreferencesSnapshot |
| src/client/extensions.config.ts | Extension registry with lazy import() |
| src/client/extensions/c3/client.tsx | C3 architecture tree/grid viewer |
| src/client/extensions/agents/client.tsx | Agent config structured cards |
| src/client/extensions/code/client.tsx | Language-specific project dashboard |
