const LOG_PREFIX = "[kanna-sandbox]"

const natsUrl = Bun.env.NATS_URL ?? "nats://host.docker.internal:4222"
const workspaceId = Bun.env.WORKSPACE_ID

if (!workspaceId) {
  console.warn(LOG_PREFIX, "WORKSPACE_ID env var is required")
  process.exit(1)
}

console.warn(LOG_PREFIX, `Sandbox starting for workspace ${workspaceId}`)
console.warn(LOG_PREFIX, `Connecting to NATS at ${natsUrl}`)

let shuttingDown = false

function handleShutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.warn(LOG_PREFIX, `Received ${signal}, shutting down gracefully`)
  // In a real implementation, drain NATS connections here
  process.exit(0)
}

process.on("SIGTERM", () => handleShutdown("SIGTERM"))
process.on("SIGINT", () => handleShutdown("SIGINT"))

// Keep process alive
setInterval(() => {
  if (!shuttingDown) {
    console.warn(LOG_PREFIX, `Sandbox heartbeat: workspace=${workspaceId}`)
  }
}, 30_000)

console.warn(LOG_PREFIX, `Sandbox ready for workspace ${workspaceId}`)
