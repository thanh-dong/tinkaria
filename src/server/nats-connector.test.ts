import { describe, test, expect, afterEach } from "bun:test"
import { NatsServer } from "@lagz0ne/nats-embedded"
import { NatsConnector } from "./nats-connector"

describe("NatsConnector", () => {
  let server: NatsServer | null = null
  let connector: NatsConnector | null = null

  afterEach(async () => {
    await connector?.dispose()
    connector = null
    await server?.stop()
    server = null
  })

  test("connects to a running NATS server", async () => {
    const token = "test-" + Date.now()
    server = await NatsServer.start({ websocket: true, jetstream: true, token })
    connector = await NatsConnector.connect({
      natsUrl: server.url,
      natsWsUrl: server.wsUrl!,
      natsWsPort: server.wsPort!,
      token,
    })
    expect(connector.nc).toBeDefined()
    expect(connector.natsUrl).toBe(server.url)
    expect(connector.natsWsUrl).toBe(server.wsUrl!)
    expect(connector.natsWsPort).toBe(server.wsPort!)
    expect(connector.authToken).toBe(token)
  })

  test("dispose drains the connection", async () => {
    server = await NatsServer.start({ token: "t" })
    connector = await NatsConnector.connect({
      natsUrl: server.url,
      natsWsUrl: server.wsUrl ?? "",
      natsWsPort: server.wsPort ?? 0,
      token: "t",
    })
    await connector.dispose()
    // After dispose, connection should be closed
    expect(connector.nc.isClosed()).toBe(true)
    connector = null // prevent double-dispose in afterEach
  })

  test("connect without token works on unauthenticated server", async () => {
    server = await NatsServer.start({})
    connector = await NatsConnector.connect({
      natsUrl: server.url,
      natsWsUrl: "",
      natsWsPort: 0,
    })
    expect(connector.nc).toBeDefined()
    expect(connector.authToken).toBeUndefined()
  })
})
