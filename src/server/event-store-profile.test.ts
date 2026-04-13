import { afterEach, describe, expect, test } from "bun:test"
import { rm } from "node:fs/promises"
import { mkdtemp } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { EventStore } from "./event-store"
import type { ProviderProfile } from "../shared/profile-types"

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function createTempDataDir() {
  const dir = await mkdtemp(join(tmpdir(), "kanna-pf-"))
  tempDirs.push(dir)
  return dir
}

const makeProfile = (id: string): ProviderProfile => ({
  id,
  name: `Profile ${id}`,
  provider: "claude",
  runtime: "system",
  model: "opus-4",
  systemPrompt: "You are helpful.",
})

describe("EventStore provider profiles", () => {
  test("saveProviderProfile creates record", async () => {
    const dataDir = await createTempDataDir()
    const store = new EventStore(dataDir)
    await store.initialize()

    await store.saveProviderProfile("p1", makeProfile("p1"))

    const record = store.state.providerProfiles.get("p1")
    expect(record).toBeDefined()
    expect(record!.profile.name).toBe("Profile p1")
    expect(record!.createdAt).toBeGreaterThan(0)
  })

  test("saveProviderProfile preserves createdAt on update", async () => {
    const dataDir = await createTempDataDir()
    const store = new EventStore(dataDir)
    await store.initialize()

    await store.saveProviderProfile("p1", makeProfile("p1"))
    const firstCreated = store.state.providerProfiles.get("p1")!.createdAt

    const updated = { ...makeProfile("p1"), name: "Updated" }
    await store.saveProviderProfile("p1", updated)

    const record = store.state.providerProfiles.get("p1")!
    expect(record.createdAt).toBe(firstCreated)
    expect(record.updatedAt).toBeGreaterThanOrEqual(firstCreated)
    expect(record.profile.name).toBe("Updated")
  })

  test("removeProviderProfile deletes record and cleans overrides", async () => {
    const dataDir = await createTempDataDir()
    const store = new EventStore(dataDir)
    await store.initialize()

    await store.saveProviderProfile("p1", makeProfile("p1"))
    await store.setWorkspaceProfileOverride("ws1", "p1", { model: "sonnet-4" })
    await store.removeProviderProfile("p1")

    expect(store.state.providerProfiles.get("p1")).toBeUndefined()
    expect(store.state.workspaceProfileOverrides.get("ws1")?.get("p1")).toBeUndefined()
  })

  test("setWorkspaceProfileOverride stores override", async () => {
    const dataDir = await createTempDataDir()
    const store = new EventStore(dataDir)
    await store.initialize()

    await store.saveProviderProfile("p1", makeProfile("p1"))
    await store.setWorkspaceProfileOverride("ws1", "p1", { model: "sonnet-4" })

    const override = store.state.workspaceProfileOverrides.get("ws1")?.get("p1")
    expect(override).toBeDefined()
    expect(override!.overrides.model).toBe("sonnet-4")
  })

  test("removeWorkspaceProfileOverride deletes override", async () => {
    const dataDir = await createTempDataDir()
    const store = new EventStore(dataDir)
    await store.initialize()

    await store.saveProviderProfile("p1", makeProfile("p1"))
    await store.setWorkspaceProfileOverride("ws1", "p1", { model: "sonnet-4" })
    await store.removeWorkspaceProfileOverride("ws1", "p1")

    expect(store.state.workspaceProfileOverrides.get("ws1")?.get("p1")).toBeUndefined()
  })

  test("profiles survive snapshot round-trip", async () => {
    const dataDir = await createTempDataDir()
    const store1 = new EventStore(dataDir)
    await store1.initialize()

    await store1.saveProviderProfile("p1", makeProfile("p1"))
    await store1.setWorkspaceProfileOverride("ws1", "p1", { model: "haiku-4" })
    await store1.compact()

    const store2 = new EventStore(dataDir)
    await store2.initialize()

    expect(store2.state.providerProfiles.get("p1")).toBeDefined()
    expect(store2.state.providerProfiles.get("p1")!.profile.name).toBe("Profile p1")
    expect(store2.state.workspaceProfileOverrides.get("ws1")?.get("p1")?.overrides.model).toBe("haiku-4")
  })

  test("profiles survive log replay without snapshot", async () => {
    const dataDir = await createTempDataDir()
    const store1 = new EventStore(dataDir)
    await store1.initialize()

    await store1.saveProviderProfile("p1", makeProfile("p1"))
    await store1.setWorkspaceProfileOverride("ws1", "p1", { model: "haiku-4" })
    // No compact — force log replay on next load

    const store2 = new EventStore(dataDir)
    await store2.initialize()

    expect(store2.state.providerProfiles.get("p1")).toBeDefined()
    expect(store2.state.providerProfiles.get("p1")!.profile.name).toBe("Profile p1")
    expect(store2.state.workspaceProfileOverrides.get("ws1")?.get("p1")?.overrides.model).toBe("haiku-4")
  })
})
