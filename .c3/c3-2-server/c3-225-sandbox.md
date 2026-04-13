---
id: c3-225
c3-seal: 1d1083de637815aa8d1cefacfd60469dd2da3561957e79e1c491aed4440ca55b
title: sandbox
type: component
category: feature
parent: c3-2
goal: Docker-based workspace isolation — create, manage, and monitor sandbox containers per workspace with health checks, NATS communication, and security constraints.
uses:
    - ref-ref-event-sourcing
    - ref-ref-websocket-protocol
    - ref-workspace-journey-test-contracts
    - rule-bun-test-conventions
    - rule-error-extraction
    - rule-journey-test-coverage
    - rule-prefixed-logging
    - rule-rule-bun-runtime
    - rule-rule-strict-typescript
    - rule-ui-component-usage
---

## Goal

Docker-based workspace isolation — create, manage, and monitor sandbox containers per workspace with health checks, NATS communication, and security constraints.

## Responsibilities

- SandboxManager wraps Docker CLI for container lifecycle (create, start, stop, destroy, exec, logs, inspect)
- BunDockerClient provides Bun.spawn-based Docker command execution
- SandboxHealthMonitor polls running containers and tracks consecutive failures
- Security: --cap-drop ALL, --security-opt=no-new-privileges, --read-only rootfs
## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | EventStore mutations and state | c3-201 |
| IN | Read model derivation | c3-214 |
| OUT | Sandbox snapshots via NATS | c3-205 |
| OUT | SandboxPanel renders status | c3-209 |
## Related Refs

| Ref | Role |
| --- | --- |
| ref-ref-event-sourcing | Sandbox events follow append-only JSONL pattern |
| ref-ref-websocket-protocol | Snapshot publishing uses dual-channel pattern |
| ref-workspace-journey-test-contracts |  |
## Related Rules

| Rule | Role |
| --- | --- |
| rule-error-extraction | Safe error extraction in catch blocks |
| rule-prefixed-logging | LOG_PREFIX in server, local prefix in subprocess |
| rule-bun-test-conventions | All test files follow Bun test patterns |
| rule-rule-strict-typescript | Strict types, no any |
| rule-rule-bun-runtime | Bun APIs only |
| rule-ui-component-usage | SandboxPanel uses Button primitive |
| rule-journey-test-coverage |  |
## Container Connection

Extends event-store (c3-201) with sandbox events/reducers, nats-transport (c3-205) with sandbox stream/responders, and read-models (c3-214) with deriveSandboxSnapshot.

**Files:**

- `src/server/sandbox-manager.ts` — DockerClient + BunDockerClient + SandboxManager
- `src/server/sandbox-manager.test.ts` — 9 unit tests
- `src/server/sandbox-health.ts` — SandboxHealthMonitor
- `src/server/sandbox-health.test.ts` — 5 health monitor tests
- `src/shared/sandbox-types.ts` — Types
- `src/sandbox/Dockerfile` — Container image
- `src/sandbox/entrypoint.ts` — Container entrypoint
- `src/client/components/coordination/SandboxPanel.tsx` — UI panel
- `src/client/app/useSandboxSubscription.ts` — Subscription hook
