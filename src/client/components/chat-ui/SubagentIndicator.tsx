import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react"
import { ChevronRight, ExternalLink, RefreshCw } from "lucide-react"
import { Button } from "../ui/button"
import { ChatTranscript } from "../../app/ChatTranscript"
import { fetchTranscriptMessageCount, fetchTranscriptRange } from "../../app/appState.helpers"
import { getLatestToolIds } from "../../app/derived"
import type { AppTransport } from "../../app/socket-interface"
import { createIncrementalHydrator } from "../../lib/parseTranscript"
import { createUiIdentityDescriptor, getUiIdentityAttributeProps } from "../../lib/uiIdentityOverlay"
import { cn } from "../../lib/utils"
import type {
  ChatMessageEvent,
  ChatSnapshot,
  HydratedTranscriptMessage,
  OrchestrationChildNode,
  OrchestrationChildStatus,
  OrchestrationHierarchySnapshot,
  TranscriptEntry,
} from "../../../shared/types"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogGhostButton,
  DialogHeader,
  DialogTitle,
  RESPONSIVE_MODAL_CONTENT_CLASS_NAME,
  RESPONSIVE_MODAL_FOOTER_CLASS_NAME,
  RESPONSIVE_MODAL_HEADER_CLASS_NAME,
} from "../ui/dialog"

const STATUS_CONFIG: Record<OrchestrationChildStatus, {
  dot: string
  label: string
  pulse: boolean
}> = {
  spawning: { dot: "bg-amber-400", label: "Spawning", pulse: true },
  running: { dot: "bg-emerald-400", label: "Running", pulse: true },
  waiting: { dot: "bg-sky-400", label: "Waiting", pulse: true },
  completed: { dot: "bg-neutral-400 dark:bg-neutral-500", label: "Done", pulse: false },
  failed: { dot: "bg-red-400", label: "Failed", pulse: false },
  closed: { dot: "bg-neutral-300 dark:bg-neutral-600", label: "Closed", pulse: false },
}

const INDICATOR_DESCRIPTORS = {
  root: createUiIdentityDescriptor({
    id: "chat.composer.subagents.indicator",
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  }),
  toggle: createUiIdentityDescriptor({
    id: "chat.composer.subagents.toggle",
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  }),
  dialog: createUiIdentityDescriptor({
    id: "chat.composer.subagents.dialog",
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  }),
  list: createUiIdentityDescriptor({
    id: "chat.composer.subagents.list",
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  }),
  transcript: createUiIdentityDescriptor({
    id: "chat.composer.subagents.transcript",
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  }),
} as const

interface FlattenedChildNode extends OrchestrationChildNode {
  depth: number
}

interface InspectorSessionState {
  snapshot: ChatSnapshot | null
  messages: HydratedTranscriptMessage[]
  isLoading: boolean
  error: string | null
}

export function isActiveStatus(status: OrchestrationChildStatus): boolean {
  return status === "spawning" || status === "running" || status === "waiting"
}

export function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes < 60) return `${minutes}m${seconds > 0 ? `${seconds}s` : ""}`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h${remainingMinutes > 0 ? `${remainingMinutes}m` : ""}`
}

export function countNodes(nodes: OrchestrationChildNode[]): { total: number; active: number; failed: number } {
  let total = 0
  let active = 0
  let failed = 0
  for (const node of nodes) {
    total += 1
    if (isActiveStatus(node.status)) active += 1
    if (node.status === "failed") failed += 1
    const nested = countNodes(node.children)
    total += nested.total
    active += nested.active
    failed += nested.failed
  }
  return { total, active, failed }
}

export function allTerminal(nodes: OrchestrationChildNode[]): boolean {
  return nodes.every((node) => !isActiveStatus(node.status) && allTerminal(node.children))
}

export function flattenNodes(nodes: OrchestrationChildNode[], depth = 0): FlattenedChildNode[] {
  const flattened: FlattenedChildNode[] = []
  for (const node of nodes) {
    flattened.push({ ...node, depth })
    flattened.push(...flattenNodes(node.children, depth + 1))
  }
  return flattened
}

function describeTranscriptError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }
  return "Unable to load the subagent transcript."
}

function getPreferredSelectedChatId(nodes: FlattenedChildNode[], currentChatId: string | null): string | null {
  if (currentChatId && nodes.some((node) => node.chatId === currentChatId)) {
    return currentChatId
  }
  return nodes.find((node) => isActiveStatus(node.status))?.chatId ?? nodes[0]?.chatId ?? null
}

function getSessionTitle(node: FlattenedChildNode | null, snapshot: ChatSnapshot | null): string {
  const runtimeTitle = snapshot?.runtime.title?.trim()
  if (runtimeTitle) return runtimeTitle
  const instruction = node?.instruction.trim()
  if (instruction) return instruction
  return node?.chatId ?? "Subagent session"
}

function StatusDot({ status, size = "sm" }: { status: OrchestrationChildStatus; size?: "sm" | "xs" }) {
  const config = STATUS_CONFIG[status]
  const sizeClass = size === "sm" ? "h-2 w-2" : "h-1.5 w-1.5"

  return (
    <span className="relative inline-flex items-center justify-center">
      {config.pulse ? (
        <span className={cn("absolute inline-flex rounded-full opacity-60 animate-ping", config.dot, sizeClass)} />
      ) : null}
      <span className={cn("relative inline-flex rounded-full", config.dot, sizeClass)} />
    </span>
  )
}

function TreeNodeButton({
  node,
  nowMs,
  isSelected,
  onSelect,
}: {
  node: FlattenedChildNode
  nowMs: number
  isSelected: boolean
  onSelect: (chatId: string) => void
}) {
  const config = STATUS_CONFIG[node.status]
  const elapsed = formatElapsed(Math.max(0, nowMs - node.spawnedAt))
  const isTerminal = !isActiveStatus(node.status)

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => onSelect(node.chatId)}
      className={cn(
        "flex min-w-[14rem] items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors md:min-w-0 h-auto",
        isSelected
          ? "border-primary/30 bg-primary/10"
          : "border-border/70 bg-background/70 hover:bg-muted/70",
      )}
      style={{ paddingLeft: `${node.depth * 14 + 12}px` }}
    >
      <StatusDot status={node.status} size="xs" />
      <div className={cn("min-w-0 flex-1 text-xs", isTerminal && "opacity-60")}>
        <div className="flex items-center gap-2">
          <span className="truncate text-foreground/80" title={node.instruction}>
            {node.instruction}
          </span>
          <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">
            {elapsed}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="truncate text-[10px] text-muted-foreground">
            {node.chatId}
          </span>
          <span className={cn(
            "shrink-0 text-[10px] font-medium uppercase tracking-wide",
            node.status === "failed" ? "text-red-400" : "text-muted-foreground",
          )}>
            {config.label}
          </span>
        </div>
      </div>
    </Button>
  )
}

export function SubagentInspectorTranscript({
  session,
  scrollRef,
  localPath,
  onOpenLocalLink,
  onOpenExternalLink,
}: {
  session: InspectorSessionState
  scrollRef: RefObject<HTMLDivElement | null>
  localPath?: string
  onOpenLocalLink: (target: { path: string; line?: number; column?: number }) => void
  onOpenExternalLink: (href: string) => boolean
}) {
  if (session.isLoading) {
    return (
      <div className="flex h-full min-h-[16rem] items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 text-sm text-muted-foreground">
        Loading full transcript…
      </div>
    )
  }

  if (session.error) {
    return (
      <div className="flex h-full min-h-[16rem] items-center justify-center rounded-2xl border border-dashed border-destructive/30 bg-destructive/5 px-4 text-sm text-destructive">
        {session.error}
      </div>
    )
  }

  if (session.messages.length === 0) {
    return (
      <div className="flex h-full min-h-[16rem] items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 text-sm text-muted-foreground">
        This session has no transcript yet.
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 rounded-2xl border border-border/70 bg-background/90">
      <div ref={scrollRef} className="h-full overflow-y-auto px-4 py-4">
        <ChatTranscript
          messages={session.messages}
          scrollRef={scrollRef}
          isLoading={false}
          localPath={localPath}
          latestToolIds={getLatestToolIds(session.messages)}
          onOpenLocalLink={onOpenLocalLink}
          onOpenExternalLink={onOpenExternalLink}
          onAskUserQuestionSubmit={() => {}}
          onExitPlanModeConfirm={() => {}}
        />
      </div>
    </div>
  )
}

interface SubagentIndicatorProps {
  hierarchy: OrchestrationHierarchySnapshot | null
  socket: AppTransport
  localPath?: string
  knownChatIds?: ReadonlySet<string>
  onOpenLocalLink: (target: { path: string; line?: number; column?: number }) => void
  onOpenExternalLink: (href: string) => boolean
  className?: string
}

export const SubagentIndicator = memo(function SubagentIndicator({
  hierarchy,
  socket,
  localPath,
  knownChatIds,
  onOpenLocalLink,
  onOpenExternalLink,
  className,
}: SubagentIndicatorProps) {
  const [open, setOpen] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null)
  const [session, setSession] = useState<InspectorSessionState>({
    snapshot: null,
    messages: [],
    isLoading: false,
    error: null,
  })
  const transcriptScrollRef = useRef<HTMLDivElement>(null)

  const counts = useMemo(() => {
    if (!hierarchy || hierarchy.children.length === 0) return null
    return countNodes(hierarchy.children)
  }, [hierarchy])
  const pillDots = useMemo(() => hierarchy?.children.map((child) => child.status) ?? [], [hierarchy])
  const flattenedNodes = useMemo(() => flattenNodes(hierarchy?.children ?? []), [hierarchy])
  const selectedNode = useMemo(
    () => flattenedNodes.find((node) => node.chatId === selectedChatId) ?? null,
    [flattenedNodes, selectedChatId],
  )

  useEffect(() => {
    const preferredChatId = getPreferredSelectedChatId(flattenedNodes, selectedChatId)
    if (preferredChatId !== selectedChatId) {
      setSelectedChatId(preferredChatId)
    }
  }, [flattenedNodes, selectedChatId])

  useEffect(() => {
    if (!open) return
    setNowMs(Date.now())
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [open])

  const refreshSelectedSession = useCallback(() => {
    if (!open || !selectedChatId) {
      return () => {}
    }
    const chatId = selectedChatId

    setSession({
      snapshot: null,
      messages: [],
      isLoading: true,
      error: null,
    })

    const hydrator = createIncrementalHydrator()
    let cancelled = false
    let initialFetchDone = false
    let initialFetchRequested = false
    let pendingRaf: number | null = null
    const bufferedEntries: TranscriptEntry[] = []

    async function fetchAllMessages(messageCount: number | null) {
      if (initialFetchRequested) return
      initialFetchRequested = true
      try {
        const resolvedMessageCount = messageCount ?? await fetchTranscriptMessageCount({
          socket,
          chatId,
          timeoutMs: 120_000,
        })
        const entries = await fetchTranscriptRange({
          socket,
          chatId,
          offset: 0,
          limit: Math.max(resolvedMessageCount, 1),
          timeoutMs: 120_000,
        })
        if (cancelled) return
        initialFetchDone = true
        hydrator.reset()
        for (const entry of entries) hydrator.hydrate(entry)
        for (const entry of bufferedEntries) hydrator.hydrate(entry)
        bufferedEntries.length = 0
        setSession((current) => ({
          ...current,
          messages: hydrator.getMessages(),
          isLoading: false,
          error: null,
        }))
      } catch (error) {
        if (cancelled) return
        initialFetchRequested = false
        setSession((current) => ({
          ...current,
          messages: [],
          isLoading: false,
          error: describeTranscriptError(error),
        }))
      }
    }

    const unsubscribe = socket.subscribe<ChatSnapshot | null, ChatMessageEvent>(
      { type: "chat", chatId },
      (snapshot) => {
        if (cancelled) return
        setSession((current) => ({ ...current, snapshot }))
        if (!initialFetchDone && !initialFetchRequested) {
          void fetchAllMessages(snapshot?.messageCount ?? null)
        }
      },
      (event) => {
        if (cancelled || event.chatId !== chatId) return
        if (!initialFetchDone) {
          bufferedEntries.push(event.entry)
          return
        }
        hydrator.hydrate(event.entry)
        if (pendingRaf === null) {
          pendingRaf = requestAnimationFrame(() => {
            pendingRaf = null
            if (!cancelled) {
              setSession((current) => ({
                ...current,
                messages: hydrator.getMessages(),
              }))
            }
          })
        }
      },
    )

    return () => {
      cancelled = true
      if (pendingRaf !== null) cancelAnimationFrame(pendingRaf)
      unsubscribe()
    }
  }, [open, selectedChatId, socket])

  useEffect(() => refreshSelectedSession(), [refreshSelectedSession])

  if (!counts || !hierarchy) return null

  const shouldAutoCollapse = allTerminal(hierarchy.children)
  const canOpenKnownChat = selectedNode ? knownChatIds?.has(selectedNode.chatId) ?? false : false

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div
        {...getUiIdentityAttributeProps(INDICATOR_DESCRIPTORS.root)}
        className={cn(
          "transition-all duration-300 ease-out",
          shouldAutoCollapse && !open && "opacity-40 hover:opacity-80",
          className,
        )}
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          {...getUiIdentityAttributeProps(INDICATOR_DESCRIPTORS.toggle)}
          className={cn(
            "group flex min-h-9 items-center gap-2 rounded-full border border-border/70 bg-background/85 px-3 py-1.5 text-xs text-foreground/80 shadow-sm transition-colors hover:bg-muted/60 h-auto",
            "max-md:max-w-full max-md:justify-between",
          )}
        >
          <span className="flex items-center gap-2">
            <ChevronRight className="h-3 w-3 text-muted-icon" />
            <span className="flex items-center gap-0.5">
              {pillDots.map((status, index) => (
                <StatusDot key={index} status={status} size="sm" />
              ))}
            </span>
            <span className="tabular-nums">
              {counts.active > 0
                ? `${counts.active} running`
                : `${counts.total} agent${counts.total === 1 ? "" : "s"}`}
            </span>
          </span>
          {counts.failed > 0 ? <span className="text-red-400">{counts.failed} failed</span> : null}
        </Button>
      </div>

      <DialogContent
        {...getUiIdentityAttributeProps(INDICATOR_DESCRIPTORS.dialog)}
        className={cn(RESPONSIVE_MODAL_CONTENT_CLASS_NAME, "max-w-5xl p-0")}
      >
        <DialogHeader className={cn(RESPONSIVE_MODAL_HEADER_CLASS_NAME, "gap-1")}>
          <DialogTitle>Subagent Sessions</DialogTitle>
          <DialogDescription>
            Pick a spawned session to inspect its full transcript without leaving the current chat.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="p-0 overflow-hidden">
          <div className="flex min-h-0 h-full flex-col md:grid md:grid-cols-[18rem_minmax(0,1fr)]">
            <div
              {...getUiIdentityAttributeProps(INDICATOR_DESCRIPTORS.list)}
              className="flex gap-2 overflow-x-auto border-b border-border/70 p-3 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r"
            >
              {flattenedNodes.map((node) => (
                <TreeNodeButton
                  key={node.chatId}
                  node={node}
                  nowMs={nowMs}
                  isSelected={node.chatId === selectedChatId}
                  onSelect={setSelectedChatId}
                />
              ))}
            </div>

            <div className="flex min-h-0 flex-1 flex-col" {...getUiIdentityAttributeProps(INDICATOR_DESCRIPTORS.transcript)}>
              <div className="border-b border-border/70 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {getSessionTitle(selectedNode, session.snapshot)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {selectedNode?.chatId ?? "No session selected"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        refreshSelectedSession()
                      }}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Refresh
                    </Button>
                    {canOpenKnownChat && selectedNode ? (
                      <a
                        href={`/chat/${selectedNode.chatId}`}
                        className="inline-flex h-8 items-center gap-1 rounded-full border border-border px-3 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open chat
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 p-4">
                <SubagentInspectorTranscript
                  session={session}
                  scrollRef={transcriptScrollRef}
                  localPath={localPath}
                  onOpenLocalLink={onOpenLocalLink}
                  onOpenExternalLink={onOpenExternalLink}
                />
              </div>
            </div>
          </div>
        </DialogBody>

        <DialogFooter className={RESPONSIVE_MODAL_FOOTER_CLASS_NAME}>
          <DialogGhostButton type="button" onClick={() => setOpen(false)}>
            Close
          </DialogGhostButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})
