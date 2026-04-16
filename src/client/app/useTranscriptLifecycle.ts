import { useEffect, useLayoutEffect, useRef, useState } from "react"
import type {
  ChatMessageEvent,
  ChatSnapshot,
  OrchestrationHierarchySnapshot,
  SidebarData,
  TranscriptRenderUnit,
} from "../../shared/types"
import { getCachedChat, setCachedChat, type CachedScrollMode } from "./chatCache"
import {
  fetchTranscriptRenderUnits,
  shouldPreserveMessagesOnResubscribe,
  shouldTriggerSnapshotRecovery,
  SNAPSHOT_RECOVERY_TIMEOUT_MS,
  TRANSCRIPT_TAIL_SIZE,
} from "./appState.helpers"
import { transitionProjectSelection } from "./useAppState.machine"
import type { ProjectSelectionState } from "./useAppState.machine"
import type { AppTransport } from "./socket-interface"

const LOG_PREFIX = "[useTranscriptLifecycle]"

function log(message: string, details?: unknown) {
  if (details === undefined) {
    console.info(`${LOG_PREFIX} ${message}`)
    return
  }
  console.info(`${LOG_PREFIX} ${message}`, details)
}

export interface CachedScrollState {
  scrollTop: number
  scrollMode: CachedScrollMode
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
  getScrollState: () => CachedScrollState | null
}

export interface TranscriptLifecycleResult {
  messages: TranscriptRenderUnit[]
  messagesRef: React.RefObject<TranscriptRenderUnit[]>
  messageCountRef: React.RefObject<number>
  chatSnapshot: ChatSnapshot | null
  orchestrationHierarchy: OrchestrationHierarchySnapshot | null
  chatReady: boolean
  cachedScrollState: CachedScrollState | null
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
    getScrollState,
  } = args

  const onChatSnapshotReceivedRef = useRef(onChatSnapshotReceived)
  useLayoutEffect(() => { onChatSnapshotReceivedRef.current = onChatSnapshotReceived }, [onChatSnapshotReceived])

  const getScrollStateRef = useRef(getScrollState)
  useLayoutEffect(() => { getScrollStateRef.current = getScrollState }, [getScrollState])

  const [cachedScrollState, setCachedScrollState] = useState<CachedScrollState | null>(null)
  const [messages, setMessages] = useState<TranscriptRenderUnit[]>([])
  const messagesRef = useRef<TranscriptRenderUnit[]>(messages)
  const messagesChatIdRef = useRef<string | null>(null)
  const messageCountRef = useRef(0)
  const [chatSnapshot, setChatSnapshot] = useState<ChatSnapshot | null>(null)
  const [orchestrationHierarchy, setOrchestrationHierarchy] = useState<OrchestrationHierarchySnapshot | null>(null)
  const [chatReady, setChatReady] = useState(false)

  useLayoutEffect(() => { messagesRef.current = messages }, [messages])

  useEffect(() => {
    if (!activeChatId) {
      log("clearing chat snapshot for non-chat route")
      setChatSnapshot(null)
      setOrchestrationHierarchy(null)
      setProjectSelection((current) => transitionProjectSelection(current, { type: "chat.cleared" }))
      messagesChatIdRef.current = null
      messageCountRef.current = 0
      setMessages([])
      setChatReady(true)
      return
    }

    setChatSnapshot(null)
    setOrchestrationHierarchy(null)

    const cached = getCachedChat(activeChatId)
    const restoredFromCache = cached !== null

    if (restoredFromCache) {
      log("restoring chat render units from cache", {
        activeChatId,
        cachedUnits: cached.messages.length,
        stale: cached.stale,
        scrollTop: cached.scrollTop,
        scrollMode: cached.scrollMode,
      })
      messagesChatIdRef.current = activeChatId
      messageCountRef.current = cached.messageCount
      setMessages(cached.messages)
      setCachedScrollState({ scrollTop: cached.scrollTop, scrollMode: cached.scrollMode })
      setChatReady(true)
    } else {
      setCachedScrollState(null)
      if (shouldPreserveMessagesOnResubscribe({
        hasExistingMessages: messagesRef.current.length > 0,
        restoredFromCache: false,
        currentMessagesChatId: messagesChatIdRef.current,
        nextChatId: activeChatId,
      })) {
        log("re-subscribing to active chat (keeping render units)", { activeChatId })
      } else {
        log("subscribing to chat render units (no cache)", {
          activeChatId,
          previousMessagesChatId: messagesChatIdRef.current,
        })
        messagesChatIdRef.current = null
        messageCountRef.current = 0
        setMessages([])
        setChatReady(false)
      }
    }

    let cancelled = false
    let initialFetchDone = false
    let fetchTriggered = false
    let pendingRaf: number | null = null
    const chatId = activeChatId

    function applyRenderUnits(units: TranscriptRenderUnit[], source: "snapshot" | "fetched") {
      if (cancelled) return
      initialFetchDone = true
      messagesChatIdRef.current = chatId
      setMessages(units)
      log("transcript render units applied", {
        chatId,
        source,
        unitCount: units.length,
      })
    }

    async function fetchRenderWindow(source: "snapshot_recovery" | "live_event") {
      if (source === "snapshot_recovery") {
        if (fetchTriggered) return
        fetchTriggered = true
      }
      try {
        const units = await fetchTranscriptRenderUnits({
          socket,
          chatId,
          offset: Math.max(0, messageCountRef.current - TRANSCRIPT_TAIL_SIZE),
          limit: TRANSCRIPT_TAIL_SIZE,
          isLoading: true,
        })
        applyRenderUnits(units, "fetched")
        setChatReady(true)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        log("transcript render-unit fetch failed", { chatId, source, error: message })
        if (source === "snapshot_recovery" && message.includes("Not connected")) {
          fetchTriggered = false
          return
        }
        if (source === "snapshot_recovery") {
          applyRenderUnits([], "fetched")
          setChatReady(true)
        }
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
          renderUnits: snapshot?.renderUnits.length ?? 0,
        })
        setChatSnapshot(snapshot)
        if (snapshot) {
          messageCountRef.current = snapshot.messageCount
          applyRenderUnits(snapshot.renderUnits, "snapshot")
          setProjectSelection((current) => transitionProjectSelection(current, {
            type: "chat.snapshot_received",
            workspaceId: snapshot.runtime.workspaceId,
          }))
          onChatSnapshotReceivedRef.current(snapshot)
        }
        setChatReady(true)
        setCommandError(null)
      },
      (event) => {
        if (cancelled) return
        if (event.chatId !== activeChatId) return
        messageCountRef.current += 1
        if (pendingRaf !== null) return
        pendingRaf = requestAnimationFrame(() => {
          pendingRaf = null
          if (!cancelled) void fetchRenderWindow("live_event")
        })
      }
    )

    const orchestrationUnsub = socket.subscribe<OrchestrationHierarchySnapshot>(
      { type: "orchestration", chatId: activeChatId },
      (snapshot) => {
        if (cancelled) return
        setOrchestrationHierarchy(snapshot)
      },
    )

    const recoveryTimer = restoredFromCache ? undefined : setTimeout(() => {
      if (shouldTriggerSnapshotRecovery({ cancelled, initialFetchDone, fetchTriggered })) {
        log("snapshot recovery: no render snapshot received, fetching directly", { chatId })
        void fetchRenderWindow("snapshot_recovery")
      }
    }, SNAPSHOT_RECOVERY_TIMEOUT_MS)

    return () => {
      cancelled = true
      clearTimeout(recoveryTimer)
      if (pendingRaf !== null) cancelAnimationFrame(pendingRaf)
      unsub()
      orchestrationUnsub()
      const departingSidebarChat = sidebarData.workspaceGroups
        .flatMap((group) => group.chats)
        .find((chat) => chat.chatId === chatId)
      if (chatId && messagesChatIdRef.current === chatId && messagesRef.current.length > 0) {
        const scrollState = getScrollStateRef.current()
        setCachedChat(chatId, {
          messages: messagesRef.current,
          messageCount: messageCountRef.current,
          cachedAt: Date.now(),
          lastMessageAt: departingSidebarChat?.lastMessageAt,
          stale: false,
          scrollTop: scrollState?.scrollTop ?? 0,
          scrollMode: scrollState?.scrollMode ?? "following",
        })
      }
    }
  }, [activeChatId, resumeRefreshNonce, socket])

  useEffect(() => {
    if (!activeChatId) return
    if (!sidebarReady || !chatReady) return
    const exists = sidebarData.workspaceGroups.some((group) => group.chats.some((chat) => chat.chatId === activeChatId))
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
  }, [activeChatId, chatReady, navigate, pendingChatId, sidebarData.workspaceGroups, sidebarReady])

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
    cachedScrollState,
  }
}
