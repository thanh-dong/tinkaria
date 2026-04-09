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
  Clock3,
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
  title,
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
  title: string
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
  const sessionLabel = latestSession
    ? getSessionDisplayTitle(latestSession)
    : "No previous session yet"

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          {...getUiIdentityAttributeProps(LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS.projectCard)}
          className={cn(
            "border group rounded-2xl bg-card p-4 text-left transition-colors",
            selected
              ? "border-primary/40 bg-primary/[0.04]"
              : "border-border hover:border-primary/30 hover:bg-muted/40",
            loading && "opacity-50 cursor-not-allowed"
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="mt-0.5 rounded-xl border border-border bg-background p-2">
                <Folder className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-foreground truncate">{projectTitle}</div>
                <div className="mt-1 text-xs text-muted-foreground truncate">{localPath}</div>
              </div>
            </div>
            {loading ? (
              <Loader2 className="h-4 w-4 text-muted-foreground animate-spin flex-shrink-0" />
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border border-border bg-background px-2 py-0.5">
              {source === "saved" ? "Saved" : "Discovered"}
            </span>
            <span className="rounded-full border border-border bg-background px-2 py-0.5">
              {chatCount} {chatCount === 1 ? "chat" : "chats"}
            </span>
            <span className="rounded-full border border-border bg-background px-2 py-0.5">
              {sessions.length} {sessions.length === 1 ? "recent session" : "recent sessions"}
            </span>
          </div>

          <div className="mt-4 rounded-xl border border-border/70 bg-background/70 p-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Ready To Resume
            </div>
            <div className="mt-1 truncate text-sm font-medium text-foreground">
              {sessionLabel}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
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
              {latestSession ? "Continue" : "Open Project"}
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
              New Task
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
  const projectTitle = project.title || getPathBasename(project.localPath)

  return (
    <InfoCard>
      <div
        className="space-y-5"
        {...getUiIdentityAttributeProps(LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS.projectOverview)}
      >
        <div className="space-y-2">
          <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
            Project Overview
          </div>
          <div>
            <h3 className="text-xl font-semibold text-foreground">{projectTitle}</h3>
            <p className="mt-1 text-sm text-muted-foreground break-all">{project.localPath}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-background p-3">
            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Entry Point</div>
            <div className="mt-1 text-sm font-medium text-foreground">
              {latestSession ? "Resume previous work" : "Start first task"}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-background p-3">
            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Discovery</div>
            <div className="mt-1 text-sm font-medium text-foreground">
              {project.source === "saved" ? "Pinned workspace" : "Recently discovered"}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-background p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" />
            Latest Session
          </div>
          <div className="mt-2 text-sm font-medium text-foreground">{latestSessionTitle}</div>
          <p className="mt-1 text-sm text-muted-foreground">
            {latestSession
              ? `Last touched ${formatRelativeTime(latestSession.modifiedAt)}. Use continue to pick up that thread, or start a fresh task while keeping this project as the active context.`
              : "Use this project as the entry point for orientation, ownership lookup, and impact work. A new task will create the first chat for this workspace."}
          </p>
          {latestSession ? (
            <SessionRuntimeBadges session={latestSession} className="mt-3 flex flex-wrap gap-1.5" />
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-background p-3">
            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Chats</div>
            <div className="mt-1 text-lg font-semibold text-foreground">{project.chatCount}</div>
          </div>
          <div className="rounded-xl border border-border bg-background p-3">
            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Sessions</div>
            <div className="mt-1 text-lg font-semibold text-foreground">{sessions.length}</div>
          </div>
          <div className="rounded-xl border border-border bg-background p-3">
            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Last Opened</div>
            <div className="mt-1 text-sm font-semibold text-foreground">
              {project.lastOpenedAt ? formatRelativeTime(project.lastOpenedAt) : "Not yet"}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
          Homepage preview stays lightweight on purpose. Use this project as the launch point for architecture overview, ownership checks, and impact inspection inside chat.
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            className="flex-1 min-w-[10rem]"
            disabled={loading}
            onClick={() => {
              onContinue()
            }}
            {...getUiIdentityAttributeProps(LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS.projectPrimaryAction)}
          >
            <ArrowRight className="mr-1.5 h-4 w-4" />
            {latestSession ? "Continue Latest Session" : "Open Project"}
          </Button>
          <Button
            variant="outline"
            className="flex-1 min-w-[10rem]"
            disabled={loading}
            onClick={() => {
              onStartTask()
            }}
            {...getUiIdentityAttributeProps(LOCAL_PROJECTS_PAGE_UI_DESCRIPTORS.projectSecondaryAction)}
          >
            <BadgePlus className="mr-1.5 h-4 w-4" />
            Start New Task
          </Button>
        </div>
      </div>
    </InfoCard>
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
                        title={project.title}
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
