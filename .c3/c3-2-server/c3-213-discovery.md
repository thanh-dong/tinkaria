---
id: c3-213
c3-seal: 50d6615b0c10e83d814c9d0df2d82d2abad3fef5de7951aba1331ef4e2eaed66
title: discovery
type: component
category: feature
parent: c3-2
goal: Local project discovery — scans Claude (~/.claude/projects/) and Codex (~/.codex/sessions/, config.toml) history directories to find previously used project paths.
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

Local project discovery — scans Claude (~/.claude/projects/) and Codex (~/.codex/sessions/, config.toml) history directories to find previously used project paths.

## Dependencies

- c3-204 (shared-types) — AgentProvider
- src/server/paths.ts (resolveLocalPath)
- Node fs (existsSync, readFileSync, readdirSync, statSync)
## Related Refs

| Ref | Role |
| --- | --- |
| ref-component-identity-mapping |  |
## Related Rules

| Rule | Constraint |
| --- | --- |
| rule-rule-bun-runtime | Server code uses Bun APIs exclusively |
| rule-rule-strict-typescript | Strict typing enforced across all source files |
| rule-bun-test-conventions |  |
| rule-prefixed-logging |  |
| rule-error-extraction |  |
| rule-graceful-fallbacks |  |
## Container Connection

Part of c3-2 (server). Feeds the local-projects subscription in ws-router (c3-202) and the project picker in the client UI.
