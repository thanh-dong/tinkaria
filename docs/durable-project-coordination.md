# Durable Project Coordination — User Manual

This document covers the three subsystems added in the `feat/durable-project-coordination` branch: **Workflows**, **Sandboxes**, and **Push Notifications**.

---

## 1. Workflows

Workflows are multi-step automation pipelines that run MCP tools against workspace repos.

### Defining a workflow

Workflows are YAML definitions with this structure:

```yaml
id: lint-and-test
name: Lint & Test
trigger: manual              # or { cron: "0 */6 * * *" } or { on_event: "repo.pushed" }
target: all                  # or a specific repo ID
on_failure: stop             # stop | continue | rollback
steps:
  - mcp_tool: run_command
    params:
      command: "bun run lint"
    label: "Lint"
  - mcp_tool: run_command
    params:
      command: "bun test"
    label: "Test"
```

| Field | Description |
|---|---|
| `trigger` | `"manual"` — on-demand. `{ cron: "..." }` — scheduled. `{ on_event: "..." }` — event-driven. |
| `target` | `"all"` runs against every repo in the workspace. A string value targets a specific repo ID. |
| `on_failure` | `"stop"` halts on first failure. `"continue"` skips failed steps. `"rollback"` undoes previous steps. |
| `steps[].mcp_tool` | Any MCP tool available in the workspace context. |

### MCP tools

Three tools are exposed for agent and programmatic use:

| Tool | Args | Description |
|---|---|---|
| `workflow_list` | `workspaceId` | List all available workflow definitions |
| `workflow_run` | `workspaceId`, `workflowId`, `triggeredBy?` | Start a workflow run, returns `runId` |
| `workflow_cancel` | `workspaceId`, `runId` | Cancel an active run |

### Run lifecycle

```
manual/cron/event trigger
        │
        ▼
    [running] ──step 1──▶ step 2 ──▶ ... ──▶ [completed]
        │                    │
        │              (step fails)
        │                    │
        │          on_failure=stop ──▶ [failed]
        │          on_failure=continue ──▶ skip, next step
        │
    cancel() ──▶ [cancelled]
```

**Step statuses:** `pending` → `running` → `completed` | `failed` | `skipped`

### UI panel

The **WorkflowPanel** in the workspace page shows:

- Active and historical runs with color-coded status badges
- Per-step progress with icons (spinner for running, check for done, alert for failed)
- Cancel button for active runs
- Start time, who triggered it, and error messages

---

## 2. Sandboxes

Sandboxes are isolated Docker containers provisioned per workspace for running untrusted or experimental workloads.

### Lifecycle commands

All issued from the workspace UI or via `ClientCommand` protocol:

| Command | Description |
|---|---|
| `workspace.sandbox.create` | Create a new container with optional resource limits |
| `workspace.sandbox.start` | Start a stopped container |
| `workspace.sandbox.stop` | Stop a running container (optional `reason`) |
| `workspace.sandbox.destroy` | Permanently delete the container |
| `workspace.sandbox.logs` | Retrieve container logs (optional `tail` count) |
| `workspace.sandbox.status` | Query current container inspection data |

### Resource limits

Configurable per sandbox at creation time:

| Resource | Default | Description |
|---|---|---|
| CPU shares | 512 | Relative CPU weight |
| Memory | 2048 MB | Hard memory limit |
| Disk | 10240 MB | Disk space allocation |
| PIDs limit | 256 | Max concurrent processes |

### Sandbox states

```
[none] ──create──▶ creating ──(docker start)──▶ running
                       │                          │   │
                   (start fails)                stop  destroy
                       │                          │   │
                       ▼                          ▼   ▼
                     error                     stopped [deleted]
                                                 │
                                           start / destroy
```

### Health monitoring

The `SandboxHealthMonitor` runs on a 15-second interval for all `running` sandboxes:

- Inspects container via Docker API
- Reports: `healthy` | `unhealthy` | `unreachable`
- Tracks consecutive failures per sandbox
- After **3 consecutive failures**, fires `onUnhealthy` callback
- Health data: uptime, memory usage, CPU %, NATS connection status

### UI panel

The **SandboxPanel** in the workspace page shows:

- Container ID (truncated), memory limit, CPU shares
- Action buttons that change based on state:
  - No sandbox → **Create**
  - Stopped → **Start**
  - Running → **Stop**
  - Any state → **Destroy**
- Real-time status updates via WebSocket subscription

---

## 3. Push Notifications

Browser push notifications for workspace events, powered by Web Push (VAPID).

### Server setup

Set these environment variables to enable push:

```bash
VAPID_PUBLIC_KEY=<base64-encoded public key>
VAPID_PRIVATE_KEY=<base64-encoded private key>
VAPID_SUBJECT=mailto:you@example.com    # optional, defaults to mailto:tinkaria@localhost
```

Generate VAPID keys with:

```bash
bunx web-push generate-vapid-keys
```

If keys are not set, push notifications are disabled entirely — no errors, just silently off.

### Client subscription

The **NotificationToggle** component appears in the UI when push is supported by the browser:

1. Click **Enable** → browser prompts for notification permission
2. On grant, the client fetches the VAPID public key from `/api/push/vapid-key`
3. Service worker creates a push subscription
4. Subscription is sent to the server for storage

Click **Disable** to unsubscribe. The toggle shows current state (on/off).

### Service worker behavior

When a push arrives (`public/sw.js`):

- Parses the JSON payload (`title`, `body`, `url`, `tag`)
- Shows a browser notification with the Tinkaria icon
- On click: focuses an existing matching tab or opens a new one at the target URL
- Tag-based grouping replaces same-tag notifications instead of stacking

### Server-side sending

`sendPushToAll(payload)` broadcasts to all stored subscriptions:

- Sends in parallel via `Promise.allSettled`
- Auto-removes expired subscriptions (HTTP 404/410)
- Partial failures don't block other deliveries

---

## Event Sourcing

All three subsystems persist state through the event store:

- **Sandbox events**: `sandbox_created`, `sandbox_started`, `sandbox_stopped`, `sandbox_destroyed`, `sandbox_error`, `sandbox_health_updated`
- **Workflow events**: stored in the workflow run store
- Events are append-only JSONL, with snapshot compaction
- Real-time UI updates via NATS → WebSocket bridge

### NATS streams

| Stream | Purpose |
|---|---|
| `SANDBOX_EVENTS` | Sandbox lifecycle events |
| `WORKFLOW_EVENTS` | Workflow run events |

Both use JetStream for durable delivery and replay.
