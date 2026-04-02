import type { NatsConnection } from "@nats-io/transport-node"
import { jetstream } from "@nats-io/jetstream"
import { Kvm } from "@nats-io/kv"
import { homedir } from "node:os"
import { join } from "node:path"
import type { SubscriptionTopic } from "../shared/protocol"
import { snapshotSubject, snapshotKvKey, terminalEventSubject, chatMessageSubject, KV_BUCKET } from "../shared/nats-subjects"
import { LOG_PREFIX } from "../shared/branding"
import { compressPayload } from "../shared/compression"
import type { ChatMessageEvent, SessionsSnapshot, TranscriptEntry } from "../shared/types"
import type { AgentCoordinator } from "./agent"
import type { DiscoveredProject } from "./discovery"
import type { EventStore } from "./event-store"
import type { KeybindingsManager } from "./keybindings"
import { deriveChatSnapshot, deriveLocalProjectsSnapshot, deriveSessionsSnapshot, deriveSidebarData } from "./read-models"
import { discoverSessions } from "./session-discovery"
import type { TerminalManager } from "./terminal-manager"
import type { UpdateManager } from "./update-manager"
import type { DesktopRenderersRegistry } from "./desktop-renderers"

const encoder = new TextEncoder()

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const DEFAULT_UPDATE_SNAPSHOT = {
  currentVersion: "unknown",
  latestVersion: null,
  status: "idle",
  updateAvailable: false,
  lastCheckedAt: null,
  error: null,
  installAction: "restart",
} as const

export interface CreateNatsPublisherArgs {
  nc: NatsConnection
  store: EventStore
  agent: AgentCoordinator
  terminals: TerminalManager
  keybindings: KeybindingsManager
  refreshDiscovery: () => Promise<DiscoveredProject[]>
  getDiscoveredProjects: () => DiscoveredProject[]
  machineDisplayName: string
  updateManager: UpdateManager | null
  desktopRenderers: DesktopRenderersRegistry
}

export async function createNatsPublisher(args: CreateNatsPublisherArgs) {
  const {
    nc,
    store,
    agent,
    terminals,
    keybindings,
    getDiscoveredProjects,
    machineDisplayName,
    updateManager,
    desktopRenderers,
  } = args

  const js = jetstream(nc)
  const kv = await new Kvm(nc).create(KV_BUCKET)
  console.warn(LOG_PREFIX, `KV bucket "${KV_BUCKET}" ready`)

  const activeSubscriptions = new Map<string, SubscriptionTopic>()
  const lastJsonByKey = new Map<string, string>()
  const sessionsCache = new Map<string, SessionsSnapshot>()
  const sessionsPollTimers = new Map<string, ReturnType<typeof setInterval>>()

  function encodeClaudeProjectDir(projectPath: string): string {
    return join(homedir(), ".claude", "projects", `-${projectPath.replace(/\//g, "-")}`)
  }

  async function refreshSessions(projectId: string, projectPath: string): Promise<void> {
    const home = homedir()
    const claudeProjectDir = encodeClaudeProjectDir(projectPath)
    const codexSessionsDir = join(home, ".codex", "sessions")

    const snapshot = await discoverSessions({
      projectId,
      projectPath,
      store,
      claudeProjectDir,
      codexSessionsDir,
    })

    sessionsCache.set(projectId, snapshot)
    const topic = { type: "sessions" as const, projectId }
    publishSnapshot(topic, snapshot)
  }

  function publishSnapshot(topic: SubscriptionTopic, data: unknown): void {
    const kvKey = snapshotKvKey(topic)
    const json = JSON.stringify(data)

    if (lastJsonByKey.get(kvKey) === json) return

    const payload = compressPayload(encoder.encode(json))

    try {
      nc.publish(snapshotSubject(topic), payload)
      lastJsonByKey.set(kvKey, json)
    } catch (error) {
      console.warn(LOG_PREFIX, `NATS publish failed on ${snapshotSubject(topic)}: ${errorMessage(error)}`)
    }

    void kv.put(kvKey, payload).catch((error) => {
      console.warn(LOG_PREFIX, `KV put failed on ${kvKey}: ${errorMessage(error)}`)
    })
  }

  function computeSnapshot(topic: SubscriptionTopic): unknown {
    switch (topic.type) {
      case "sidebar":
        return deriveSidebarData(store.state, agent.getActiveStatuses())
      case "local-projects":
        return deriveLocalProjectsSnapshot(store.state, getDiscoveredProjects(), machineDisplayName)
      case "desktop-renderers":
        return desktopRenderers.getSnapshot()
      case "keybindings":
        return keybindings.getSnapshot()
      case "update":
        return updateManager?.getSnapshot() ?? DEFAULT_UPDATE_SNAPSHOT
      case "chat":
        return deriveChatSnapshot(
          store.state,
          agent.getActiveStatuses(),
          topic.chatId,
          store.getMessageCount(topic.chatId),
        )
      case "terminal":
        return terminals.getSnapshot(topic.terminalId)
      case "sessions":
        return deriveSessionsSnapshot(sessionsCache.get(topic.projectId) ?? null)
      default: {
        const _exhaustive: never = topic
        throw new Error(`Unknown topic type: ${(_exhaustive as SubscriptionTopic).type}`)
      }
    }
  }

  function addSubscription(subscriptionId: string, topic: SubscriptionTopic): void {
    activeSubscriptions.set(subscriptionId, topic)

    if (topic.type === "sessions" && !sessionsPollTimers.has(topic.projectId)) {
      const projectId = topic.projectId
      // Look up project path from store
      const project = store.state.projectsById.get(projectId)
      if (project) {
        const projectPath = project.localPath
        refreshSessions(projectId, projectPath).catch((err) =>
          console.warn(LOG_PREFIX, "sessions scan failed:", err instanceof Error ? err.message : String(err))
        )
        const timer = setInterval(() => {
          refreshSessions(projectId, projectPath).catch((err) =>
            console.warn(LOG_PREFIX, "sessions scan failed:", err instanceof Error ? err.message : String(err))
          )
        }, 60_000)
        sessionsPollTimers.set(projectId, timer)
      }
    }
  }

  function removeSubscription(subscriptionId: string): void {
    const topic = activeSubscriptions.get(subscriptionId)
    activeSubscriptions.delete(subscriptionId)

    // Prune dedup cache if no remaining subscriptions reference this key
    if (topic) {
      const key = snapshotKvKey(topic)
      const stillTracked = [...activeSubscriptions.values()].some((t) => snapshotKvKey(t) === key)
      if (!stillTracked) {
        lastJsonByKey.delete(key)
      }

      // Clean up sessions poll timer if no remaining sessions subscriptions for this projectId
      if (topic.type === "sessions") {
        const projectId = topic.projectId
        const hasOtherSessionsSub = [...activeSubscriptions.values()].some(
          (t) => t.type === "sessions" && t.projectId === projectId
        )
        if (!hasOtherSessionsSub) {
          const timer = sessionsPollTimers.get(projectId)
          if (timer) {
            clearInterval(timer)
            sessionsPollTimers.delete(projectId)
          }
          sessionsCache.delete(projectId)
        }
      }
    }
  }

  function getSnapshot(topic: SubscriptionTopic): unknown {
    const data = computeSnapshot(topic)
    publishSnapshot(topic, data)
    return data
  }

  function broadcastSnapshots(): void {
    const published = new Set<string>()
    for (const [, topic] of activeSubscriptions) {
      const key = snapshotKvKey(topic)
      if (published.has(key)) continue
      published.add(key)
      publishSnapshot(topic, computeSnapshot(topic))
    }
  }

  function publishChatMessage(chatId: string, entry: TranscriptEntry): void {
    const subject = chatMessageSubject(chatId)
    const event: ChatMessageEvent = { chatId, entry }
    const payload = compressPayload(encoder.encode(JSON.stringify(event)))
    void js.publish(subject, payload).catch((error) => {
      console.warn(LOG_PREFIX, `JetStream publish failed on ${subject}: ${errorMessage(error)}`)
    })
  }

  const disposeTerminalEvents = terminals.onEvent((event) => {
    const subject = terminalEventSubject(event.terminalId)
    const payload = compressPayload(encoder.encode(JSON.stringify(event)))
    void js.publish(subject, payload).catch((error) => {
      console.warn(LOG_PREFIX, `JetStream publish failed on ${subject}: ${errorMessage(error)}`)
    })
  })

  const disposeKeybindingEvents = keybindings.onChange(() => {
    publishSnapshot({ type: "keybindings" }, keybindings.getSnapshot())
  })

  const disposeUpdateEvents = updateManager?.onChange(() => {
    publishSnapshot({ type: "update" }, updateManager.getSnapshot())
  }) ?? (() => {})

  return {
    addSubscription,
    removeSubscription,
    getSnapshot,
    broadcastSnapshots,
    publishChatMessage,
    refreshSessions,
    dispose() {
      disposeTerminalEvents()
      disposeKeybindingEvents()
      disposeUpdateEvents()
      for (const timer of sessionsPollTimers.values()) {
        clearInterval(timer)
      }
      sessionsPollTimers.clear()
    },
  }
}

export type NatsPublisher = Awaited<ReturnType<typeof createNatsPublisher>>
