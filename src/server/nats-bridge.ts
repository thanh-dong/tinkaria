import { NatsServer } from "@lagz0ne/nats-embedded"
import { connect, type NatsConnection } from "@nats-io/transport-node"
import { LOG_PREFIX } from "../shared/branding"

const encoder = new TextEncoder()

function tokenOption(token?: string): { token: string } | undefined {
  return token ? { token } : undefined
}

export interface CreateNatsBridgeOptions {
  token?: string
  bindHost?: string
  advertisedHost?: string
}

function normalizeAdvertisedHost(bindHost: string, advertisedHost?: string): string {
  if (advertisedHost) return advertisedHost
  return bindHost === "0.0.0.0" ? "127.0.0.1" : bindHost
}

function rewriteUrlHost(rawUrl: string, host: string): string {
  const url = new URL(rawUrl)
  url.hostname = host
  return url.toString().replace(/\/$/, "")
}

export class NatsBridge {
  readonly natsUrl: string
  readonly natsWsUrl: string
  readonly natsWsPort: number
  readonly authToken: string | undefined

  private readonly server: NatsServer
  readonly nc: NatsConnection
  private disposed = false

  private constructor(
    server: NatsServer,
    connection: NatsConnection,
    advertisedNatsUrl: string,
    advertisedWsUrl: string,
    token?: string
  ) {
    this.server = server
    this.nc = connection
    this.natsUrl = advertisedNatsUrl
    this.natsWsUrl = advertisedWsUrl
    this.natsWsPort = server.wsPort!
    this.authToken = token
  }

  static async create(options: CreateNatsBridgeOptions = {}): Promise<NatsBridge> {
    const bindHost = options.bindHost ?? "127.0.0.1"
    const advertisedHost = normalizeAdvertisedHost(bindHost, options.advertisedHost)
    const server = await NatsServer.start({
      host: bindHost,
      websocket: true,
      jetstream: true,
      ...tokenOption(options.token),
    })

    if (!server.wsUrl || !server.wsPort) {
      await server.stop()
      throw new Error("NATS server started without WebSocket support")
    }

    const connection = await connect({
      servers: rewriteUrlHost(server.url, advertisedHost),
      ...tokenOption(options.token),
    })

    const advertisedNatsUrl = rewriteUrlHost(server.url, advertisedHost)
    const advertisedWsUrl = rewriteUrlHost(server.wsUrl, advertisedHost)

    console.warn(LOG_PREFIX, `NATS bridge started — TCP: ${advertisedNatsUrl}, WS: ${advertisedWsUrl}`)

    const bridge = new NatsBridge(server, connection, advertisedNatsUrl, advertisedWsUrl, options.token)

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
