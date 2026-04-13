import { Fragment, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Eraser, Plus, X } from "lucide-react"
import type { AppTransport, SocketStatus } from "../../app/socket-interface"
import { Button } from "../ui/button"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../ui/resizable"
import { HotkeyTooltip, HotkeyTooltipContent, HotkeyTooltipTrigger } from "../ui/tooltip"
import { createC3UiIdentityDescriptor, getUiIdentityAttributeProps } from "../../lib/uiIdentityOverlay"
import type { ProjectTerminalLayout } from "../../stores/terminalLayoutStore"
import { TerminalPane } from "./TerminalPane"
import { getMinimumTerminalWidth, getMinimumTerminalWorkspaceWidth } from "./TerminalWorkspaceLayout"

interface Props {
  workspaceId: string
  layout: ProjectTerminalLayout
  socket: AppTransport
  connectionStatus: SocketStatus
  scrollback: number
  minColumnWidth: number
  focusRequestVersion?: number
  splitTerminalShortcut?: string[]
  onAddTerminal: (workspaceId: string, afterTerminalId?: string) => void
  onRemoveTerminal: (workspaceId: string, terminalId: string) => void
  onTerminalLayout: (workspaceId: string, sizes: number[]) => void
}

const TERMINAL_WORKSPACE_UI_DESCRIPTOR = createC3UiIdentityDescriptor({
  id: "chat.terminal-workspace",
  c3ComponentId: "c3-110",
  c3ComponentLabel: "chat",
})

export function TerminalWorkspace({
  workspaceId,
  layout,
  socket,
  connectionStatus,
  scrollback,
  minColumnWidth,
  focusRequestVersion = 0,
  splitTerminalShortcut,
  onAddTerminal,
  onRemoveTerminal,
  onTerminalLayout,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const paneRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const previousTerminalIdsRef = useRef<string[]>([])
  const [viewportWidth, setViewportWidth] = useState(0)
  const [pathsByTerminalId, setPathsByTerminalId] = useState<Record<string, string | null>>({})
  const [clearVersionsByTerminalId, setClearVersionsByTerminalId] = useState<Record<string, number>>({})

  useLayoutEffect(() => {
    const element = containerRef.current
    if (!element) return

    const updateWidth = () => {
      setViewportWidth(element.getBoundingClientRect().width)
    }

    const observer = new ResizeObserver(updateWidth)
    observer.observe(element)
    updateWidth()

    return () => observer.disconnect()
  }, [])

  const paneCount = layout.terminals.length
  const minTerminalWidth = getMinimumTerminalWidth(minColumnWidth)
  const requiredWidth = getMinimumTerminalWorkspaceWidth(paneCount, minColumnWidth)
  const innerWidth = Math.max(viewportWidth, requiredWidth)
  const panelGroupKey = useMemo(
    () => layout.terminals.map((terminal) => terminal.id).join(":"),
    [layout.terminals]
  )

  useLayoutEffect(() => {
    const previousIds = previousTerminalIdsRef.current
    const currentIds = layout.terminals.map((terminal) => terminal.id)
    const addedTerminalId = currentIds.find((id) => !previousIds.includes(id))

    previousTerminalIdsRef.current = currentIds

    if (!addedTerminalId || previousIds.length === 0) {
      return
    }

    const element = paneRefs.current[addedTerminalId]
    if (!element) {
      return
    }

    element.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    })
  }, [layout.terminals])

  return (
    <div
      {...getUiIdentityAttributeProps(TERMINAL_WORKSPACE_UI_DESCRIPTOR)}
      className="flex h-full min-h-0 flex-col"
    >
      <div ref={containerRef} className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
        <div className="h-full min-h-0" style={{ width: innerWidth || "100%" }}>
          <ResizablePanelGroup
            key={panelGroupKey}
            orientation="horizontal"
            className="h-full min-h-0"
            onLayoutChanged={(nextLayout) => onTerminalLayout(
              workspaceId,
              layout.terminals.map((terminal) => nextLayout[terminal.id] ?? terminal.size)
            )}
          >
            {layout.terminals.map((terminalPane, index) => (
              <Fragment key={terminalPane.id}>
                <ResizablePanel
                  id={terminalPane.id}
                  defaultSize={`${terminalPane.size}%`}
                  minSize={`${minTerminalWidth}px`}
                  className="min-h-0 overflow-hidden"
                  style={{ minWidth: minTerminalWidth }}
                >
                <div
                  ref={(element) => {
                    paneRefs.current[terminalPane.id] = element
                  }}
                  className="flex h-full min-h-0 min-w-0 flex-col border-r border-border bg-transparent last:border-r-0"
                  style={{ minWidth: minTerminalWidth }}
                >
                  <div className="flex items-center gap-2 px-3 pr-2 pt-2 pb-1">
                    <div className="min-w-0 flex-1 text-left">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="shrink-0 text-sm font-medium">Terminal</div>
                        <div className="min-w-0 truncate text-xs text-muted-foreground">
                          {pathsByTerminalId[terminalPane.id] ?? ""}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Clear terminal"
                        onClick={() => setClearVersionsByTerminalId((current) => ({
                          ...current,
                          [terminalPane.id]: (current[terminalPane.id] ?? 0) + 1,
                        }))}
                      >
                        <Eraser className="size-3.5" />
                      </Button>
                      <HotkeyTooltip>
                        <HotkeyTooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Add terminal to the right"
                            onClick={() => onAddTerminal(workspaceId, terminalPane.id)}
                          >
                            <Plus className="size-3.5" />
                          </Button>
                        </HotkeyTooltipTrigger>
                        <HotkeyTooltipContent side="bottom" shortcut={splitTerminalShortcut} />
                      </HotkeyTooltip>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Archive terminal"
                        onClick={() => onRemoveTerminal(workspaceId, terminalPane.id)}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  <TerminalPane
                    workspaceId={workspaceId}
                    terminalId={terminalPane.id}
                    socket={socket}
                    scrollback={scrollback}
                    connectionStatus={connectionStatus}
                    clearVersion={clearVersionsByTerminalId[terminalPane.id] ?? 0}
                    focusRequestVersion={index === 0 ? focusRequestVersion : 0}
                    onPathChange={(path) => setPathsByTerminalId((current) => {
                      if (current[terminalPane.id] === path) return current
                      return {
                        ...current,
                        [terminalPane.id]: path,
                      }
                    })}
                  />
                </div>
                </ResizablePanel>
                {index < layout.terminals.length - 1 ? <ResizableHandle withHandle orientation="horizontal" /> : null}
              </Fragment>
            ))}
          </ResizablePanelGroup>
        </div>
      </div>
    </div>
  )
}
