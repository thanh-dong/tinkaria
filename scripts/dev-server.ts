import process from "node:process"

process.env.TINKARIA_RUNTIME_PROFILE = "dev"
process.env.KANNA_DISABLE_SELF_UPDATE = "1"

await import("../src/server/cli")
