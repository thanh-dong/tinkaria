import { describe, expect, test } from "bun:test"
import { startServer } from "./server"
import { TranscriptConsumer } from "./transcript-consumer"

describe("startServer healthcheck", () => {
  test("reports liveness with runner", async () => {
    const started = await startServer({ port: 4321, host: "127.0.0.1", strictPort: true })
    try {
      const response = await fetch(`http://127.0.0.1:${started.port}/health`)
      expect(response.ok).toBe(true)
      const body = await response.json()
      expect(body).toMatchObject({
        ok: true,
        status: "ok",
        natsDaemon: { ok: true },
        natsConnection: { ok: true },
        runner: {
          ok: true,
          registered: true,
          heartbeatFresh: true,
        },
      })
      expect(typeof body.runner.runnerId).toBe("string")
      expect(typeof body.runner.pid).toBe("number")
    } finally {
      await started.stop()
    }
  }, 30_000)

  test("waits for transcript consumer startup before server resolves", async () => {
    const originalStart = TranscriptConsumer.prototype.start
    let releaseStart!: () => void
    const startEntered = new Promise<void>((resolve) => {
      TranscriptConsumer.prototype.start = async function(this: TranscriptConsumer) {
        resolve()
        await new Promise<void>((resume) => {
          releaseStart = resume
        })
        return originalStart.call(this)
      }
    })

    let started: Awaited<ReturnType<typeof startServer>> | null = null
    const serverPromise = startServer({ port: 4323, host: "127.0.0.1", strictPort: true })

    try {
      await startEntered
      const resolvedBeforeConsumerReady = await Promise.race([
        serverPromise.then(() => true),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), 200)),
      ])
      expect(resolvedBeforeConsumerReady).toBe(false)

      releaseStart()
      started = await serverPromise
    } finally {
      TranscriptConsumer.prototype.start = originalStart
      await started?.stop()
    }
  }, 30_000)
})
