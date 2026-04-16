import { Kvm, type KV } from "@nats-io/kv"
import type { NatsConnection } from "@nats-io/nats-core"
import type {
  AgentProvider,
  DelegationMode,
  DelegationResumeMode,
  DelegationStatus,
  DurableDelegation,
  AgentResultEntry,
  TranscriptEntry,
} from "../shared/types"
import { LOG_PREFIX } from "../shared/branding"
import { toTranscriptLine } from "./transcript-utils"

const DELEGATIONS_BUCKET = "delegations"
const MAX_DELEGATION_DEPTH = 2
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000 // 24h

const MAX_RESUME_HINT_ENTRIES = 24
const MAX_RESUME_HINT_CHARS = 12_000
const MAX_RESUME_HINT_LINE_CHARS = 600

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function primaryKey(workspaceId: string, delegationId: string): string {
  return `delegation.${workspaceId}.${delegationId}`
}

function secondaryKey(workspaceId: string, childChatId: string, delegationId: string): string {
  return `delegation_by_child.${workspaceId}.${childChatId}.${delegationId}`
}

function secondaryPrefix(workspaceId: string, childChatId: string): string {
  return `delegation_by_child.${workspaceId}.${childChatId}.`
}

function primaryPrefix(workspaceId: string): string {
  return `delegation.${workspaceId}.`
}

function encode(data: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(data))
}

function decode<T>(data: Uint8Array): T {
  return JSON.parse(decoder.decode(data)) as T
}

/** Iterate all KV keys matching a dot-prefix (avoids NATS wildcard filter quirks). */
async function* keysWithPrefix(kv: KV, prefix: string): AsyncIterable<string> {
  const iter = await kv.keys()
  for await (const key of iter) {
    if (key.startsWith(prefix)) yield key
  }
}

export interface DelegationStore {
  appendMessage(chatId: string, entry: TranscriptEntry): void
  chatExists(chatId: string): boolean
  getChatWorkspaceId(chatId: string): string | undefined
  getLastTurnOutcome(chatId: string): string | undefined
}

export interface CreateDelegationArgs {
  workspaceId: string
  parentChatId: string
  childChatId: string
  childProvider: AgentProvider
  instructionPreview: string
  mode: DelegationMode
  resume: DelegationResumeMode
  depth: number
  resumeHint?: string
}

export interface TerminalOutcome {
  outcome: "success" | "failed" | "cancelled"
  resultSummary?: string
}

export type ReconcileResult =
  | { delegationId: string; parentChatId: string; injectedEntryId: string; resumeEligible: boolean }
  | { alreadyReconciled: true }

export class DelegationCoordinator {
  private kv: KV | null = null
  private readonly nc: NatsConnection
  private readonly store: DelegationStore
  /** Sync cache: parentChatId → count of active blocking delegations. */
  private readonly activeBlockingCount = new Map<string, number>()

  constructor(nc: NatsConnection, store: DelegationStore) {
    this.nc = nc
    this.store = store
  }

  async initialize(): Promise<void> {
    const kvm = new Kvm(this.nc)
    this.kv = await kvm.create(DELEGATIONS_BUCKET)
    console.warn(LOG_PREFIX, `KV bucket "${DELEGATIONS_BUCKET}" ready`)
  }

  private requireKv(): KV {
    if (!this.kv) throw new Error("DelegationCoordinator not initialized")
    return this.kv
  }

  async createDelegation(args: CreateDelegationArgs): Promise<{ delegationId: string }> {
    if (args.depth > MAX_DELEGATION_DEPTH) {
      throw new Error(`Delegation depth ${args.depth} exceeds maximum ${MAX_DELEGATION_DEPTH}`)
    }

    const kv = this.requireKv()
    const delegationId = crypto.randomUUID()
    const now = Date.now()

    const record: DurableDelegation = {
      delegationId,
      workspaceId: args.workspaceId,
      parentChatId: args.parentChatId,
      childChatId: args.childChatId,
      childProvider: args.childProvider,
      instructionPreview: args.instructionPreview.slice(0, 120),
      mode: args.mode,
      resume: args.resume,
      status: "active",
      depth: args.depth,
      resumeHint: args.resumeHint,
      createdAt: now,
      updatedAt: now,
    }

    // Primary first, secondary second (ordering guarantee per ADR)
    await kv.put(primaryKey(args.workspaceId, delegationId), encode(record))
    await kv.put(
      secondaryKey(args.workspaceId, args.childChatId, delegationId),
      encode({ delegationId, parentChatId: args.parentChatId }),
    )

    // Update sync cache
    if (args.mode === "blocking") {
      this.activeBlockingCount.set(
        args.parentChatId,
        (this.activeBlockingCount.get(args.parentChatId) ?? 0) + 1,
      )
    }

    return { delegationId }
  }

  async getDelegation(workspaceId: string, delegationId: string): Promise<DurableDelegation | null> {
    const kv = this.requireKv()
    try {
      const entry = await kv.get(primaryKey(workspaceId, delegationId))
      if (!entry?.value) return null
      return decode<DurableDelegation>(entry.value)
    } catch (_err) {
      return null
    }
  }

  async getDelegationsForChild(workspaceId: string, childChatId: string): Promise<DurableDelegation[]> {
    const kv = this.requireKv()
    const prefix = secondaryPrefix(workspaceId, childChatId)
    const results: DurableDelegation[] = []

    for await (const key of keysWithPrefix(kv, prefix)) {
      const idxEntry = await kv.get(key)
      if (!idxEntry?.value) continue
      const idx = decode<{ delegationId: string; parentChatId: string }>(idxEntry.value)
      const record = await this.getDelegation(workspaceId, idx.delegationId)
      if (record) results.push(record)
    }

    return results
  }

  async getBlockingDelegationsForParent(workspaceId: string, parentChatId: string): Promise<DurableDelegation[]> {
    const kv = this.requireKv()
    const prefix = primaryPrefix(workspaceId)
    const results: DurableDelegation[] = []

    for await (const key of keysWithPrefix(kv, prefix)) {
      const entry = await kv.get(key)
      if (!entry?.value) continue
      const record = decode<DurableDelegation>(entry.value)
      if (record.parentChatId === parentChatId && record.mode === "blocking" && record.status === "active") {
        results.push(record)
      }
    }

    return results
  }

  hasActiveBlockingDelegations(chatId: string): boolean {
    return (this.activeBlockingCount.get(chatId) ?? 0) > 0
  }

  async reconcileChildTerminal(
    workspaceId: string,
    childChatId: string,
    outcome: TerminalOutcome,
  ): Promise<ReconcileResult | null> {
    const delegations = await this.getDelegationsForChild(workspaceId, childChatId)
    if (delegations.length === 0) return null

    // Process first active delegation for this child
    const delegation = delegations.find((d) => d.status === "active" || d.status === "completing")
    if (!delegation) return { alreadyReconciled: true }

    if (delegation.status === "completed" || delegation.status === "failed" || delegation.status === "orphaned" || delegation.status === "stale") {
      return { alreadyReconciled: true }
    }

    const kv = this.requireKv()
    const key = primaryKey(workspaceId, delegation.delegationId)

    // CAS transition: active → completing
    const currentEntry = await kv.get(key)
    if (!currentEntry?.value) return null

    const current = decode<DurableDelegation>(currentEntry.value)
    if (current.status !== "active") {
      return { alreadyReconciled: true }
    }

    const isError = outcome.outcome === "failed" || outcome.outcome === "cancelled"
    const now = Date.now()
    const entryId = crypto.randomUUID()

    // Build agent_result entry
    const agentResultEntry: AgentResultEntry = {
      _id: entryId,
      createdAt: now,
      kind: "agent_result",
      delegationId: delegation.delegationId,
      childChatId,
      childProvider: delegation.childProvider,
      mode: delegation.mode,
      instructionPreview: delegation.instructionPreview,
      resumeHint: delegation.resumeHint,
      resultSummary: outcome.resultSummary ?? (isError ? "Agent failed" : "Agent completed"),
      isError,
      completedAt: now,
    }

    // CAS update: active → completed (combining completing step for simplicity)
    const updatedRecord: DurableDelegation = {
      ...current,
      status: isError ? "failed" : "completed",
      resultSummary: agentResultEntry.resultSummary,
      isError,
      agentResultEntryId: entryId,
      updatedAt: now,
    }

    try {
      await kv.update(key, encode(updatedRecord), currentEntry.revision)
    } catch (_casConflict) {
      // CAS conflict — another reconciliation already handled this
      return { alreadyReconciled: true }
    }

    // Update sync cache for blocking delegations
    if (delegation.mode === "blocking") {
      const prev = this.activeBlockingCount.get(delegation.parentChatId) ?? 0
      if (prev <= 1) {
        this.activeBlockingCount.delete(delegation.parentChatId)
      } else {
        this.activeBlockingCount.set(delegation.parentChatId, prev - 1)
      }
    }

    // Inject agent_result into parent transcript
    this.store.appendMessage(delegation.parentChatId, agentResultEntry)

    // Determine resume eligibility
    const resumeEligible = await this.checkResumeEligibility(delegation)

    return {
      delegationId: delegation.delegationId,
      parentChatId: delegation.parentChatId,
      injectedEntryId: entryId,
      resumeEligible,
    }
  }

  private async checkResumeEligibility(delegation: DurableDelegation): Promise<boolean> {
    if (delegation.mode === "background") return false

    if (delegation.resume === "immediate") return true

    // gate mode: check all blocking delegations for this parent
    const siblings = await this.getBlockingDelegationsForParent(delegation.workspaceId, delegation.parentChatId)
    // If no active blocking siblings remain, all are terminal → eligible
    return siblings.length === 0
  }

  generateResumeHint(entries: TranscriptEntry[]): string | undefined {
    const relevantEntries = entries
      .map((entry) => toTranscriptLine(entry, MAX_RESUME_HINT_LINE_CHARS))
      .filter((line): line is string => Boolean(line))

    if (relevantEntries.length === 0) return undefined

    const selected = relevantEntries.slice(-MAX_RESUME_HINT_ENTRIES)
    const omittedCount = relevantEntries.length - selected.length
    const headerLines = [
      "Delegation context from parent chat:",
      "This is background context from before the delegation. Use it to continue your work.",
    ]
    if (omittedCount > 0) {
      headerLines.push(`Older transcript lines omitted: ${omittedCount}.`)
    }

    const lines = [...headerLines, ...selected]
    let serialized = lines.join("\n")

    if (serialized.length <= MAX_RESUME_HINT_CHARS) {
      return serialized
    }

    // Trim from the front to stay within budget
    const trimmedSelected: string[] = []
    let remaining = MAX_RESUME_HINT_CHARS - headerLines.join("\n").length - 1
    for (let index = selected.length - 1; index >= 0; index -= 1) {
      const line = selected[index]!
      const cost = line.length + 1
      if (remaining - cost < 0) break
      trimmedSelected.unshift(line)
      remaining -= cost
    }

    if (trimmedSelected.length === 0) {
      return headerLines.join("\n")
    }

    return [...headerLines, ...trimmedSelected].join("\n")
  }

  async bootReconciliation(): Promise<void> {
    const kv = this.requireKv()
    const prefix = "delegation."
    const now = Date.now()
    const secondaryKeysToRebuild: Array<{ wsId: string; childId: string; delId: string }> = []

    for await (const key of keysWithPrefix(kv, prefix)) {
      // Skip secondary index keys
      if (key.startsWith("delegation_by_child.")) continue

      const entry = await kv.get(key)
      if (!entry?.value) continue

      const record = decode<DurableDelegation>(entry.value)
      if (record.status === "completed" || record.status === "failed" || record.status === "orphaned" || record.status === "stale") {
        continue
      }

      let newStatus: DelegationStatus | null = null

      // Check parent existence
      if (!this.store.chatExists(record.parentChatId)) {
        newStatus = "orphaned"
      }
      // Check child existence
      else if (!this.store.chatExists(record.childChatId)) {
        newStatus = "orphaned"
      }
      // Check stuck completing state
      else if (record.status === "completing") {
        if (record.agentResultEntryId) {
          newStatus = "completed"
        } else {
          newStatus = "failed"
        }
      }
      // Check child already terminal
      else if (record.status === "active") {
        const childOutcome = this.store.getLastTurnOutcome(record.childChatId)
        if (childOutcome === "success") {
          // Complete + inject
          const entryId = crypto.randomUUID()
          const agentResultEntry: AgentResultEntry = {
            _id: entryId,
            createdAt: now,
            kind: "agent_result",
            delegationId: record.delegationId,
            childChatId: record.childChatId,
            childProvider: record.childProvider,
            mode: record.mode,
            instructionPreview: record.instructionPreview,
            resumeHint: record.resumeHint,
            resultSummary: "Agent completed (recovered on boot)",
            isError: false,
            completedAt: now,
          }
          this.store.appendMessage(record.parentChatId, agentResultEntry)
          newStatus = "completed"
        } else if (childOutcome === "failed") {
          newStatus = "failed"
        } else if (now - record.createdAt > STALE_THRESHOLD_MS) {
          newStatus = "stale"
          console.warn(LOG_PREFIX, `Marking delegation ${record.delegationId} as stale (age: ${Math.round((now - record.createdAt) / 3600000)}h)`)
        }
        // else: child still active, keep as-is
      }

      if (newStatus) {
        const updated: DurableDelegation = {
          ...record,
          status: newStatus,
          updatedAt: now,
        }
        try {
          await kv.update(key, encode(updated), entry.revision)
        } catch (_casConflict) {
          console.warn(LOG_PREFIX, `CAS conflict during boot reconciliation for delegation ${record.delegationId}`)
        }
      }

      // Track for secondary index rebuild
      secondaryKeysToRebuild.push({
        wsId: record.workspaceId,
        childId: record.childChatId,
        delId: record.delegationId,
      })
    }

    // Rebuild secondary indexes (idempotent upsert — simpler than checking tombstones)
    for (const { wsId, childId, delId } of secondaryKeysToRebuild) {
      const secKey = secondaryKey(wsId, childId, delId)
      const record = await this.getDelegation(wsId, delId)
      if (record) {
        await kv.put(secKey, encode({ delegationId: delId, parentChatId: record.parentChatId }))
      }
    }

    // Rebuild activeBlockingCount cache from final KV state
    this.activeBlockingCount.clear()
    for await (const key of keysWithPrefix(kv, prefix)) {
      if (key.startsWith("delegation_by_child.")) continue
      const entry = await kv.get(key)
      if (!entry?.value) continue
      const record = decode<DurableDelegation>(entry.value)
      if (record.status === "active" && record.mode === "blocking") {
        this.activeBlockingCount.set(
          record.parentChatId,
          (this.activeBlockingCount.get(record.parentChatId) ?? 0) + 1,
        )
      }
    }
  }
}
