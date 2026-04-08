import { NatsServer } from "@lagz0ne/nats-embedded"

const LOG_PREFIX = "[nats-daemon]"

const token = process.env.NATS_TOKEN
const host = process.env.NATS_HOST ?? "127.0.0.1"

const server = await NatsServer.start({
  host,
  websocket: true,
  jetstream: true,
  ...(token ? { token } : {}),
})

if (!server.wsUrl || !server.wsPort) {
  console.warn(LOG_PREFIX, "NATS server started without WebSocket support")
  await server.stop()
  process.exit(1)
}

const info = {
  url: server.url,
  wsUrl: server.wsUrl,
  wsPort: server.wsPort,
  pid: process.pid,
}

process.stdout.write(JSON.stringify(info) + "\n")

process.on("SIGTERM", async () => {
  console.warn(LOG_PREFIX, "Received SIGTERM, shutting down")
  await server.stop()
  process.exit(0)
})

// Keep process alive until NATS server exits
await server.exited
