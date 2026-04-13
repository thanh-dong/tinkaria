---
id: c3-222
c3-seal: 161f7fe7bdbab55fc8a453bf334826a5c4a1723f0072c71bd890d5e356f90c51
title: project-agent
type: component
category: feature
parent: c3-2
goal: ProjectAgent — stateless delegation function aggregating SessionIndex, TaskLedger, and TranscriptSearchIndex. Provides query surface and deterministic coordination decisions via keyword-routed delegation. Exposed via HTTP routes and tinkaria-project CLI.
uses:
    - ref-component-identity-mapping
    - rule-bun-test-conventions
    - rule-rule-bun-runtime
    - rule-rule-strict-typescript
---

## Goal

ProjectAgent — stateless delegation function aggregating SessionIndex, TaskLedger, and TranscriptSearchIndex. Provides query surface and deterministic coordination decisions via keyword-routed delegation. Exposed via HTTP routes and tinkaria-project CLI.

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | Session summaries for query surface | c3-218 |
| IN | Task ownership data | c3-219 |
| IN | Transcript search results | c3-220 |
| IN | DelegationResult, shared types | c3-204 |
| OUT | HTTP routes under /api/project/* wired into server | c3-203 |
## Related Rules

| Rule | Role |
| --- | --- |
| rule-rule-bun-runtime | Server code uses Bun APIs exclusively |
| rule-rule-strict-typescript | Strict typing enforced |
| rule-bun-test-conventions | Bun test framework with describe/test grouping |
## Code References

| File | Purpose |
| --- | --- |
| src/server/project-agent.ts | ProjectAgent class — stateless delegation function |
| src/server/project-agent.test.ts | Tests for ProjectAgent |
| src/server/project-agent-routes.ts | HTTP route handlers for /api/project/* |
| src/server/project-agent-routes.test.ts | Tests for HTTP routes |
| src/server/project-cli.ts | CLI logic — arg parsing, output formatting, HTTP client |
| src/server/project-cli.test.ts | Tests for CLI |
| src/server/project-agent-integration.test.ts | End-to-end integration tests |
| src/shared/project-agent-types.ts | Shared types for all project agent components |
| bin/tinkaria-project | CLI binary entry point |
## Container Connection
