import { NatsServer } from "@lagz0ne/nats-embedded"
import { connect, type NatsConnection } from "@nats-io/transport-node"
import { LOG_PREFIX } from "../shared/branding"

const encoder = new TextEncoder()

function tokenOption(token?: string): { token: string } | undefined {
  return token ? { token } : undefined
}

export class NatsBridge {
  readonly natsUrl: string
  readonly natsWsUrl: string
  readonly natsWsPort: number
  readonly authToken: string | undefined

  private readonly server: NatsServer
  readonly nc: NatsConnection
  private disposed = false

  private constructor(server: NatsServer, connection: NatsConnection, token?: string) {
    this.server = server
    this.nc = connection
    this.natsUrl = server.url
    this.natsWsUrl = server.wsUrl!
    this.natsWsPort = server.wsPort!
    this.authToken = token
  }

  static async create(token?: string): Promise<NatsBridge> {
    const server = await NatsServer.start({
      websocket: true,
      jetstream: true,
      ...tokenOption(token),
    })

    if (!server.wsUrl || !server.wsPort) {
      await server.stop()
      throw new Error("NATS server started without WebSocket support")
    }

    const connection = await connect({
      servers: server.url,
      ...tokenOption(token),
    })

    console.warn(LOG_PREFIX, `NATS bridge started — TCP: ${server.url}, WS: ${server.wsUrl}`)

    const bridge = new NatsBridge(server, connection, token)

    void server.exited.then((code) => {
      if (!bridge.disposed) {
        console.warn(LOG_PREFIX, `NATS server exited unexpectedly with code ${code}`)
      }
    })

    return bridge
  }

  publish(subject: string, data: unknown): void {
    if (this.disposed) return
    try {
      this.nc.publish(subject, encoder.encode(JSON.stringify(data)))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(LOG_PREFIX, `NATS publish failed on ${subject}: ${message}`)
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    try {
      await this.nc.drain()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(LOG_PREFIX, `NATS connection drain failed: ${message}`)
    }
    await this.server.stop()
    console.warn(LOG_PREFIX, "NATS bridge stopped")
  }
}
