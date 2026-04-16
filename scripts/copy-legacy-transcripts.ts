import { EventStore } from "../src/server/event-store"

function parseDataDir(argv: string[]): string | undefined {
  const index = argv.indexOf("--data-dir")
  if (index === -1) return undefined
  return argv[index + 1]
}

const dataDir = parseDataDir(Bun.argv.slice(2))
const store = new EventStore(dataDir)

await store.initialize()
const stats = await store.getLegacyTranscriptStats()

if (!stats.hasLegacyData) {
  console.info("No legacy transcript data found.")
  process.exit(0)
}

console.info(`Copying ${stats.entryCount} transcript entries across ${stats.chatCount} chats.`)
const migrated = await store.migrateLegacyTranscripts((message) => console.info(message))

if (!migrated) {
  console.info("No legacy transcript data copied.")
}
