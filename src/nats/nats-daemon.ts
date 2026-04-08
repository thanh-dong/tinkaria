import { NatsServer } from "@lagz0ne/nats-embedded"
import { ensureToken } from "./nats-token"

const LOG_PREFIX = "[nats-daemon]"

const host = process.env.NATS_HOST ?? "127.0.0.1"
const port = process.env.NATS_PORT ? Number(process.env.NATS_PORT) : -1
const wsPort = process.env.NATS_WS_PORT ? Number(process.env.NATS_WS_PORT) : undefined
const httpPort = process.env.NATS_HTTP_PORT ? Number(process.env.NATS_HTTP_PORT) : undefined
const storeDir = process.env.NATS_STORE_DIR
const dataDir = process.env.NATS_DATA_DIR

// Token resolution: NATS_DATA_DIR (file-based) > NATS_TOKEN (env) > none
const token = dataDir
  ? await ensureToken(dataDir)
  : process.env.NATS_TOKEN || undefined

const server = await NatsServer.start({
  host,
  port,
  websocket: wsPort ? { port: wsPort, no_tls: true } : true,
  jetstream: true,
  ...(httpPort ? { httpPort } : {}),
  ...(storeDir ? { storeDir } : {}),
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
