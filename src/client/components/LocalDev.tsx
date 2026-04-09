import { useMemo, useState, type ReactNode } from "react"
import { formatRelativeTime } from "../lib/formatters"
import {
  BadgePlus,
  Check,
  CodeXml,
  Copy,
  FolderOpen,
  Folder,
  Loader2,
  Plus,
  Search,
  Sparkles,
  ArrowRight,
  MessageSquarePlus,
} from "lucide-react"
import { APP_NAME, getCliInvocation, SDK_CLIENT_APP } from "../../shared/branding"
import type {
  DiscoveredSession,
  LocalProjectsSnapshot,
} from "../../shared/types"
import type { SocketStatus } from "../app/socket-interface"
import { PageHeader } from "../app/PageHeader"
import { getPathBasename } from "../lib/formatters"
import {
  createC3UiIdentityDescriptor,
  getUiIdentityAttributeProps,
  getUiIdentityIdMap,
} from "../lib/uiIdentityOverlay"
import { cn } from "../lib/utils"
import { SessionRuntimeBadges } from "./chat-ui/SessionRuntimeBadges"
import { NewProjectModal } from "./NewProjectModal"
import { Button } from "./ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip"

interface LocalDevProps {
  connectionStatus: SocketStatus
  ready: boolean
  snapshot: LocalProjectsSnapshot | null
  startingLocalPath: string | null
  commandError: string | null
  onOpenProject: (localPath: string) => Promise<void>
  onCreateProject: (project: { mode: "new" | "existing"; localPath: string; title: string }) => Promise<void>
  sessionsForProject?: (projectId: string) => DiscoveredSession[]
  onResumeSession?: (projectId: string, session: DiscoveredSession) => Promise<void>
}

interface HomepageRecentSession {
  projectId: string
  projectTitle: string
  session: DiscoveredSession
}

const LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS = {
  page: createC3UiIdentityDescriptor({
    id: "home.page",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
  header: createC3UiIdentityDescriptor({
    id: "home.header",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
  status: createC3UiIdentityDescriptor({
    id: "home.status",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
  setup: createC3UiIdentityDescriptor({
    id: "home.setup",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
  recentSessions: createC3UiIdentityDescriptor({
    id: "home.recent-sessions",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
  workspaceGrid: createC3UiIdentityDescriptor({
    id: "home.workspace-grid",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
  addProjectAction: createC3UiIdentityDescriptor({
    id: "home.add-project.action",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
  projectOverview: createC3UiIdentityDescriptor({
    id: "home.project-overview",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
  projectCard: createC3UiIdentityDescriptor({
    id: "home.project-card",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
  projectPrimaryAction: createC3UiIdentityDescriptor({
    id: "home.project-primary.action",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
  projectSecondaryAction: createC3UiIdentityDescriptor({
    id: "home.project-secondary.action",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
  recentSessionCard: createC3UiIdentityDescriptor({
    id: "home.recent-session-card",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
  newProjectDialog: createC3UiIdentityDescriptor({
    id: "home.add-project.dialog",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
} as const
const LOCAL_PROJECTS_PAGE_UI_IDENTITIES = getUiIdentityIdMap(LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS)

export function getLocalProjectsPageUiIdentities() {
  return LOCAL_PROJECTS_PAGE_UI_IDENTITIES
}

export function getLocalProjectsPageUiIdentityDescriptors() {
  return LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS
}

function getSessionDisplayTitle(session: DiscoveredSession): string {
  if (session.title) return session.title
  if (session.lastExchange?.question) return session.lastExchange.question
  return session.sessionId
}

function truncateLabel(value: string, maxLength = 34): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function getProjectTitle(project: LocalProjectsSnapshot["projects"][number]) {
  return project.title || getPathBasename(project.localPath)
}

function getProjectPrimaryLabel(session: DiscoveredSession | null) {
  if (!session) return "Open Project"
  return `Continue ${truncateLabel(getSessionDisplayTitle(session), 28)}`
}

function getProjectSecondaryLabel(session: DiscoveredSession | null) {
  return session ? "Start Fresh Task" : "Start First Task"
}

function getProjectOverviewSummary(
  project: LocalProjectsSnapshot["projects"][number],
  session: DiscoveredSession | null,
) {
  const projectTitle = getProjectTitle(project)
  if (session) {
    return `${projectTitle} already has momentum. Pick up the latest thread or open a fresh task without losing the project context.`
  }

  if (project.source === "saved") {
    return `${projectTitle} is pinned and ready. Use it as the launch point for your next chat and project walkthrough.`
  }

  return `${projectTitle} was discovered from recent work. Review it here before deciding whether it deserves an active slot in your workspace.`
}

function getProjectWhyNow(
  project: LocalProjectsSnapshot["projects"][number],
  sessions: DiscoveredSession[],
) {
  const latestSession = sessions[0] ?? null
  if (latestSession) {
    return `Last thread: ${truncateLabel(getSessionDisplayTitle(latestSession), 56)}`
  }

  if (project.chatCount > 0) {
    return `No recent session snapshot yet, but this workspace already has ${project.chatCount} saved ${project.chatCount === 1 ? "chat" : "chats"}.`
  }

  return "No conversation history yet. This is the cleanest place to start a new task."
}

export function getHomepageRecentSessions(
  snapshot: LocalProjectsSnapshot | null,
  sessionsForProject?: (projectId: string) => DiscoveredSession[],
): HomepageRecentSession[] {
  if (!snapshot || !sessionsForProject) {
    return []
  }

  return snapshot.projects
    .flatMap((project) =>
      sessionsForProject(project.localPath).map((session) => ({
        projectId: project.localPath,
        projectTitle: project.title || getPathBasename(project.localPath),
        session,
      }))
    )
    .sort((left, right) => right.session.modifiedAt - left.session.modifiedAt)
    .slice(0, 5)
}

export function getSortedHomepageProjects(snapshot: LocalProjectsSnapshot | null) {
  return [...(snapshot?.projects ?? [])].sort((left, right) => {
    const leftRank = left.lastOpenedAt ?? 0
    const rightRank = right.lastOpenedAt ?? 0

    if (leftRank !== rightRank) {
      return rightRank - leftRank
    }

    return left.title.localeCompare(right.title)
  })
}

function getProjectSessions(
  projectLocalPath: string,
  sessionsForProject?: (projectId: string) => DiscoveredSession[],
) {
  if (!sessionsForProject) {
    return []
  }

  return [...sessionsForProject(projectLocalPath)].sort((left, right) => right.modifiedAt - left.modifiedAt)
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-muted-foreground hover:text-foreground"
      onClick={() => void handleCopy()}
    >
      {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
    </Button>
  )
}

function CodeBlock({ children }: { children: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center group bg-background border border-border text-foreground rounded-xl p-1.5 pl-3 font-mono text-sm">
      <pre className="overflow-x-auto">
        <code>{children}</code>
      </pre>
      <CopyButton text={children} />
    </div>
  )
}

function InfoCard({ children }: { children: ReactNode }) {
  return <div className="bg-card border border-border rounded-2xl p-4">{children}</div>
}

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[13px] font-medium text-muted-foreground uppercase tracking-wider mb-3">
      {children}
    </h2>
  )
}

function ActionCard({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof Sparkles
  title: string
  description: string
  action: ReactNode
}) {
  return (
    <InfoCard>
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-border bg-background p-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <h3 className="font-medium text-foreground">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        {action}
      </div>
    </InfoCard>
  )
}

function ConnectionStatusCard({
  isConnecting,
  commandError,
}: {
  isConnecting: boolean
  commandError: string | null
}) {
  return (
    <InfoCard>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className={cn(
            "rounded-xl border p-2",
            isConnecting
              ? "border-border bg-background"
              : "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-300"
          )}>
            <Loader2 className={cn("h-4 w-4", isConnecting && "animate-spin text-muted-foreground")} />
          </div>
          <div className="min-w-0">
            <div className="font-medium text-foreground">
              {isConnecting ? `Connecting to your local ${APP_NAME} server` : `Local ${APP_NAME} server not reachable`}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {isConnecting
                ? `Loading workspaces and recent sessions from this machine.`
                : `This browser tab can't reach the local ${APP_NAME} server yet. Start it on this machine and the page will reconnect automatically.`}
            </p>
          </div>
        </div>
        {commandError ? (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            {commandError}
          </div>
        ) : null}
      </div>
    </InfoCard>
  )
}

function RecentSessionRow({
  item,
  onResume,
}: {
  item: HomepageRecentSession
  onResume: () => void
}) {
  return (
    <button
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/50 transition-colors text-left group"
      onClick={onResume}
      {...getUiIdentityAttributeProps(LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS.recentSessionCard)}
    >
      <div className="min-w-0 flex-1">
        <div className="font-medium text-sm text-foreground truncate">
          {getSessionDisplayTitle(item.session)}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground truncate">{item.projectTitle}</span>
          <span className="text-xs text-muted-foreground/50">·</span>
          <span className="text-xs text-muted-foreground shrink-0">{formatRelativeTime(item.session.modifiedAt)}</span>
        </div>
        <SessionRuntimeBadges session={item.session} className="mt-1.5 flex flex-wrap gap-1.5" />
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </button>
  )
}

function ProjectCard({
  projectTitle,
  localPath,
  source,
  chatCount,
  sessions,
  loading,
  selected,
  onSelect,
  onContinue,
  onStartTask,
}: {
  projectTitle: string
  localPath: string
  source: "saved" | "discovered"
  chatCount: number
  sessions: DiscoveredSession[]
  loading: boolean
  selected: boolean
  onSelect: () => void
  onContinue: () => void
  onStartTask: () => void
}) {
  const latestSession = sessions[0] ?? null
  const sessionLabel = latestSession ? getSessionDisplayTitle(latestSession) : "No previous session yet"
  const primaryLabel = getProjectPrimaryLabel(latestSession)
  const secondaryLabel = getProjectSecondaryLabel(latestSession)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          {...getUiIdentityAttributeProps(LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS.projectCard)}
          className={cn(
            "group rounded-[1.6rem] p-4 text-left transition-all duration-200",
            selected
              ? "bg-[linear-gradient(180deg,rgba(242,114,109,0.12),rgba(255,255,255,0.96))] ring-1 ring-[color:var(--color-logo)]/25 shadow-[0_14px_40px_-28px_rgba(214,73,64,0.6)] dark:bg-[linear-gradient(180deg,rgba(242,114,109,0.16),rgba(46,42,42,0.92))]"
              : "bg-card ring-1 ring-border hover:-translate-y-0.5 hover:ring-[color:var(--color-logo)]/20 hover:shadow-[0_14px_34px_-28px_rgba(42,32,29,0.45)]",
            loading && "opacity-50 cursor-not-allowed"
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className={cn(
                "mt-0.5 rounded-2xl p-2.5",
                selected ? "bg-background/80" : "bg-muted"
              )}>
                <Folder className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-medium text-foreground truncate">{projectTitle}</div>
                  {selected ? (
                    <span className="rounded-full bg-logo/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-logo">
                      Active
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 text-xs text-muted-foreground truncate">{localPath}</div>
              </div>
            </div>
            {loading ? (
              <Loader2 className="h-4 w-4 text-muted-foreground animate-spin flex-shrink-0" />
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-full bg-background/80 px-2.5 py-1">
              {source === "saved" ? "Saved" : "Discovered"}
            </span>
            <span className="rounded-full bg-background/80 px-2.5 py-1">
              {chatCount} {chatCount === 1 ? "chat" : "chats"}
            </span>
            <span className="rounded-full bg-background/80 px-2.5 py-1">
              {sessions.length} {sessions.length === 1 ? "recent session" : "recent sessions"}
            </span>
          </div>

          <div className="mt-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Why open this now
            </div>
            <div className="mt-1 truncate text-base font-medium text-foreground">
              {sessionLabel}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {latestSession
                ? `Last active ${formatRelativeTime(latestSession.modifiedAt)}`
                : "Open the project and start a first task from here."}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              className="flex-1 min-w-[8rem]"
              disabled={loading}
              onClick={() => {
                onContinue()
              }}
              {...getUiIdentityAttributeProps(LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS.projectPrimaryAction)}
            >
              <ArrowRight className="mr-1.5 h-4 w-4" />
              {primaryLabel}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 min-w-[8rem]"
              disabled={loading}
              onClick={() => {
                onStartTask()
              }}
              {...getUiIdentityAttributeProps(LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS.projectSecondaryAction)}
            >
              <MessageSquarePlus className="mr-1.5 h-4 w-4" />
              {secondaryLabel}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="min-w-[8rem]"
              disabled={loading}
              onClick={() => {
                onSelect()
              }}
            >
              <Search className="mr-1.5 h-4 w-4" />
              Overview
            </Button>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>{localPath}</p>
      </TooltipContent>
    </Tooltip>
  )
}

function ProjectOverviewPanel({
  project,
  sessions,
  loading,
  onContinue,
  onStartTask,
}: {
  project: LocalProjectsSnapshot["projects"][number]
  sessions: DiscoveredSession[]
  loading: boolean
  onContinue: () => void
  onStartTask: () => void
}) {
  const latestSession = sessions[0] ?? null
  const latestSessionTitle = latestSession ? getSessionDisplayTitle(latestSession) : "No previous session"
  const projectTitle = getProjectTitle(project)
  const primaryLabel = getProjectPrimaryLabel(latestSession)
  const secondaryLabel = getProjectSecondaryLabel(latestSession)
  const summary = getProjectOverviewSummary(project, latestSession)
  const whyNow = getProjectWhyNow(project, sessions)

  return (
    <div
      className="overflow-hidden rounded-[1.8rem] bg-[linear-gradient(160deg,rgba(242,114,109,0.14),rgba(249,247,243,0.98)_32%,rgba(255,255,255,0.98)_100%)] ring-1 ring-[color:var(--color-logo)]/18 shadow-[0_28px_80px_-52px_rgba(203,76,64,0.72)] dark:bg-[linear-gradient(160deg,rgba(242,114,109,0.2),rgba(44,39,39,0.95)_32%,rgba(31,28,28,0.95)_100%)]"
      {...getUiIdentityAttributeProps(LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS.projectOverview)}
    >
      <div className="space-y-6 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-background/75 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-logo">
              <Search className="h-3.5 w-3.5" />
              Active Project
            </div>
            <div>
              <h3 className="text-[clamp(1.4rem,2vw,2rem)] font-semibold leading-tight text-foreground">{projectTitle}</h3>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{summary}</p>
            </div>
          </div>
          <div className="rounded-2xl bg-background/72 px-3 py-2 text-right backdrop-blur-sm">
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Workspace</div>
            <div className="mt-1 text-sm font-medium text-foreground">{project.source === "saved" ? "Pinned and ready" : "Discovered from recent activity"}</div>
          </div>
        </div>

        <div className="rounded-[1.4rem] bg-background/78 p-4 backdrop-blur-sm">
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Why now</div>
          <div className="mt-2 text-lg font-medium leading-7 text-foreground">{whyNow}</div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground break-all">{project.localPath}</p>
          {latestSession ? (
            <SessionRuntimeBadges session={latestSession} className="mt-4 flex flex-wrap gap-1.5" />
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full bg-background/72 px-2.5 py-1">
            {project.chatCount} {project.chatCount === 1 ? "chat" : "chats"}
          </span>
          <span className="rounded-full bg-background/72 px-2.5 py-1">
            {sessions.length} {sessions.length === 1 ? "recent session" : "recent sessions"}
          </span>
          <span className="rounded-full bg-background/72 px-2.5 py-1">
            {project.lastOpenedAt ? `Opened ${formatRelativeTime(project.lastOpenedAt)}` : "Not opened recently"}
          </span>
          <span className="rounded-full bg-background/72 px-2.5 py-1">
            {latestSession ? latestSessionTitle : "Fresh workspace"}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            className="flex-1 min-w-[12rem]"
            disabled={loading}
            onClick={() => {
              onContinue()
            }}
            {...getUiIdentityAttributeProps(LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS.projectPrimaryAction)}
          >
            <ArrowRight className="mr-1.5 h-4 w-4" />
            {primaryLabel}
          </Button>
          <Button
            variant="outline"
            className="flex-1 min-w-[12rem] bg-background/72"
            disabled={loading}
            onClick={() => {
              onStartTask()
            }}
            {...getUiIdentityAttributeProps(LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS.projectSecondaryAction)}
          >
            <BadgePlus className="mr-1.5 h-4 w-4" />
            {secondaryLabel}
          </Button>
        </div>

        <div className="grid gap-3 border-t border-foreground/8 pt-4 text-sm text-muted-foreground sm:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Best next move</div>
            <p className="mt-2 leading-6">
              {latestSession
                ? "Resume the current thread if you already know the context. Start fresh if the next task needs a cleaner frame."
                : "Open this workspace to establish context first, then use the first task to seed the project's working thread."}
            </p>
          </div>
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Orientation</div>
            <p className="mt-2 leading-6">
              Use this pane to decide whether the project is active, stale, or worth reviving before you commit a new chat to it.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export function LocalDev({
  connectionStatus,
  ready,
  snapshot,
  startingLocalPath,
  commandError,
  onOpenProject,
  onCreateProject,
  sessionsForProject,
  onResumeSession,
}: LocalDevProps) {
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [selectedProjectPath, setSelectedProjectPath] = useState<string | null>(null)

  const projects = useMemo(() => getSortedHomepageProjects(snapshot), [snapshot])
  const recentSessions = useMemo(
    () => getHomepageRecentSessions(snapshot, sessionsForProject),
    [snapshot, sessionsForProject]
  )
  const selectedProject = projects.find((project) => project.localPath === selectedProjectPath) ?? projects[0] ?? null
  const selectedProjectSessions = useMemo(
    () => selectedProject ? getProjectSessions(selectedProject.localPath, sessionsForProject) : [],
    [selectedProject, sessionsForProject]
  )
  const isConnecting = connectionStatus === "connecting" || (connectionStatus === "connected" && !ready)
  const isConnected = connectionStatus === "connected" && ready

  return (
    <div
      className="flex-1 flex flex-col min-w-0 bg-background overflow-y-auto"
      {...getUiIdentityAttributeProps(LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS.page)}
    >
      {!isConnected ? (
        <>
          <PageHeader
            narrow
            icon={CodeXml}
            uiId={LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS.header}
            title={isConnecting ? `Connecting ${APP_NAME}` : `Connect ${APP_NAME}`}
            subtitle={isConnecting
              ? `${APP_NAME} is starting up and loading your local projects.`
              : `Run ${APP_NAME} on this machine to unlock local files, saved projects, and chat history.`}
          />
          <div className="max-w-2xl w-full mx-auto pb-12 px-6">
            <SectionHeader>Status</SectionHeader>
            <div className="mb-8" {...getUiIdentityAttributeProps(LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS.status)}>
              <ConnectionStatusCard isConnecting={isConnecting} commandError={commandError} />
            </div>

            {!isConnecting ? (
              <div className="mb-10" {...getUiIdentityAttributeProps(LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS.setup)}>
                <SectionHeader>Get Connected</SectionHeader>
                <div className="space-y-4">
                  <ActionCard
                    icon={Sparkles}
                    title={`Start ${APP_NAME} locally`}
                    description="Open a terminal on this machine and run the local server. This page reconnects automatically as soon as it comes online."
                    action={<CodeBlock>{getCliInvocation()}</CodeBlock>}
                  />
                  <ActionCard
                    icon={FolderOpen}
                    title="Already running?"
                    description="If you expected this page to be connected already, double-check that the server is running on this same machine and keep this tab open for a few seconds."
                    action={(
                      <div className="space-y-3 text-sm text-muted-foreground">
                        <ul className="list-disc pl-5 space-y-1">
                          <li>Wait a moment after startup: project and session snapshots arrive after the socket connects.</li>
                          <li>Run the command in a terminal on this machine, not on a different host.</li>
                          <li>If you want to start in the current directory or skip opening a browser tab, use the variants below.</li>
                        </ul>
                        <div className="space-y-1">
                          <div className="font-medium text-foreground">Start in the current directory</div>
                          <CodeBlock>{getCliInvocation("").trim()}</CodeBlock>
                        </div>
                        <div className="space-y-1">
                          <div className="font-medium text-foreground">Start without opening the browser</div>
                          <CodeBlock>{getCliInvocation("--no-open")}</CodeBlock>
                        </div>
                      </div>
                    )}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <PageHeader
            uiId={LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS.header}
            title={snapshot?.machine.displayName ?? "Local Projects"}
            subtitle="Pick up the right thread, choose the right workspace, and get just enough orientation before you dive back into chat."
          />

          <div className="w-full px-6 mb-10">
            {recentSessions.length > 0 ? (
              <div className="mb-10" {...getUiIdentityAttributeProps(LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS.recentSessions)}>
                <SectionHeader>Recent Sessions</SectionHeader>
                <div className="bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
                  {recentSessions.map((item) => (
                    <RecentSessionRow
                      key={`${item.projectId}:${item.session.sessionId}`}
                      item={item}
                      onResume={() => {
                        void onResumeSession?.(item.projectId, item.session)
                      }}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mb-3 flex items-baseline justify-between gap-4">
              <SectionHeader>Workspaces</SectionHeader>
              <Button
                variant="default"
                size="sm"
                onClick={() => setNewProjectOpen(true)}
                {...getUiIdentityAttributeProps(LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS.addProjectAction)}
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Add Project
              </Button>
            </div>
            {projects.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.9fr)] lg:items-start">
                <div
                  className="grid grid-cols-1 gap-3 xl:grid-cols-2"
                  {...getUiIdentityAttributeProps(LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS.workspaceGrid)}
                >
                  {projects.map((project) => {
                    const projectSessions = getProjectSessions(project.localPath, sessionsForProject)
                    const latestSession = projectSessions[0] ?? null
                    const projectTitle = project.title || getPathBasename(project.localPath)

                    return (
                      <ProjectCard
                        key={project.localPath}
                        projectTitle={projectTitle}
                        localPath={project.localPath}
                        source={project.source}
                        chatCount={project.chatCount}
                        sessions={projectSessions}
                        loading={startingLocalPath === project.localPath}
                        selected={selectedProject?.localPath === project.localPath}
                        onSelect={() => {
                          setSelectedProjectPath(project.localPath)
                        }}
                        onContinue={() => {
                          if (latestSession) {
                            void onResumeSession?.(project.localPath, latestSession)
                            return
                          }

                          void onOpenProject(project.localPath)
                        }}
                        onStartTask={() => {
                          void onOpenProject(project.localPath)
                        }}
                      />
                    )
                  })}
                </div>
                {selectedProject ? (
                  <ProjectOverviewPanel
                    project={selectedProject}
                    sessions={selectedProjectSessions}
                    loading={startingLocalPath === selectedProject.localPath}
                    onContinue={() => {
                      const latestSession = selectedProjectSessions[0] ?? null
                      if (latestSession) {
                        void onResumeSession?.(selectedProject.localPath, latestSession)
                        return
                      }

                      void onOpenProject(selectedProject.localPath)
                    }}
                    onStartTask={() => {
                      void onOpenProject(selectedProject.localPath)
                    }}
                  />
                ) : null}
              </div>
            ) : (
              <InfoCard>
                <p className="text-sm text-muted-foreground">
                  No local projects yet. Add a workspace here or start {APP_NAME} inside a project directory to seed one automatically.
                </p>
              </InfoCard>
            )}
            {commandError ? (
              <div className="text-sm text-destructive border border-destructive/20 bg-destructive/5 rounded-xl px-4 py-3 mt-4">
                {commandError}
              </div>
            ) : null}
          </div>
        </>
      )}

      <NewProjectModal
        open={newProjectOpen}
        onOpenChange={setNewProjectOpen}
        rootUiId={LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS.newProjectDialog}
        onConfirm={(project) => {
          void onCreateProject(project)
        }}
      />

      <div className="py-4 text-center">
        <span className="text-xs text-muted-foreground/50">v{SDK_CLIENT_APP.split("/")[1]}</span>
      </div>
    </div>
  )
}
