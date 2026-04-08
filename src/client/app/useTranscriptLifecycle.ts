import { useEffect, useLayoutEffect, useRef, useState } from "react"
import type {
  ChatMessageEvent,
  ChatSnapshot,
  HydratedTranscriptMessage,
  OrchestrationHierarchySnapshot,
  SidebarData,
  TranscriptEntry,
} from "../../shared/types"
import { createIncrementalHydrator } from "../lib/parseTranscript"
import type { IncrementalHydrator } from "../lib/parseTranscript"
import { getCachedChat, setCachedChat } from "./chatCache"
import {
  computeTailOffset,
  shouldBackfillTranscriptWindow,
  summarizeTranscriptWindow,
  TRANSCRIPT_TAIL_SIZE,
} from "./appState.helpers"
import { transitionProjectSelection } from "./useAppState.machine"
import type { ProjectSelectionState } from "./useAppState.machine"
import type { AppTransport } from "./socket-interface"
import { processTranscriptMessages } from "../lib/parseTranscript"

const LOG_PREFIX = "[useTranscriptLifecycle]"

function log(message: string, details?: unknown) {
  if (details === undefined) {
    console.info(`${LOG_PREFIX} ${message}`)
    return
  }
  console.info(`${LOG_PREFIX} ${message}`, details)
}

export interface TranscriptLifecycleArgs {
  socket: AppTransport
  activeChatId: string | null
  resumeRefreshNonce: number
  sidebarData: SidebarData
  sidebarReady: boolean
  pendingChatId: string | null
  setPendingChatId: (id: string | null) => void
  navigate: (path: string) => void
  setProjectSelection: React.Dispatch<React.SetStateAction<ProjectSelectionState>>
  setCommandError: (error: string | null) => void
  onChatSnapshotReceived: (snapshot: ChatSnapshot) => void
}

export interface TranscriptLifecycleResult {
  messages: HydratedTranscriptMessage[]
  messagesRef: React.RefObject<HydratedTranscriptMessage[]>
  messageCountRef: React.RefObject<number>
  chatSnapshot: ChatSnapshot | null
  orchestrationHierarchy: OrchestrationHierarchySnapshot | null
  chatReady: boolean
}

export function useTranscriptLifecycle(args: TranscriptLifecycleArgs): TranscriptLifecycleResult {
  const {
    socket,
    activeChatId,
    resumeRefreshNonce,
    sidebarData,
    sidebarReady,
    pendingChatId,
    setPendingChatId,
    navigate,
    setProjectSelection,
    setCommandError,
    onChatSnapshotReceived,
  } = args

  // Stable ref for the callback to avoid re-triggering the subscription effect
  const onChatSnapshotReceivedRef = useRef(onChatSnapshotReceived)
  useLayoutEffect(() => { onChatSnapshotReceivedRef.current = onChatSnapshotReceived }, [onChatSnapshotReceived])

  const hydratorRef = useRef<IncrementalHydrator>(createIncrementalHydrator())
  const [messages, setMessages] = useState<HydratedTranscriptMessage[]>([])
  const messagesRef = useRef<HydratedTranscriptMessage[]>(messages)
  const messageCountRef = useRef(0)
  const [chatSnapshot, setChatSnapshot] = useState<ChatSnapshot | null>(null)
  const [orchestrationHierarchy, setOrchestrationHierarchy] = useState<OrchestrationHierarchySnapshot | null>(null)
  const [chatReady, setChatReady] = useState(false)

  // Sync messagesRef
  useLayoutEffect(() => { messagesRef.current = messages }, [messages])

  // ── Chat subscription ─────────────────────────────────────────────
  useEffect(() => {
    if (!activeChatId) {
      log("clearing chat snapshot for non-chat route")
      setChatSnapshot(null)
      setOrchestrationHierarchy(null)
      setProjectSelection((current) => transitionProjectSelection(current, { type: "chat.cleared" }))
      // Don't mutate cached hydrator — create a fresh one
      hydratorRef.current = createIncrementalHydrator()
      setMessages([])
      setChatReady(true)
      return
    }

    // Restore from cache or create fresh state
    const cached = getCachedChat(activeChatId)
    const restoredFromCache = cached !== null
    const hydrator = cached?.hydrator ?? createIncrementalHydrator()
    hydratorRef.current = hydrator

    if (restoredFromCache) {
      log("restoring chat from cache", {
        activeChatId,
        cachedMessages: cached.messages.length,
        cachedDiagnostics: summarizeTranscriptWindow(cached.messages),
        stale: cached.stale,
      })
      setMessages(cached.messages)
      setChatSnapshot(null) // will be replaced when snapshot arrives
      setChatReady(true)    // show stale content immediately
    } else {
      log("subscribing to chat (no cache)", { activeChatId })
      setChatSnapshot(null)
      setMessages([])
      setChatReady(false)
    }

    // Buffer message events that arrive before the initial fetch completes
    let cancelled = false
    let initialFetchDone = false
    let fetchTriggered = false
    const buffer: TranscriptEntry[] = []
    const chatId = activeChatId

    function flushTail(entries: TranscriptEntry[], source: "fetched" | "fallback_empty") {
      if (cancelled) return
      initialFetchDone = true
      const bufferedEntries = buffer.length
      const allEntries = bufferedEntries > 0 ? [...entries, ...buffer] : entries
      buffer.length = 0
      // Only reset on fresh load — cache-restored hydrators skip duplicates via seenEntryIds
      if (!restoredFromCache) {
        hydrator.reset()
      }
      for (const entry of allEntries) hydrator.hydrate(entry)
      const hydratedMessages = hydrator.getMessages()
      setMessages(hydratedMessages)
      log("transcript tail flushed", {
        chatId,
        source,
        restoredFromCache,
        fetchedEntryCount: entries.length,
        bufferedEntryCount: bufferedEntries,
        hydratedDiagnostics: summarizeTranscriptWindow(hydratedMessages),
      })
    }

    async function fetchTail(messageCount: number) {
      if (fetchTriggered) return
      fetchTriggered = true
      try {
        let offset = computeTailOffset(messageCount)
        let entries = await socket.command<TranscriptEntry[]>({
          type: "chat.getMessages", chatId, offset, limit: TRANSCRIPT_TAIL_SIZE,
        })
        let hydratedPreview = processTranscriptMessages(entries)

        log("transcript tail fetched", {
          chatId,
          messageCount,
          offset,
          rawEntryCount: entries.length,
          hydratedDiagnostics: summarizeTranscriptWindow(hydratedPreview),
        })

        while (shouldBackfillTranscriptWindow({
          messages: hydratedPreview,
          messageCount,
          offset,
        })) {
          const nextOffset = Math.max(0, offset - TRANSCRIPT_TAIL_SIZE)
          log("transcript tail needs backfill", {
            chatId,
            messageCount,
            offset,
            hydratedDiagnostics: summarizeTranscriptWindow(hydratedPreview),
          })
          const olderEntries = await socket.command<TranscriptEntry[]>({
            type: "chat.getMessages",
            chatId,
            offset: nextOffset,
            limit: offset - nextOffset,
          })
          if (olderEntries.length === 0) break
          entries = [...olderEntries, ...entries]
          offset = nextOffset
          hydratedPreview = processTranscriptMessages(entries)
          log("backfilling transcript window", {
            chatId,
            messageCount,
            offset,
            fetchedEntries: entries.length,
            hydratedDiagnostics: summarizeTranscriptWindow(hydratedPreview),
          })
        }

        flushTail(entries, "fetched")
      } catch (error) {
        log("transcript tail fetch failed", {
          chatId,
          error: error instanceof Error ? error.message : String(error),
        })
        flushTail([], "fallback_empty")
      }
    }

    const unsub = socket.subscribe<ChatSnapshot | null, ChatMessageEvent>(
      { type: "chat", chatId: activeChatId },
      (snapshot) => {
        if (cancelled) return
        log("chat snapshot received", {
          activeChatId,
          snapshotChatId: snapshot?.runtime.chatId ?? null,
          snapshotProvider: snapshot?.runtime.provider ?? null,
          snapshotStatus: snapshot?.runtime.status ?? null,
        })
        setChatSnapshot(snapshot)
        if (snapshot) {
          messageCountRef.current = snapshot.messageCount
          setProjectSelection((current) => transitionProjectSelection(current, {
            type: "chat.snapshot_received",
            projectId: snapshot.runtime.projectId,
          }))
          onChatSnapshotReceivedRef.current(snapshot)
        }
        setChatReady(true)
        setCommandError(null)

        // Fetch tail on first snapshot — messageCount tells us where the end is
        if (snapshot && !initialFetchDone) {
          void fetchTail(snapshot.messageCount)
        }
      },
      (event) => {
        if (cancelled) return
        if (event.chatId !== activeChatId) return
        if (initialFetchDone) {
          hydrator.hydrate(event.entry)
          setMessages(hydrator.getMessages())
        } else {
          buffer.push(event.entry)
        }
      }
    )

    const orchestrationUnsub = socket.subscribe<OrchestrationHierarchySnapshot>(
      { type: "orchestration", chatId: activeChatId },
      (snapshot) => {
        if (cancelled) return
        setOrchestrationHierarchy(snapshot)
      },
    )

    return () => {
      cancelled = true
      unsub()
      orchestrationUnsub()
      // Save departing chat to cache — use sidebar's lastMessageAt as the source of truth
      const departingSidebarChat = sidebarData.projectGroups
        .flatMap((g) => g.chats)
        .find((c) => c.chatId === chatId)
      if (chatId && messagesRef.current.length > 0) {
        setCachedChat(chatId, {
          hydrator,
          messages: messagesRef.current,
          messageCount: messageCountRef.current,
          cachedAt: Date.now(),
          lastMessageAt: departingSidebarChat?.lastMessageAt,
          stale: false,
        })
      }
    }
  }, [activeChatId, resumeRefreshNonce, socket])

  // ── Navigate away if active chat disappears from sidebar ──────────
  useEffect(() => {
    if (!activeChatId) return
    if (!sidebarReady || !chatReady) return
    const exists = sidebarData.projectGroups.some((group) => group.chats.some((chat) => chat.chatId === activeChatId))
    if (exists) {
      if (pendingChatId === activeChatId) {
        setPendingChatId(null)
      }
      return
    }
    if (pendingChatId === activeChatId) {
      return
    }
    navigate("/")
  }, [activeChatId, chatReady, navigate, pendingChatId, sidebarData.projectGroups, sidebarReady])

  // ── Clear pendingChatId when snapshot confirms the chat ───────────
  useEffect(() => {
    if (!chatSnapshot) return
    if (pendingChatId === chatSnapshot.runtime.chatId) {
      setPendingChatId(null)
    }
  }, [chatSnapshot, pendingChatId])

  return {
    messages,
    messagesRef,
    messageCountRef,
    chatSnapshot,
    orchestrationHierarchy,
    chatReady,
  }
}
