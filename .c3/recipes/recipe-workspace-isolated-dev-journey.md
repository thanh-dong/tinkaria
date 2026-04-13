---
id: recipe-workspace-isolated-dev-journey
c3-seal: 1a19649725f7fe91bc42d79ca71ada64a7125fd33337d79a99240788ad5a7af4
title: workspace-isolated-dev-journey
type: recipe
goal: 'Trace the sandbox isolation journey: user creates a Docker sandbox, monitors its lifecycle, and manages container state.'
---

## Goal

Trace the sandbox isolation journey: user creates a Docker sandbox, monitors its lifecycle, and manages container state.

### JTBD

When I want to run code in an isolated environment, I want to create and manage a sandbox container so that experiments don't affect my main workspace.

### Screen Flow

| Stage | Route | Panel | User Action | Expected State Change |
| --- | --- | --- | --- | --- |
| 1. No sandbox | /workspace/:id | SandboxPanel | Observe empty state | "No sandbox configured" message + Create button |
| 2. Create sandbox | /workspace/:id | SandboxPanel | Click "Create" | Status badge → "creating" (yellow) → "running" (green) |
| 3. View sandbox info | /workspace/:id | SandboxPanel | Observe info grid | Container ID, Memory, CPU Shares displayed |
| 4. Stop sandbox | /workspace/:id | SandboxPanel | Click "Stop" | Status → "stopped" (gray), Start button appears |
| 5. Start sandbox | /workspace/:id | SandboxPanel | Click "Start" | Status → "running" (green), Stop button appears |
| 6. Destroy sandbox | /workspace/:id | SandboxPanel | Click "Destroy" | Returns to empty state (no sandbox) |
### Subscription Dependencies

- `useSandboxSubscription(socket, workspaceId)` → SandboxSnapshot
- Commands: workspace.sandbox.create/start/stop/destroy
### Known UX Gaps (from audit)

- No confirmation dialog on Destroy
- Health data (memory usage, CPU%, NATS connected, uptime) exists in snapshot but is not rendered
- Error field not displayed when status is "error"
- No loading/disabled state on buttons during operations
### Test Contract

- Stage 1: Empty state renders with Create button
- Stage 2: Status transitions creating → running
- Stages 4-5: Stop/Start toggle
- Stage 6: Destroy returns to empty state
