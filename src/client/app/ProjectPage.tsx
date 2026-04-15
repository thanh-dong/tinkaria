import { Suspense, useEffect, useMemo, useState } from "react"
import { useNavigate, useOutletContext, useParams } from "react-router-dom"
import { ArrowLeft, Building2, Bot, Code, FolderOpen, Loader2, MessageSquare, Puzzle } from "lucide-react"
import { Button } from "../components/ui/button"
import { SegmentedControl, type SegmentedOption } from "../components/ui/segmented-control"
import { ProjectSessionsPanel } from "../components/project/ProjectSessionsPanel"
import { clientExtensions } from "../extensions.config"
import type { AppState } from "./useAppState"
import type { DetectionResult } from "../../shared/extension-types"
import { useExtensionPreferencesSubscription } from "./useExtensionPreferencesSubscription"
import { getPathBasename } from "../lib/formatters"
import {
  createC3UiIdentityDescriptor,
  getUiIdentityAttributeProps,
  getUiIdentityIdMap,
} from "../lib/uiIdentityOverlay"

const PROJECT_PAGE_UI_DESCRIPTORS = {
  page: createC3UiIdentityDescriptor({
    id: "project.page",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
  header: createC3UiIdentityDescriptor({
    id: "project.page.header",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
  backAction: createC3UiIdentityDescriptor({
    id: "project.page.back.action",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
  tabs: createC3UiIdentityDescriptor({
    id: "project.page.tabs",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
  content: createC3UiIdentityDescriptor({
    id: "project.page.content",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
  emptyState: createC3UiIdentityDescriptor({
    id: "project.page.empty-state",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
  loadingState: createC3UiIdentityDescriptor({
    id: "project.page.loading-state",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
  extensionsTabs: createC3UiIdentityDescriptor({
    id: "project.extensions.tabs",
    c3ComponentId: "c3-120",
    c3ComponentLabel: "extensions",
  }),
  extensionsContent: createC3UiIdentityDescriptor({
    id: "project.extensions.content",
    c3ComponentId: "c3-120",
    c3ComponentLabel: "extensions",
  }),
} as const

const PROJECT_PAGE_UI_IDENTITIES = getUiIdentityIdMap(PROJECT_PAGE_UI_DESCRIPTORS)

export function getProjectPageUiIdentityDescriptors() {
  return PROJECT_PAGE_UI_DESCRIPTORS
}

export function getProjectPageUiIdentities() {
  return PROJECT_PAGE_UI_IDENTITIES
}

const ICON_MAP: Record<string, typeof Building2> = {
  "building-2": Building2,
  "bot": Bot,
  "code": Code,
}

type ProjectTab = "sessions" | "extensions"

const PROJECT_TAB_OPTIONS: SegmentedOption<ProjectTab>[] = [
  { value: "sessions", label: "Sessions", icon: MessageSquare },
  { value: "extensions", label: "Extensions", icon: Puzzle },
]

function ProjectPageHeader({ localPath, onBack }: { localPath: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2 px-4 pt-3 pb-2 md:pt-4 md:pb-3" {...getUiIdentityAttributeProps(PROJECT_PAGE_UI_DESCRIPTORS.header)}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onBack}
        className="size-7 border-0 md:hidden"
        {...getUiIdentityAttributeProps(PROJECT_PAGE_UI_DESCRIPTORS.backAction)}
      >
        <ArrowLeft className="size-4" />
      </Button>
      <FolderOpen className="size-4 text-muted-foreground hidden md:block" />
      <h1 className="text-base font-semibold text-foreground md:text-lg truncate">{getPathBasename(localPath)}</h1>
    </div>
  )
}

export function ProjectPage() {
  const { groupKey } = useParams<{ groupKey: string }>()
  const state = useOutletContext<AppState>()
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState<ProjectTab>("sessions")

  const prefsSnapshot = useExtensionPreferencesSubscription(state.socket)
  const [detectedIds, setDetectedIds] = useState<string[] | null>(null)
  const [detectError, setDetectError] = useState(false)

  const workspaceGroup = useMemo(() => {
    if (!groupKey) return null
    return state.sidebarData.workspaceGroups.find((g) => g.groupKey === groupKey) ?? null
  }, [groupKey, state.sidebarData.workspaceGroups])

  const localPath = workspaceGroup?.localPath ?? null
  const chats = workspaceGroup?.chats ?? []

  useEffect(() => {
    if (!localPath) return
    setDetectedIds(null)
    setDetectError(false)

    fetch(`/api/ext/detect?projectPath=${encodeURIComponent(localPath)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Detection failed: ${res.status}`)
        return res.json() as Promise<DetectionResult[]>
      })
      .then((results) => {
        setDetectedIds(results.filter((r) => r.detected).map((r) => r.extensionId))
      })
      .catch((error: unknown) => {
        console.warn("[ProjectPage] Extension detection failed:", error instanceof Error ? error.message : String(error))
        setDetectError(true)
      })
  }, [localPath])

  const activeExtensions = useMemo(() => {
    if (!detectedIds) return []
    return clientExtensions.filter((ext) => {
      if (!detectedIds.includes(ext.id)) return false
      const pref = prefsSnapshot?.preferences.find((p) => p.extensionId === ext.id)
      return pref?.enabled !== false
    })
  }, [detectedIds, prefsSnapshot])

  const extensionTabOptions = useMemo<SegmentedOption<string>[]>(() => {
    return activeExtensions.map((ext) => ({
      value: ext.id,
      label: ext.name,
      icon: ICON_MAP[ext.icon],
      tooltip: ext.name,
    }))
  }, [activeExtensions])

  const [activeExtensionTab, setActiveExtensionTab] = useState<string | null>(null)

  useEffect(() => {
    if (activeExtensions.length > 0 && activeExtensionTab === null) {
      setActiveExtensionTab(activeExtensions[0].id)
    }
  }, [activeExtensions, activeExtensionTab])

  const ActiveExtensionComponent = useMemo(() => {
    if (!activeExtensionTab) return null
    return activeExtensions.find((ext) => ext.id === activeExtensionTab)?.component ?? null
  }, [activeExtensionTab, activeExtensions])

  if (!groupKey || !localPath) {
    return (
      <div className="flex-1 flex items-center justify-center" {...getUiIdentityAttributeProps(PROJECT_PAGE_UI_DESCRIPTORS.page)}>
        <p className="text-muted-foreground" {...getUiIdentityAttributeProps(PROJECT_PAGE_UI_DESCRIPTORS.emptyState)}>Project not found</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 relative" {...getUiIdentityAttributeProps(PROJECT_PAGE_UI_DESCRIPTORS.page)}>
      <ProjectPageHeader localPath={localPath} onBack={() => navigate("/")} />

      <div className="px-4 mb-3" {...getUiIdentityAttributeProps(PROJECT_PAGE_UI_DESCRIPTORS.tabs)}>
        <SegmentedControl
          value={activeTab}
          onValueChange={setActiveTab}
          options={PROJECT_TAB_OPTIONS}
          size="sm"
          className="w-full md:w-auto"
          optionClassName="flex-1 md:flex-initial justify-center"
          alwaysShowLabels
        />
      </div>

      {activeTab === "sessions" && (
        <div className="flex-1 min-h-0 mx-4 mb-4 rounded-lg overflow-hidden border border-border bg-background" {...getUiIdentityAttributeProps(PROJECT_PAGE_UI_DESCRIPTORS.content)}>
          <ProjectSessionsPanel
            groupKey={groupKey}
            chats={chats}
            onCreateChat={(workspaceId) => void state.handleCreateChat(workspaceId)}
            onDeleteChat={(chat) => void state.handleDeleteChat(chat)}
            onRenameChat={(chatId, title) => void state.handleRenameChat(chatId, title)}
            onForkChat={(chatId) => navigate(`/chat/${chatId}`)}
            onMergeSession={(workspaceId) => state.requestMerge(workspaceId)}
          />
        </div>
      )}

      {activeTab === "extensions" && (
        <>
          {detectedIds === null && !detectError ? (
            <div className="flex-1 flex items-center justify-center" {...getUiIdentityAttributeProps(PROJECT_PAGE_UI_DESCRIPTORS.loadingState)}>
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : detectError || activeExtensions.length === 0 ? (
            <div className="flex-1 flex items-center justify-center" {...getUiIdentityAttributeProps(PROJECT_PAGE_UI_DESCRIPTORS.emptyState)}>
              <p className="text-muted-foreground">No extensions available</p>
            </div>
          ) : (
            <>
              {extensionTabOptions.length > 1 && activeExtensionTab !== null && (
                <div className="px-4 mb-3" {...getUiIdentityAttributeProps(PROJECT_PAGE_UI_DESCRIPTORS.extensionsTabs)}>
                  <SegmentedControl
                    value={activeExtensionTab}
                    onValueChange={setActiveExtensionTab}
                    options={extensionTabOptions}
                    size="sm"
                    className="w-full md:w-auto"
                    optionClassName="flex-1 md:flex-initial justify-center"
                    alwaysShowLabels
                  />
                </div>
              )}
              <div className="flex-1 min-h-0 mx-4 mb-4 rounded-lg overflow-hidden border border-border bg-background" {...getUiIdentityAttributeProps(PROJECT_PAGE_UI_DESCRIPTORS.extensionsContent)}>
                <Suspense fallback={
                  <div className="flex-1 flex items-center justify-center p-8" {...getUiIdentityAttributeProps(PROJECT_PAGE_UI_DESCRIPTORS.loadingState)}>
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                }>
                  {ActiveExtensionComponent && localPath && (
                    <ActiveExtensionComponent localPath={localPath} groupKey={groupKey} />
                  )}
                </Suspense>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
