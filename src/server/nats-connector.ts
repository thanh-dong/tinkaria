import { connect, type NatsConnection } from "@nats-io/transport-node"
import { LOG_PREFIX } from "../shared/branding"

export interface NatsConnectorOptions {
  natsUrl: string
  natsWsUrl: string
  natsWsPort: number
  token?: string
}

export class NatsConnector {
  readonly natsUrl: string
  readonly natsWsUrl: string
  readonly natsWsPort: number
  readonly authToken: string | undefined
  readonly nc: NatsConnection
  private disposed = false

  private constructor(
    connection: NatsConnection,
    natsUrl: string,
    natsWsUrl: string,
    natsWsPort: number,
    token?: string
  ) {
    this.nc = connection
    this.natsUrl = natsUrl
    this.natsWsUrl = natsWsUrl
    this.natsWsPort = natsWsPort
    this.authToken = token
  }

  static async connect(options: NatsConnectorOptions): Promise<NatsConnector> {
    const tokenOpt = options.token ? { token: options.token } : undefined
    const connection = await connect({
      servers: options.natsUrl,
      ...tokenOpt,
    })

    console.warn(LOG_PREFIX, `NATS connector connected — ${options.natsUrl}`)

    return new NatsConnector(
      connection,
      options.natsUrl,
      options.natsWsUrl,
      options.natsWsPort,
      options.token
    )
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
    console.warn(LOG_PREFIX, "NATS connector disconnected")
  }
}
