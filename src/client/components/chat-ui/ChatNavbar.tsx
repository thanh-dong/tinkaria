import { type MouseEvent as ReactMouseEvent } from "react"
import { Code, FolderOpen, Grip, Maximize2, Menu, PanelLeft, PanelRight, Plus, SquarePen, Terminal } from "lucide-react"
import { TinkariaSidebarMark } from "../branding/TinkariaSidebarMark"
import { Button } from "../ui/button"
import { CardHeader } from "../ui/card"
import { HotkeyTooltip, HotkeyTooltipContent, HotkeyTooltipTrigger } from "../ui/tooltip"
import { createUiIdentity, getUiIdentityAttributeProps } from "../../lib/uiIdentityOverlay"
import { cn } from "../../lib/utils"

interface Props {
  sidebarCollapsed: boolean
  onOpenSidebar: () => void
  onCollapseSidebar: () => void
  onExpandSidebar: () => void
  onNewChat: () => void
  localPath?: string
  embeddedTerminalVisible?: boolean
  onToggleEmbeddedTerminal?: () => void
  rightSidebarVisible?: boolean
  onToggleRightSidebar?: () => void
  onOpenExternal?: (action: "open_finder" | "open_editor") => void
  editorLabel?: string
  finderShortcut?: string[]
  editorShortcut?: string[]
  terminalShortcut?: string[]
  rightSidebarShortcut?: string[]
}

type DesktopShellRuntimeWindow = {
  __TAURI_INTERNALS__: object
}

interface DesktopShellWindowApi {
  isMaximized(): Promise<boolean>
  toggleMaximize(): Promise<void>
  startDragging(): Promise<void>
}

function hasDesktopShellRuntime(value: unknown): value is DesktopShellRuntimeWindow {
  return typeof value === "object"
    && value !== null
    && "__TAURI_INTERNALS__" in value
    && typeof (value as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ === "object"
    && (value as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== null
}

async function getDesktopShellWindowApi(windowLike: unknown): Promise<DesktopShellWindowApi | null> {
  if (!hasDesktopShellRuntime(windowLike)) {
    return null
  }

  const { getCurrentWindow } = await import("@tauri-apps/api/window")
  return getCurrentWindow()
}

export function ChatNavbar({
  sidebarCollapsed,
  onOpenSidebar,
  onCollapseSidebar,
  onExpandSidebar,
  onNewChat,
  localPath,
  embeddedTerminalVisible = false,
  onToggleEmbeddedTerminal,
  rightSidebarVisible = false,
  onToggleRightSidebar,
  onOpenExternal,
  editorLabel = "Editor",
  finderShortcut,
  editorShortcut,
  terminalShortcut,
  rightSidebarShortcut,
}: Props) {
  const navbarAreaId = createUiIdentity("chat.navbar", "area")
  const newChatActionId = createUiIdentity("chat.navbar.new-chat", "action")
  const terminalToggleActionId = createUiIdentity("chat.navbar.terminal-toggle", "action")
  const rightSidebarToggleActionId = createUiIdentity("chat.navbar.right-sidebar-toggle", "action")
  const showDesktopShellControls = hasDesktopShellRuntime(typeof window === "undefined" ? null : window)

  async function handleDesktopMovePointerDown(event: ReactMouseEvent<HTMLButtonElement>) {
    if (event.button !== 0) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const desktopWindow = await getDesktopShellWindowApi(window)
    if (!desktopWindow) {
      return
    }

    await desktopWindow.startDragging()
  }

  async function handleDesktopMaximizeToggle() {
    const desktopWindow = await getDesktopShellWindowApi(window)
    if (!desktopWindow) {
      return
    }

    await desktopWindow.toggleMaximize()
  }

  return (
    <CardHeader
      {...getUiIdentityAttributeProps("chat.navbar")}
      className={cn(
        "absolute top-0 left-0 right-0 z-10 md:pt-3 px-3 border-border/0 md:pb-0 flex items-center justify-center",
        " bg-gradient-to-b from-background/70"
      )}
    >
      <div
        {...getUiIdentityAttributeProps(navbarAreaId)}
        className="relative flex items-center gap-2 w-full"
      >
        <div className={`flex items-center gap-1 flex-shrink-0 border border-border rounded-full ${sidebarCollapsed ? 'px-1.5' : ''} p-1 backdrop-blur-lg`}>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={onOpenSidebar}
          >
            <Menu className="size-4.5" />
          </Button>
          {sidebarCollapsed && (
            <>
              <div className="flex items-center justify-center w-[36px] h-[36px]">
                <TinkariaSidebarMark className="hidden h-5 w-5 md:inline-flex sm:h-6 sm:w-6" imageClassName="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              {!showDesktopShellControls ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden md:flex"
                  onClick={onExpandSidebar}
                  title="Expand sidebar"
                >
                  <PanelLeft className="size-4.5" />
                </Button>
              ) : null}
            </>
          )}
          {showDesktopShellControls ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={sidebarCollapsed ? onExpandSidebar : onCollapseSidebar}
                title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                <PanelLeft className="size-4.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="Move window"
                onMouseDown={(event) => {
                  void handleDesktopMovePointerDown(event)
                }}
              >
                <Grip className="size-4.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="Toggle maximize"
                onClick={() => {
                  void handleDesktopMaximizeToggle()
                }}
                >
                  <Maximize2 className="size-4.5" />
                </Button>
              <Button
                {...getUiIdentityAttributeProps(newChatActionId)}
                variant="ghost"
                size="icon"
                onClick={onNewChat}
                title="New project"
              >
                <Plus className="size-4.5" />
              </Button>
            </>
          ) : (
            <Button
              {...getUiIdentityAttributeProps(newChatActionId)}
              variant="ghost"
              size="icon"
              onClick={onNewChat}
              title="Compose"
            >
              <SquarePen className="size-4.5" />
            </Button>
          )}
        </div>

        <div className="flex-1 min-w-0" />

        <div className="flex items-center gap-1 flex-shrink-0 border border-border rounded-full px-1.5 py-1 backdrop-blur-lg">
          {localPath && (onOpenExternal || onToggleEmbeddedTerminal) && (
            <>
              {onOpenExternal ? (
                <HotkeyTooltip>
                  <HotkeyTooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onOpenExternal("open_finder")}
                      title="Open in Finder"
                      className="border border-border/0"
                    >
                      <FolderOpen className="h-4.5 w-4.5" />
                    </Button>
                  </HotkeyTooltipTrigger>
                  <HotkeyTooltipContent side="bottom" shortcut={finderShortcut} />
                </HotkeyTooltip>
              ) : null}
              {onToggleEmbeddedTerminal ? (
                <HotkeyTooltip>
                  <HotkeyTooltipTrigger asChild>
                    <Button
                      {...getUiIdentityAttributeProps(terminalToggleActionId)}
                      variant="ghost"
                      size="icon"
                      onClick={onToggleEmbeddedTerminal}
                      className={cn(
                        "border border-border/0",
                        embeddedTerminalVisible && "text-white"
                      )}
                    >
                      <Terminal className="h-4.5 w-4.5" />
                    </Button>
                  </HotkeyTooltipTrigger>
                  <HotkeyTooltipContent side="bottom" shortcut={terminalShortcut} />
                </HotkeyTooltip>
              ) : null}
              {onOpenExternal ? (
                <HotkeyTooltip>
                  <HotkeyTooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onOpenExternal("open_editor")}
                      title={`Open in ${editorLabel}`}
                      className="border border-border/0"
                    >
                      <Code className="h-4.5 w-4.5" />
                    </Button>
                  </HotkeyTooltipTrigger>
                  <HotkeyTooltipContent side="bottom" shortcut={editorShortcut} />
                </HotkeyTooltip>
              ) : null}
            </>
          )}
          {onToggleRightSidebar ? (
            <HotkeyTooltip>
              <HotkeyTooltipTrigger asChild>
                <Button
                  {...getUiIdentityAttributeProps(rightSidebarToggleActionId)}
                  variant="ghost"
                  size="icon"
                  onClick={onToggleRightSidebar}
                  className={cn(
                    "border border-border/0",
                    rightSidebarVisible && "text-white"
                  )}
                >
                  <PanelRight className="h-4.5 w-4.5" />
                </Button>
              </HotkeyTooltipTrigger>
              <HotkeyTooltipContent side="bottom" shortcut={rightSidebarShortcut} />
            </HotkeyTooltip>
          ) : null}
        </div>
      </div>
    </CardHeader>
  )
}
