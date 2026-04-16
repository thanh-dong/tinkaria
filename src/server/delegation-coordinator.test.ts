import { afterEach, describe, test, expect } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { NatsServer } from "@lagz0ne/nats-embedded"
import { connect, type NatsConnection } from "@nats-io/transport-node"
import { Kvm } from "@nats-io/kv"
import {
  DelegationCoordinator,
  type DelegationStore,
  type CreateDelegationArgs,
  type TerminalOutcome,
} from "./delegation-coordinator"
import type { TranscriptEntry, AgentResultEntry, UserPromptEntry, AssistantTextEntry } from "../shared/types"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createFakeDelegationStore(overrides?: Partial<DelegationStore>): DelegationStore & {
  appendedMessages: Array<{ chatId: string; entry: TranscriptEntry }>
  existingChats: Set<string>
  workspacesByChatId: Map<string, string>
  lastTurnOutcomes: Map<string, string>
} {
  const appendedMessages: Array<{ chatId: string; entry: TranscriptEntry }> = []
  const existingChats = new Set<string>(["parent-1", "child-1", "child-2"])
  const workspacesByChatId = new Map<string, string>([
    ["parent-1", "ws-1"],
    ["child-1", "ws-1"],
    ["child-2", "ws-1"],
  ])
  const lastTurnOutcomes = new Map<string, string>()

  return {
    appendedMessages,
    existingChats,
    workspacesByChatId,
    lastTurnOutcomes,
    appendMessage(chatId, entry) {
      appendedMessages.push({ chatId, entry })
      overrides?.appendMessage?.(chatId, entry)
    },
    chatExists(chatId) {
      return overrides?.chatExists?.(chatId) ?? existingChats.has(chatId)
    },
    getChatWorkspaceId(chatId) {
      return overrides?.getChatWorkspaceId?.(chatId) ?? workspacesByChatId.get(chatId)
    },
    getLastTurnOutcome(chatId) {
      return overrides?.getLastTurnOutcome?.(chatId) ?? lastTurnOutcomes.get(chatId)
    },
  }
}

function baseArgs(overrides?: Partial<CreateDelegationArgs>): CreateDelegationArgs {
  return {
    workspaceId: "ws-1",
    parentChatId: "parent-1",
    childChatId: "child-1",
    childProvider: "claude",
    instructionPreview: "Do the thing",
    mode: "blocking",
    resume: "gate",
    depth: 1,
    ...overrides,
  }
}

function successOutcome(summary?: string): TerminalOutcome {
  return { outcome: "success", resultSummary: summary ?? "All done" }
}

function failedOutcome(summary?: string): TerminalOutcome {
  return { outcome: "failed", resultSummary: summary ?? "Something broke" }
}

function cancelledOutcome(): TerminalOutcome {
  return { outcome: "cancelled" }
}

function makeUserEntry(content: string): UserPromptEntry {
  return { _id: crypto.randomUUID(), createdAt: Date.now(), kind: "user_prompt", content }
}

function makeAssistantEntry(text: string): AssistantTextEntry {
  return { _id: crypto.randomUUID(), createdAt: Date.now(), kind: "assistant_text", text }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DelegationCoordinator", () => {
  let natsServer: NatsServer | null = null
  let nc: NatsConnection | null = null
  let coordinator: DelegationCoordinator | null = null
  let store: ReturnType<typeof createFakeDelegationStore> | null = null
  let storeDir: string | null = null

  async function setup(storeOverrides?: Partial<DelegationStore>) {
    storeDir = await mkdtemp(join(tmpdir(), "nats-delegation-test-"))
    natsServer = await NatsServer.start({ jetstream: true, storeDir })
    nc = await connect({ servers: natsServer.url })
    store = createFakeDelegationStore(storeOverrides)
    coordinator = new DelegationCoordinator(nc, store)
    await coordinator.initialize()
    return { coordinator: coordinator!, store: store!, nc: nc! }
  }

  afterEach(async () => {
    coordinator = null
    store = null
    if (nc && !nc.isClosed()) await nc.drain()
    nc = null
    if (natsServer) await natsServer.stop()
    natsServer = null
    if (storeDir) {
      await rm(storeDir, { recursive: true, force: true }).catch(() => {})
      storeDir = null
    }
  })

  // -----------------------------------------------------------------------
  // Initialization
  // -----------------------------------------------------------------------

  test("creates KV bucket on init", async () => {
    await setup()
    const kvm = new Kvm(nc!)
    const kv = await kvm.open("delegations")
    const status = await kv.status()
    expect(status.bucket).toBe("delegations")
  })

  // -----------------------------------------------------------------------
  // createDelegation
  // -----------------------------------------------------------------------

  test("createDelegation persists record and returns delegationId", async () => {
    const { coordinator } = await setup()
    const { delegationId } = await coordinator.createDelegation(baseArgs())

    expect(typeof delegationId).toBe("string")
    expect(delegationId.length).toBeGreaterThan(0)

    const record = await coordinator.getDelegation("ws-1", delegationId)
    expect(record).not.toBeNull()
    expect(record!.status).toBe("active")
    expect(record!.parentChatId).toBe("parent-1")
    expect(record!.childChatId).toBe("child-1")
    expect(record!.mode).toBe("blocking")
    expect(record!.resume).toBe("gate")
    expect(record!.depth).toBe(1)
  })

  test("createDelegation writes secondary index", async () => {
    const { coordinator } = await setup()
    const { delegationId } = await coordinator.createDelegation(baseArgs())

    const children = await coordinator.getDelegationsForChild("ws-1", "child-1")
    expect(children).toHaveLength(1)
    expect(children[0]!.delegationId).toBe(delegationId)
  })

  test("createDelegation stores resumeHint", async () => {
    const { coordinator } = await setup()
    const { delegationId } = await coordinator.createDelegation(
      baseArgs({ resumeHint: "Context from parent" }),
    )

    const record = await coordinator.getDelegation("ws-1", delegationId)
    expect(record!.resumeHint).toBe("Context from parent")
  })

  test("createDelegation truncates instructionPreview to 120 chars", async () => {
    const { coordinator } = await setup()
    const longInstruction = "A".repeat(200)
    const { delegationId } = await coordinator.createDelegation(
      baseArgs({ instructionPreview: longInstruction }),
    )

    const record = await coordinator.getDelegation("ws-1", delegationId)
    expect(record!.instructionPreview.length).toBe(120)
  })

  test("createDelegation rejects depth > 2", async () => {
    const { coordinator } = await setup()
    await expect(
      coordinator.createDelegation(baseArgs({ depth: 3 })),
    ).rejects.toThrow(/depth 3 exceeds maximum 2/i)
  })

  // -----------------------------------------------------------------------
  // getDelegation
  // -----------------------------------------------------------------------

  test("getDelegation returns null for missing record", async () => {
    const { coordinator } = await setup()
    const result = await coordinator.getDelegation("ws-1", "nonexistent")
    expect(result).toBeNull()
  })

  test("getDelegation returns stored record", async () => {
    const { coordinator } = await setup()
    const { delegationId } = await coordinator.createDelegation(baseArgs())
    const record = await coordinator.getDelegation("ws-1", delegationId)
    expect(record).not.toBeNull()
    expect(record!.delegationId).toBe(delegationId)
  })

  // -----------------------------------------------------------------------
  // getDelegationsForChild
  // -----------------------------------------------------------------------

  test("getDelegationsForChild returns all delegations for a child", async () => {
    const { coordinator } = await setup()
    await coordinator.createDelegation(baseArgs())
    await coordinator.createDelegation(baseArgs({ parentChatId: "parent-1", mode: "background" }))

    const children = await coordinator.getDelegationsForChild("ws-1", "child-1")
    expect(children).toHaveLength(2)
  })

  test("getDelegationsForChild returns empty for unknown child", async () => {
    const { coordinator } = await setup()
    const children = await coordinator.getDelegationsForChild("ws-1", "no-such-child")
    expect(children).toHaveLength(0)
  })

  // -----------------------------------------------------------------------
  // getBlockingDelegationsForParent
  // -----------------------------------------------------------------------

  test("getBlockingDelegationsForParent returns only active blocking delegations", async () => {
    const { coordinator } = await setup()
    // blocking active
    await coordinator.createDelegation(baseArgs({ childChatId: "child-1" }))
    // background active — should NOT appear
    await coordinator.createDelegation(baseArgs({ childChatId: "child-2", mode: "background" }))

    const blocking = await coordinator.getBlockingDelegationsForParent("ws-1", "parent-1")
    expect(blocking).toHaveLength(1)
    expect(blocking[0]!.mode).toBe("blocking")
  })

  test("getBlockingDelegationsForParent excludes completed delegations", async () => {
    const { coordinator } = await setup()
    await coordinator.createDelegation(baseArgs())
    // Complete it
    await coordinator.reconcileChildTerminal("ws-1", "child-1", successOutcome())

    const blocking = await coordinator.getBlockingDelegationsForParent("ws-1", "parent-1")
    expect(blocking).toHaveLength(0)
  })

  // -----------------------------------------------------------------------
  // reconcileChildTerminal
  // -----------------------------------------------------------------------

  test("reconcileChildTerminal transitions active→completed", async () => {
    const { coordinator } = await setup()
    const { delegationId } = await coordinator.createDelegation(baseArgs())

    const result = await coordinator.reconcileChildTerminal("ws-1", "child-1", successOutcome("Done!"))
    expect(result).not.toBeNull()
    expect("alreadyReconciled" in result!).toBe(false)

    const record = await coordinator.getDelegation("ws-1", delegationId)
    expect(record!.status).toBe("completed")
    expect(record!.resultSummary).toBe("Done!")
    expect(record!.isError).toBe(false)
  })

  test("reconcileChildTerminal on failed child sets status failed + isError", async () => {
    const { coordinator } = await setup()
    const { delegationId } = await coordinator.createDelegation(baseArgs())

    await coordinator.reconcileChildTerminal("ws-1", "child-1", failedOutcome("Boom"))

    const record = await coordinator.getDelegation("ws-1", delegationId)
    expect(record!.status).toBe("failed")
    expect(record!.isError).toBe(true)
    expect(record!.resultSummary).toBe("Boom")
  })

  test("reconcileChildTerminal on cancelled child sets status failed", async () => {
    const { coordinator } = await setup()
    const { delegationId } = await coordinator.createDelegation(baseArgs())

    await coordinator.reconcileChildTerminal("ws-1", "child-1", cancelledOutcome())

    const record = await coordinator.getDelegation("ws-1", delegationId)
    expect(record!.status).toBe("failed")
    expect(record!.isError).toBe(true)
  })

  test("duplicate terminal calls are no-ops (CAS idempotency)", async () => {
    const { coordinator, store } = await setup()
    await coordinator.createDelegation(baseArgs())

    const first = await coordinator.reconcileChildTerminal("ws-1", "child-1", successOutcome())
    const second = await coordinator.reconcileChildTerminal("ws-1", "child-1", successOutcome())

    expect("alreadyReconciled" in first!).toBe(false)
    expect(second).toEqual({ alreadyReconciled: true })
    // appendMessage called only once
    expect(store.appendedMessages).toHaveLength(1)
  })

  test("reconcileChildTerminal injects agent_result into parent transcript", async () => {
    const { coordinator, store } = await setup()
    const { delegationId } = await coordinator.createDelegation(baseArgs())

    const result = await coordinator.reconcileChildTerminal("ws-1", "child-1", successOutcome("All good"))
    expect("injectedEntryId" in result!).toBe(true)

    expect(store.appendedMessages).toHaveLength(1)
    const { chatId, entry } = store.appendedMessages[0]!
    expect(chatId).toBe("parent-1")
    expect(entry.kind).toBe("agent_result")
    const agentResult = entry as AgentResultEntry
    expect(agentResult.delegationId).toBe(delegationId)
    expect(agentResult.resultSummary).toBe("All good")
    expect(agentResult.childChatId).toBe("child-1")
    expect(agentResult.childProvider).toBe("claude")
    expect(agentResult.isError).toBe(false)
  })

  test("reconcileChildTerminal returns null for unknown child", async () => {
    const { coordinator } = await setup()
    const result = await coordinator.reconcileChildTerminal("ws-1", "unknown-child", successOutcome())
    expect(result).toBeNull()
  })

  // -----------------------------------------------------------------------
  // Resume eligibility
  // -----------------------------------------------------------------------

  test("gate: resumeEligible=false when one sibling still active", async () => {
    const { coordinator } = await setup()
    // Two blocking children under same parent
    await coordinator.createDelegation(baseArgs({ childChatId: "child-1" }))
    await coordinator.createDelegation(baseArgs({ childChatId: "child-2" }))

    // Complete child-1 only
    const result = await coordinator.reconcileChildTerminal("ws-1", "child-1", successOutcome())
    expect("resumeEligible" in result!).toBe(true)
    expect((result as { resumeEligible: boolean }).resumeEligible).toBe(false)
  })

  test("gate: resumeEligible=true when all children terminal", async () => {
    const { coordinator } = await setup()
    await coordinator.createDelegation(baseArgs({ childChatId: "child-1" }))
    await coordinator.createDelegation(baseArgs({ childChatId: "child-2" }))

    // Complete both
    await coordinator.reconcileChildTerminal("ws-1", "child-1", successOutcome())
    const result = await coordinator.reconcileChildTerminal("ws-1", "child-2", successOutcome())
    expect((result as { resumeEligible: boolean }).resumeEligible).toBe(true)
  })

  test("immediate: resumeEligible=true per-child", async () => {
    const { coordinator } = await setup()
    await coordinator.createDelegation(baseArgs({ childChatId: "child-1", resume: "immediate" }))
    await coordinator.createDelegation(baseArgs({ childChatId: "child-2", resume: "immediate" }))

    // Complete child-1 only — should already be eligible
    const result = await coordinator.reconcileChildTerminal("ws-1", "child-1", successOutcome())
    expect((result as { resumeEligible: boolean }).resumeEligible).toBe(true)
  })

  test("background: never resumeEligible", async () => {
    const { coordinator } = await setup()
    await coordinator.createDelegation(baseArgs({ mode: "background", childChatId: "child-1" }))

    const result = await coordinator.reconcileChildTerminal("ws-1", "child-1", successOutcome())
    expect((result as { resumeEligible: boolean }).resumeEligible).toBe(false)
  })

  // -----------------------------------------------------------------------
  // generateResumeHint
  // -----------------------------------------------------------------------

  test("generateResumeHint returns undefined for empty entries", async () => {
    const { coordinator } = await setup()
    const hint = coordinator.generateResumeHint([])
    expect(hint).toBeUndefined()
  })

  test("generateResumeHint returns undefined for non-displayable entries", async () => {
    const { coordinator } = await setup()
    const entries: TranscriptEntry[] = [
      { _id: "1", createdAt: Date.now(), kind: "compact_boundary" },
    ]
    const hint = coordinator.generateResumeHint(entries)
    expect(hint).toBeUndefined()
  })

  test("generateResumeHint includes user and assistant entries", async () => {
    const { coordinator } = await setup()
    const entries: TranscriptEntry[] = [
      makeUserEntry("Build the feature"),
      makeAssistantEntry("I will build it now"),
    ]

    const hint = coordinator.generateResumeHint(entries)
    expect(hint).toBeDefined()
    expect(hint).toContain("User: Build the feature")
    expect(hint).toContain("Assistant: I will build it now")
    expect(hint).toContain("Delegation context from parent chat:")
  })

  test("generateResumeHint truncates to MAX entries", async () => {
    const { coordinator } = await setup()
    // Generate 30 entries (MAX_RESUME_HINT_ENTRIES = 24)
    const entries: TranscriptEntry[] = Array.from({ length: 30 }, (_, i) =>
      makeUserEntry(`Message ${i}`),
    )

    const hint = coordinator.generateResumeHint(entries)!
    expect(hint).toContain("Older transcript lines omitted:")
    // Should only contain last 24 messages
    expect(hint).toContain("Message 29")
    expect(hint).toContain("Message 6")
    expect(hint).not.toContain("Message 5")
  })

  test("generateResumeHint respects character budget", async () => {
    const { coordinator } = await setup()
    // Each line = ~500 chars, 24 entries = ~12000 chars → will hit MAX_RESUME_HINT_CHARS
    const entries: TranscriptEntry[] = Array.from({ length: 24 }, (_, i) =>
      makeUserEntry(`${"X".repeat(450)} msg-${i}`),
    )

    const hint = coordinator.generateResumeHint(entries)!
    expect(hint.length).toBeLessThanOrEqual(12_000)
  })

  // -----------------------------------------------------------------------
  // bootReconciliation
  // -----------------------------------------------------------------------

  test("bootReconciliation: parent missing → orphaned", async () => {
    const { coordinator, store } = await setup()
    const { delegationId } = await coordinator.createDelegation(baseArgs())
    // Remove parent from known chats
    store.existingChats.delete("parent-1")

    await coordinator.bootReconciliation()

    const record = await coordinator.getDelegation("ws-1", delegationId)
    expect(record!.status).toBe("orphaned")
  })

  test("bootReconciliation: child missing → orphaned", async () => {
    const { coordinator, store } = await setup()
    const { delegationId } = await coordinator.createDelegation(baseArgs())
    store.existingChats.delete("child-1")

    await coordinator.bootReconciliation()

    const record = await coordinator.getDelegation("ws-1", delegationId)
    expect(record!.status).toBe("orphaned")
  })

  test("bootReconciliation: child already terminal (success) → complete + inject", async () => {
    const { coordinator, store } = await setup()
    const { delegationId } = await coordinator.createDelegation(baseArgs())
    store.lastTurnOutcomes.set("child-1", "success")

    await coordinator.bootReconciliation()

    const record = await coordinator.getDelegation("ws-1", delegationId)
    expect(record!.status).toBe("completed")
    // Should inject agent_result into parent
    expect(store.appendedMessages).toHaveLength(1)
    expect(store.appendedMessages[0]!.chatId).toBe("parent-1")
    expect(store.appendedMessages[0]!.entry.kind).toBe("agent_result")
  })

  test("bootReconciliation: child terminal (failed) → failed", async () => {
    const { coordinator, store } = await setup()
    const { delegationId } = await coordinator.createDelegation(baseArgs())
    store.lastTurnOutcomes.set("child-1", "failed")

    await coordinator.bootReconciliation()

    const record = await coordinator.getDelegation("ws-1", delegationId)
    expect(record!.status).toBe("failed")
  })

  test("bootReconciliation: child still running → keep active", async () => {
    const { coordinator } = await setup()
    const { delegationId } = await coordinator.createDelegation(baseArgs())
    // No lastTurnOutcome set → child still active

    await coordinator.bootReconciliation()

    const record = await coordinator.getDelegation("ws-1", delegationId)
    expect(record!.status).toBe("active")
  })

  test("bootReconciliation: old record → stale", async () => {
    const { coordinator } = await setup()
    // Create delegation and manually backdate it via KV
    const { delegationId } = await coordinator.createDelegation(baseArgs())

    // Directly update createdAt to 25h ago via KV
    const kvm = new Kvm(nc!)
    const kv = await kvm.open("delegations")
    const key = `delegation.ws-1.${delegationId}`
    const entry = await kv.get(key)
    const record = JSON.parse(new TextDecoder().decode(entry!.value))
    record.createdAt = Date.now() - 25 * 60 * 60 * 1000
    await kv.update(key, new TextEncoder().encode(JSON.stringify(record)), entry!.revision)

    await coordinator.bootReconciliation()

    const result = await coordinator.getDelegation("ws-1", delegationId)
    expect(result!.status).toBe("stale")
  })

  test("bootReconciliation: rebuild missing secondary index", async () => {
    const { coordinator } = await setup()
    const { delegationId } = await coordinator.createDelegation(baseArgs())

    // Delete the secondary index key manually
    const kvm = new Kvm(nc!)
    const kv = await kvm.open("delegations")
    const secKey = `delegation_by_child.ws-1.child-1.${delegationId}`
    await kv.delete(secKey)

    // Verify it's gone
    const beforeChildren = await coordinator.getDelegationsForChild("ws-1", "child-1")
    expect(beforeChildren).toHaveLength(0)

    await coordinator.bootReconciliation()

    // Should be rebuilt
    const afterChildren = await coordinator.getDelegationsForChild("ws-1", "child-1")
    expect(afterChildren).toHaveLength(1)
    expect(afterChildren[0]!.delegationId).toBe(delegationId)
  })

  test("bootReconciliation: stuck completing with entryId → completed", async () => {
    const { coordinator } = await setup()
    const { delegationId } = await coordinator.createDelegation(baseArgs())

    // Manually set to "completing" with agentResultEntryId via KV
    const kvm = new Kvm(nc!)
    const kv = await kvm.open("delegations")
    const key = `delegation.ws-1.${delegationId}`
    const entry = await kv.get(key)
    const record = JSON.parse(new TextDecoder().decode(entry!.value))
    record.status = "completing"
    record.agentResultEntryId = "some-entry-id"
    await kv.update(key, new TextEncoder().encode(JSON.stringify(record)), entry!.revision)

    await coordinator.bootReconciliation()

    const result = await coordinator.getDelegation("ws-1", delegationId)
    expect(result!.status).toBe("completed")
  })

  test("bootReconciliation: stuck completing without entryId → failed", async () => {
    const { coordinator } = await setup()
    const { delegationId } = await coordinator.createDelegation(baseArgs())

    // Manually set to "completing" without agentResultEntryId
    const kvm = new Kvm(nc!)
    const kv = await kvm.open("delegations")
    const key = `delegation.ws-1.${delegationId}`
    const entry = await kv.get(key)
    const record = JSON.parse(new TextDecoder().decode(entry!.value))
    record.status = "completing"
    await kv.update(key, new TextEncoder().encode(JSON.stringify(record)), entry!.revision)

    await coordinator.bootReconciliation()

    const result = await coordinator.getDelegation("ws-1", delegationId)
    expect(result!.status).toBe("failed")
  })

  // -----------------------------------------------------------------------
  // hasActiveBlockingDelegations (sync cache)
  // -----------------------------------------------------------------------

  test("hasActiveBlockingDelegations returns false with no delegations", async () => {
    const { coordinator } = await setup()
    expect(coordinator.hasActiveBlockingDelegations("parent-1")).toBe(false)
  })

  test("hasActiveBlockingDelegations returns true after blocking delegation created", async () => {
    const { coordinator } = await setup()
    await coordinator.createDelegation(baseArgs({ mode: "blocking" }))
    expect(coordinator.hasActiveBlockingDelegations("parent-1")).toBe(true)
  })

  test("hasActiveBlockingDelegations returns false for background delegation", async () => {
    const { coordinator } = await setup()
    await coordinator.createDelegation(baseArgs({ mode: "background" }))
    expect(coordinator.hasActiveBlockingDelegations("parent-1")).toBe(false)
  })

  test("hasActiveBlockingDelegations returns false after delegation completes", async () => {
    const { coordinator } = await setup()
    await coordinator.createDelegation(baseArgs({ mode: "blocking" }))
    expect(coordinator.hasActiveBlockingDelegations("parent-1")).toBe(true)

    await coordinator.reconcileChildTerminal("ws-1", "child-1", successOutcome())
    expect(coordinator.hasActiveBlockingDelegations("parent-1")).toBe(false)
  })

  test("hasActiveBlockingDelegations tracks multiple blocking delegations", async () => {
    const { coordinator } = await setup()
    await coordinator.createDelegation(baseArgs({ childChatId: "child-1", mode: "blocking" }))
    await coordinator.createDelegation(baseArgs({ childChatId: "child-2", mode: "blocking" }))
    expect(coordinator.hasActiveBlockingDelegations("parent-1")).toBe(true)

    // Complete one — still has active blocking
    await coordinator.reconcileChildTerminal("ws-1", "child-1", successOutcome())
    expect(coordinator.hasActiveBlockingDelegations("parent-1")).toBe(true)

    // Complete the other — now clear
    await coordinator.reconcileChildTerminal("ws-1", "child-2", successOutcome())
    expect(coordinator.hasActiveBlockingDelegations("parent-1")).toBe(false)
  })

  test("bootReconciliation rebuilds sync cache from KV", async () => {
    const { coordinator } = await setup()
    // Create two blocking delegations
    await coordinator.createDelegation(baseArgs({ childChatId: "child-1", mode: "blocking" }))
    await coordinator.createDelegation(baseArgs({ childChatId: "child-2", mode: "blocking" }))
    expect(coordinator.hasActiveBlockingDelegations("parent-1")).toBe(true)

    // Create a fresh coordinator sharing the same NATS + KV to simulate restart
    const coordinator2 = new DelegationCoordinator(nc!, store!)
    await coordinator2.initialize()
    // Before boot reconciliation, cache is empty
    expect(coordinator2.hasActiveBlockingDelegations("parent-1")).toBe(false)

    await coordinator2.bootReconciliation()
    // After boot, cache is rebuilt
    expect(coordinator2.hasActiveBlockingDelegations("parent-1")).toBe(true)
  })

  test("bootReconciliation cache excludes completed delegations", async () => {
    const { coordinator } = await setup()
    await coordinator.createDelegation(baseArgs({ childChatId: "child-1", mode: "blocking" }))
    await coordinator.reconcileChildTerminal("ws-1", "child-1", successOutcome())

    // Fresh coordinator
    const coordinator2 = new DelegationCoordinator(nc!, store!)
    await coordinator2.initialize()
    await coordinator2.bootReconciliation()
    expect(coordinator2.hasActiveBlockingDelegations("parent-1")).toBe(false)
  })

  test("bootReconciliation skips already terminal records", async () => {
    const { coordinator } = await setup()
    const { delegationId } = await coordinator.createDelegation(baseArgs())

    // Complete it first
    await coordinator.reconcileChildTerminal("ws-1", "child-1", successOutcome())
    const before = await coordinator.getDelegation("ws-1", delegationId)
    expect(before!.status).toBe("completed")

    // Boot reconciliation should not touch it
    await coordinator.bootReconciliation()
    const after = await coordinator.getDelegation("ws-1", delegationId)
    expect(after!.status).toBe("completed")
    expect(after!.updatedAt).toBe(before!.updatedAt)
  })
})
