import { Suspense, useEffect, useMemo, useState } from "react"
import { useNavigate, useOutletContext, useParams } from "react-router-dom"
import { ArrowLeft, Building2, Bot, Code, FolderOpen, Loader2 } from "lucide-react"
import { SegmentedControl, type SegmentedOption } from "../components/ui/segmented-control"
import { clientExtensions } from "../extensions.config"
import type { AppState } from "./useAppState"
import type { DetectionResult } from "../../shared/extension-types"
import { getPathBasename } from "../lib/formatters"

const ICON_MAP: Record<string, typeof Building2> = {
  "building-2": Building2,
  "bot": Bot,
  "code": Code,
}

export function ProjectPage() {
  const { groupKey } = useParams<{ groupKey: string }>()
  const state = useOutletContext<AppState>()
  const navigate = useNavigate()

  const [detectedIds, setDetectedIds] = useState<string[] | null>(null)
  const [detectError, setDetectError] = useState(false)

  const localPath = useMemo(() => {
    if (!groupKey) return null
    return state.sidebarData.workspaceGroups.find((g) => g.groupKey === groupKey)?.localPath ?? null
  }, [groupKey, state.sidebarData.workspaceGroups])

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
    return clientExtensions.filter((ext) => detectedIds.includes(ext.id))
  }, [detectedIds])

  const tabOptions = useMemo<SegmentedOption<string>[]>(() => {
    return activeExtensions.map((ext) => ({
      value: ext.id,
      label: ext.name,
      icon: ICON_MAP[ext.icon],
      tooltip: ext.name,
    }))
  }, [activeExtensions])

  const [activeTab, setActiveTab] = useState<string | null>(null)

  useEffect(() => {
    if (activeExtensions.length > 0 && activeTab === null) {
      setActiveTab(activeExtensions[0].id)
    }
  }, [activeExtensions, activeTab])

  const ActiveComponent = useMemo(() => {
    if (!activeTab) return null
    return activeExtensions.find((ext) => ext.id === activeTab)?.component ?? null
  }, [activeTab, activeExtensions])

  if (!groupKey) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground">Project not found</p>
      </div>
    )
  }

  if (!localPath) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground">Project not found</p>
      </div>
    )
  }

  if (detectedIds === null && !detectError) {
    return (
      <div className="flex-1 flex flex-col min-w-0 relative">
        <div className="flex items-center gap-2 px-4 pt-3 pb-2 md:pt-4 md:pb-3">
          <button
            onClick={() => navigate("/")}
            className="size-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 md:hidden"
          >
            <ArrowLeft className="size-4" />
          </button>
          <FolderOpen className="size-4 text-muted-foreground hidden md:block" />
          <h1 className="text-base font-semibold text-foreground md:text-lg truncate">{getPathBasename(localPath)}</h1>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (detectError || activeExtensions.length === 0) {
    return (
      <div className="flex-1 flex flex-col min-w-0 relative">
        <div className="flex items-center gap-2 px-4 pt-3 pb-2 md:pt-4 md:pb-3">
          <button
            onClick={() => navigate("/")}
            className="size-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 md:hidden"
          >
            <ArrowLeft className="size-4" />
          </button>
          <FolderOpen className="size-4 text-muted-foreground hidden md:block" />
          <h1 className="text-base font-semibold text-foreground md:text-lg truncate">{getPathBasename(localPath)}</h1>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">No extensions available</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 relative">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 md:pt-4 md:pb-3">
        <button
          onClick={() => navigate("/")}
          className="size-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 md:hidden"
        >
          <ArrowLeft className="size-4" />
        </button>
        <FolderOpen className="size-4 text-muted-foreground hidden md:block" />
        <h1 className="text-base font-semibold text-foreground md:text-lg truncate">{getPathBasename(localPath)}</h1>
      </div>
      {tabOptions.length > 1 && activeTab !== null && (
        <div className="px-4 mb-3">
          <SegmentedControl
            value={activeTab}
            onValueChange={setActiveTab}
            options={tabOptions}
            size="sm"
            className="w-full md:w-auto"
            optionClassName="flex-1 md:flex-initial justify-center"
            alwaysShowLabels
          />
        </div>
      )}
      <div className="flex-1 min-h-0 mx-4 mb-4 rounded-lg overflow-hidden border border-border bg-background">
        <Suspense fallback={
          <div className="flex-1 flex items-center justify-center p-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        }>
          {ActiveComponent && localPath && (
            <ActiveComponent localPath={localPath} groupKey={groupKey} />
          )}
        </Suspense>
      </div>
    </div>
  )
}
