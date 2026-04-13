---
id: c3-223
c3-seal: 460f8e9c13ca453e8ddcbc6783ada700243b5b600b19422df9bf78a9e3a78db4
title: skill-discovery
type: component
category: feature
parent: c3-2
goal: Discover skill directories from the filesystem (~/.claude/skills/ and <project>/.claude/skills/), cache results per project with configurable TTL, and provide discovered skill names to AgentCoordinator for injection into Codex system_init entries.
uses:
    - ref-component-identity-mapping
    - rule-bun-test-conventions
    - rule-error-extraction
    - rule-graceful-fallbacks
    - rule-prefixed-logging
    - rule-rule-bun-runtime
    - rule-rule-strict-typescript
---

## Goal

Discover skill directories from the filesystem (~/.claude/skills/ and <project>/.claude/skills/), cache results per project with configurable TTL, and provide discovered skill names to AgentCoordinator for injection into Codex system_init entries.

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | Project localPath for skill directory resolution | c3-210 |
| OUT | Discovered skill names array | c3-210 |
| OUT | Skills injected into codexSystemInitEntry slashCommands | c3-216 |
## Container Connection
