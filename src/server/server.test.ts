import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { startServer } from "./server"
import { TranscriptConsumer } from "./transcript-consumer"

const originalSplit = process.env.TINKARIA_SPLIT

describe("startServer healthcheck", () => {
  beforeEach(() => {
    delete process.env.TINKARIA_SPLIT
  })

  afterEach(() => {
    if (originalSplit === undefined) {
      delete process.env.TINKARIA_SPLIT
    } else {
      process.env.TINKARIA_SPLIT = originalSplit
    }
  })

  test("reports liveness in default mode", async () => {
    const started = await startServer({ port: 4321, host: "127.0.0.1", strictPort: true })
    try {
      const response = await fetch(`http://127.0.0.1:${started.port}/health`)
      expect(response.ok).toBe(true)
      const body = await response.json()
      expect(body).toMatchObject({
        ok: true,
        status: "ok",
        splitMode: false,
        natsDaemon: { ok: true },
        natsConnection: { ok: true },
        runner: null,
      })
      expect(body.codexKit).toBeDefined()
    } finally {
      await started.stop()
    }
  }, 30_000)

  test("reports runner readiness in split mode", async () => {
    process.env.TINKARIA_SPLIT = "true"
    const started = await startServer({ port: 4322, host: "127.0.0.1", strictPort: true })
    try {
      const response = await fetch(`http://127.0.0.1:${started.port}/health`)
      expect(response.ok).toBe(true)
      const body = await response.json()
      expect(body).toMatchObject({
        ok: true,
        status: "ok",
        splitMode: true,
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

  test("waits for transcript consumer startup before split-mode server resolves", async () => {
    process.env.TINKARIA_SPLIT = "true"

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
