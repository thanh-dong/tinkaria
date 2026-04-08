import { connect } from "@nats-io/transport-node"
import { LOG_PREFIX } from "../shared/branding"
import { RunnerAgent, type TurnFactory } from "./runner-agent"
import { RunnerNatsHandler } from "./runner-nats"
import { startClaudeTurn, startCodexTurn, stopAllCodexSessions } from "./turn-factories"

const natsUrl = process.env.NATS_URL
const natsToken = process.env.NATS_TOKEN
const runnerId = process.env.RUNNER_ID ?? `runner-${process.pid}`

if (!natsUrl) {
  console.error(LOG_PREFIX, "NATS_URL environment variable is required")
  process.exit(1)
}

// Safety net: prevent stray unhandled rejections from crashing the runner.
process.on("unhandledRejection", (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason)
  console.warn(LOG_PREFIX, "unhandled rejection (swallowed):", message)
})

const tokenOpt = natsToken ? { token: natsToken } : undefined
const nc = await connect({ servers: natsUrl, ...tokenOpt })

console.warn(LOG_PREFIX, `Runner ${runnerId} connected to NATS at ${natsUrl}`)

const createTurn: TurnFactory = async (args) => {
  if (args.provider === "claude") {
    return startClaudeTurn(args)
  }
  if (args.provider === "codex") {
    return startCodexTurn(args)
  }
  throw new Error(`Provider ${args.provider} not supported in runner`)
}

const agent = new RunnerAgent({ nc, createTurn })
const handler = new RunnerNatsHandler({ nc, agent, runnerId })
await handler.start()

console.warn(LOG_PREFIX, `Runner ${runnerId} ready (pid: ${process.pid})`)

// Graceful shutdown
let shuttingDown = false
async function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  console.warn(LOG_PREFIX, `Runner ${runnerId} shutting down...`)

  handler.dispose()

  // Cancel all active turns
  for (const chatId of [...agent.activeTurns.keys()]) {
    await agent.cancel(chatId)
  }

  stopAllCodexSessions()

  await nc.drain()
  console.warn(LOG_PREFIX, `Runner ${runnerId} stopped`)
  process.exit(0)
}

process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)
