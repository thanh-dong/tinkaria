---
id: c3-227
c3-seal: 2cd278d33b731800fb469c149e8cb478ceea723ac107f860933f7c65ecf659c6
title: extension-router
type: component
category: feature
parent: c3-2
goal: Server-side extension infrastructure — filesystem detection, route multiplexing, and three first-party extension handlers (c3 architecture via c3x CLI, agents config via file parsing, code manifests via language-specific parsers).
uses:
    - rule-error-extraction
    - rule-graceful-fallbacks
    - rule-prefixed-logging
    - rule-rule-bun-runtime
---

## Goal

Server-side extension infrastructure — filesystem detection, route multiplexing, and three first-party extension handlers (c3 architecture via c3x CLI, agents config via file parsing, code manifests via language-specific parsers).

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | HTTP requests on /api/ext/* | c3-204 |
| IN | Project filesystem for detection probes | c3-213 |
| OUT | DetectionResult[] for extension discovery | c3-120 |
| OUT | Extension-specific JSON data | c3-120 |
## Related Refs

| Ref | Role |
| --- | --- |
| ref-ref-tailwind-theming | N/A (server-side) |
## Related Rules

| Rule | Role |
| --- | --- |
| rule-error-extraction | error instanceof Error ? error.message : String(error) in catch blocks |
| rule-prefixed-logging | LOG_PREFIX constant for all log output |
| rule-graceful-fallbacks | Handle missing c3x, missing files, malformed JSON |
| rule-rule-bun-runtime | Bun.spawn for c3x, Bun.file for reads |
## Code Map

| File | Purpose |
| --- | --- |
| src/server/extension-router.ts | Route multiplexer + filesystem detection |
| src/server/extensions.config.ts | Extension registry |
| src/server/extensions/c3/server.ts | C3 extension — shells to c3x CLI |
| src/server/extensions/agents/server.ts | Agents extension — parses CLAUDE.md, skills, agents.md |
| src/server/extensions/code/server.ts | Code extension — parses package.json, Cargo.toml, go.mod, pyproject.toml |
| src/shared/extension-types.ts | Shared contract types |
