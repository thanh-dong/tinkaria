import { useMemo, useState, type ReactNode } from "react"
import {
  Check,
  CodeXml,
  Copy,
  FolderOpen,
  Folder,
  History,
  Loader2,
  Plus,
  Sparkles,
  SquarePen,
} from "lucide-react"
import { APP_NAME, getCliInvocation, SDK_CLIENT_APP } from "../../shared/branding"
import type {
  DesktopRenderersSnapshot,
  DiscoveredSession,
  LocalProjectsSnapshot,
} from "../../shared/types"
import type { SocketStatus } from "../app/socket-interface"
import { PageHeader } from "../app/PageHeader"
import { getPathBasename } from "../lib/formatters"
import { cn } from "../lib/utils"
import { NewProjectModal } from "./NewProjectModal"
import { Button } from "./ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip"

interface LocalDevProps {
  connectionStatus: SocketStatus
  ready: boolean
  snapshot: LocalProjectsSnapshot | null
  desktopRenderers: DesktopRenderersSnapshot
  startingLocalPath: string | null
  commandError: string | null
  onOpenProject: (localPath: string) => Promise<void>
  onCreateProject: (project: { mode: "new" | "existing"; localPath: string; title: string }) => Promise<void>
  sessionsForProject?: (projectId: string) => DiscoveredSession[]
  onResumeSession?: (projectId: string, session: DiscoveredSession) => Promise<void>
}

export function getDesktopRendererStatusLabel(desktopRenderers: DesktopRenderersSnapshot): string {
  return desktopRenderers.renderers.some((renderer) => renderer.capabilities.includes("native_webview"))
    ? "Desktop renderer ready"
    : "Waiting for a desktop renderer"
}

export function getHomepageProjectCounts(snapshot: LocalProjectsSnapshot | null) {
  const projects = snapshot?.projects ?? []

  return {
    total: projects.length,
    saved: projects.filter((project) => project.source === "saved").length,
    discovered: projects.filter((project) => project.source === "discovered").length,
  }
}

interface HomepageRecentSession {
  projectId: string
  projectTitle: string
  session: DiscoveredSession
}

function getSessionDisplayTitle(session: DiscoveredSession): string {
  if (session.title) return session.title
  if (session.lastExchange?.question) return session.lastExchange.question
  return session.sessionId
}

function getRelativeTimeLabel(timestamp: number, now = Date.now()): string {
  const delta = now - timestamp
  const minutes = Math.floor(delta / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
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
    .slice(0, 3)
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

function getProjectSourceLabel(source: "saved" | "discovered"): string {
  return source === "saved" ? "Saved" : "Discovered"
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

function StatCard({
  eyebrow,
  value,
  detail,
}: {
  eyebrow: string
  value: string
  detail: string
}) {
  return (
    <InfoCard>
      <div className="space-y-1">
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{eyebrow}</div>
        <div className="text-xl font-semibold text-foreground">{value}</div>
        <div className="text-sm text-muted-foreground">{detail}</div>
      </div>
    </InfoCard>
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

function RecentSessionCard({
  item,
  onResume,
}: {
  item: HomepageRecentSession
  onResume: () => void
}) {
  return (
    <InfoCard>
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-border bg-background p-2">
            <History className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <h3 className="truncate font-medium text-foreground">{getSessionDisplayTitle(item.session)}</h3>
              <span className="shrink-0 text-xs text-muted-foreground">{getRelativeTimeLabel(item.session.modifiedAt)}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Back to {item.projectTitle}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="rounded-full border border-border bg-background px-2 py-0.5">
                {item.session.provider}
              </span>
              <span className="rounded-full border border-border bg-background px-2 py-0.5">
                {item.session.source === "kanna" ? "Tinkaria" : "CLI"}
              </span>
            </div>
          </div>
        </div>
        <Button onClick={onResume} className="w-full">
          Resume session
        </Button>
      </div>
    </InfoCard>
  )
}

function ProjectCard({
  title,
  localPath,
  source,
  chatCount,
  loading,
  onClick,
}: {
  title: string
  localPath: string
  source: "saved" | "discovered"
  chatCount: number
  loading: boolean
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={cn(
            "border border-border hover:border-primary/30 group rounded-2xl bg-card px-4 py-4 w-full text-left hover:bg-muted/50 transition-colors",
            loading && "opacity-50 cursor-not-allowed"
          )}
          disabled={loading}
          onClick={onClick}
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-xl border border-border bg-background p-2">
              <Folder className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-foreground truncate">{title || getPathBasename(localPath)}</div>
                  <div className="mt-1 text-xs text-muted-foreground truncate">{localPath}</div>
                </div>
                {loading ? (
                  <Loader2 className="h-4 w-4 text-muted-foreground group-hover:text-primary animate-spin flex-shrink-0" />
                ) : (
                  <SquarePen className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="rounded-full border border-border bg-background px-2 py-0.5">
                  {getProjectSourceLabel(source)}
                </span>
                <span className="rounded-full border border-border bg-background px-2 py-0.5">
                  {chatCount} {chatCount === 1 ? "chat" : "chats"}
                </span>
              </div>
            </div>
          </div>
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{localPath}</p>
      </TooltipContent>
    </Tooltip>
  )
}

export function LocalDev({
  connectionStatus,
  ready,
  snapshot,
  desktopRenderers,
  startingLocalPath,
  commandError,
  onOpenProject,
  onCreateProject,
  sessionsForProject,
  onResumeSession,
}: LocalDevProps) {
  const [newProjectOpen, setNewProjectOpen] = useState(false)

  const projects = useMemo(() => getSortedHomepageProjects(snapshot), [snapshot])
  const projectCounts = useMemo(() => getHomepageProjectCounts(snapshot), [snapshot])
  const recentSessions = useMemo(
    () => getHomepageRecentSessions(snapshot, sessionsForProject),
    [snapshot, sessionsForProject]
  )
  const isConnecting = connectionStatus === "connecting" || !ready
  const isConnected = connectionStatus === "connected" && ready
  const desktopRendererStatusLabel = getDesktopRendererStatusLabel(desktopRenderers)

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background overflow-y-auto">
      {!isConnected ? (
        <>
          <PageHeader
            narrow
            icon={CodeXml}
            title={isConnecting ? `Connecting ${APP_NAME}` : `Connect ${APP_NAME}`}
            subtitle={isConnecting
              ? `${APP_NAME} is starting up and loading your local projects.`
              : `Run ${APP_NAME} on this machine to unlock local files, saved projects, and chat history.`}
          />
          <div className="max-w-2xl w-full mx-auto pb-12 px-6">
            <SectionHeader>Status</SectionHeader>
            <div className="mb-8">
              <InfoCard>
                <div className="flex items-center gap-3">
                  <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
                  <span className="text-sm text-muted-foreground">
                    {isConnecting ? (
                      `Connecting to your local ${APP_NAME} server...`
                    ) : (
                      <>
                        Not connected. Run <code className="bg-background border border-border rounded-md mx-0.5 p-1 font-mono text-xs text-foreground">{getCliInvocation()}</code> from any terminal on this machine.
                      </>
                    )}
                  </span>
                </div>
              </InfoCard>
            </div>

            {!isConnecting ? (
              <div className="mb-10">
                <SectionHeader>Setup</SectionHeader>
                <div className="space-y-4">
                  <ActionCard
                    icon={Sparkles}
                    title={`Start ${APP_NAME}`}
                    description="This page will reconnect automatically once the local server is running."
                    action={<CodeBlock>{getCliInvocation()}</CodeBlock>}
                  />
                  <ActionCard
                    icon={FolderOpen}
                    title="Useful variants"
                    description="Use the current directory directly, or keep the server headless."
                    action={(
                      <div className="space-y-3 text-sm text-muted-foreground">
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
            title={snapshot?.machine.displayName ?? "Local Projects"}
            subtitle="Welcome back. Resume a session or jump into the right workspace."
          />

          <div className="w-full px-6 mb-10">
            {recentSessions.length > 0 ? (
              <div className="mb-10">
                <SectionHeader>Welcome Back</SectionHeader>
                <div className="mb-3">
                  <h2 className="text-xl font-semibold text-foreground">Pick up where you left off</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Your latest sessions are first so you can get back to work without digging through stats.
                  </p>
                </div>
                <div className="grid gap-3 lg:grid-cols-3">
                  {recentSessions.map((item) => (
                    <RecentSessionCard
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

            <div className="mb-10">
              <SectionHeader>Projects</SectionHeader>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard eyebrow="Projects" value={String(projectCounts.total)} detail="Workspaces available on this machine" />
                <StatCard eyebrow="Saved" value={String(projectCounts.saved)} detail="Explicitly tracked projects" />
                <StatCard eyebrow="Discovered" value={String(projectCounts.discovered)} detail="Projects picked up from usage" />
                <StatCard eyebrow="Desktop" value={desktopRendererStatusLabel} detail="Native renderer status" />
              </div>
            </div>

            <div className="mb-3 flex items-baseline justify-between gap-4">
              <div>
                <h2 className="text-[13px] font-medium text-muted-foreground uppercase tracking-wider">Workspaces</h2>
                <p className="mt-1 text-sm text-muted-foreground">Recent work first, with enough context to choose the right place to continue.</p>
              </div>
              <Button variant="default" size="sm" onClick={() => setNewProjectOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                Add Project
              </Button>
            </div>
            {projects.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 3xl:grid-cols-5 gap-3">
                {projects.map((project) => (
                  <ProjectCard
                    key={project.localPath}
                    title={project.title}
                    localPath={project.localPath}
                    source={project.source}
                    chatCount={project.chatCount}
                    loading={startingLocalPath === project.localPath}
                    onClick={() => {
                      void onOpenProject(project.localPath)
                    }}
                  />
                ))}
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
