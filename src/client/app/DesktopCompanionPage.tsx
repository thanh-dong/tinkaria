import type { ReactNode } from "react"
import { Cpu, MonitorSmartphone, PlugZap, RadioTower, ShieldCheck } from "lucide-react"
import { useParams } from "react-router-dom"
import type { DesktopRendererSnapshot, DesktopRenderersSnapshot } from "../../shared/types"
import { TinkariaSidebarMark } from "../components/branding/TinkariaSidebarMark"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { useTinkariaAppState } from "./TinkariaStateContext"

export function findDesktopRendererSnapshot(
  snapshot: DesktopRenderersSnapshot,
  rendererId: string | null | undefined,
): DesktopRendererSnapshot | null {
  if (!rendererId) {
    return null
  }

  return snapshot.renderers.find((renderer) => renderer.rendererId === rendererId) ?? null
}

export function getDesktopCompanionStatusLabel(renderer: DesktopRendererSnapshot | null): string {
  if (!renderer) {
    return "Offline"
  }

  return renderer.lastError ? "Connected with warnings" : "Connected"
}

function formatDesktopCompanionTimestamp(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(value)
}

function DesktopCompanionInfoCard({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string
  value: string
  description: string
  icon: typeof Cpu
}) {
  return (
    <Card className="rounded-2xl border border-border/70 bg-card/80 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-4 p-5">
        <div className="space-y-1">
          <CardDescription>{title}</CardDescription>
          <CardTitle className="text-base font-semibold">{value}</CardTitle>
        </div>
        <Icon className="h-5 w-5 text-muted-foreground" />
      </CardHeader>
      <CardContent className="px-5 pb-5 pt-0 text-sm text-muted-foreground">
        {description}
      </CardContent>
    </Card>
  )
}

export function DesktopCompanionShell({ children }: { children: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto bg-[linear-gradient(180deg,rgba(255,250,242,0.98)_0%,rgba(255,246,234,0.94)_100%)] text-foreground dark:bg-[linear-gradient(180deg,rgba(14,20,18,1)_0%,rgba(11,16,14,1)_100%)]">
      <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-6 pb-12 pt-8 sm:px-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <TinkariaSidebarMark className="rounded-2xl border-orange-200/80 bg-white/90 p-1.5" imageClassName="size-8" />
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Tinkaria Companion
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">Native desktop controls for one renderer</h1>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-4 py-2 text-sm text-muted-foreground shadow-sm backdrop-blur">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Companion-only surface
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

export function DesktopCompanionPageBody({
  renderer,
  rendererId,
}: {
  renderer: DesktopRendererSnapshot | null
  rendererId: string
}) {
  const statusLabel = getDesktopCompanionStatusLabel(renderer)

  return (
    <DesktopCompanionShell>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)]">
        <Card className="rounded-3xl border border-border/70 bg-card/80 shadow-sm lg:col-span-2">
          <CardHeader className="gap-3 p-6">
            <CardDescription>Renderer control surface</CardDescription>
            <CardTitle className="text-3xl">{rendererId}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {renderer
                ? `Connected from ${renderer.machineName}. Attached to the running Tinkaria server and its embedded NATS authority.`
                : "This renderer is not currently registered. The page stays addressable so the tray can land on a stable per-renderer route."}
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 border-t border-border/60 p-6 md:grid-cols-2 xl:grid-cols-4">
            <DesktopCompanionInfoCard
              title="Status"
              value={statusLabel}
              description={renderer ? "Driven from the live desktop renderer snapshot." : "Waiting for the renderer to register over NATS."}
              icon={PlugZap}
            />
            <DesktopCompanionInfoCard
              title="Main server"
              value={renderer?.serverUrl ?? "Unavailable"}
              description="The browser-first Tinkaria server this companion is attached to."
              icon={RadioTower}
            />
            <DesktopCompanionInfoCard
              title="Embedded NATS"
              value={renderer?.natsUrl ?? "Unavailable"}
              description="Native attach target for the companion. Browser clients stay on the main server WebSocket path."
              icon={Cpu}
            />
            <DesktopCompanionInfoCard
              title="Capabilities"
              value={renderer?.capabilities.join(", ") ?? "Unavailable"}
              description="Desktop-native capabilities currently reported by this renderer."
              icon={MonitorSmartphone}
            />
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <DesktopCompanionInfoCard
            title="Renderer identity"
            value={renderer?.machineName ?? "Unavailable"}
            description={renderer ? `Connected at ${formatDesktopCompanionTimestamp(renderer.connectedAt)}` : "Waiting for first successful attach."}
            icon={MonitorSmartphone}
          />
          <Card className="rounded-2xl border border-border/70 bg-card/80 shadow-sm">
            <CardHeader className="p-5">
              <CardDescription>Connection details</CardDescription>
              <CardTitle className="text-lg font-semibold">Registry state</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 p-5 pt-0 text-sm">
              <div>
                <div className="font-medium text-foreground">Machine</div>
                <div className="text-muted-foreground">{renderer?.machineName ?? "Unavailable"}</div>
              </div>
              <div>
                <div className="font-medium text-foreground">Connected at</div>
                <div className="text-muted-foreground">
                  {renderer ? formatDesktopCompanionTimestamp(renderer.connectedAt) : "Unavailable"}
                </div>
              </div>
              <div>
                <div className="font-medium text-foreground">Last seen</div>
                <div className="text-muted-foreground">
                  {renderer ? formatDesktopCompanionTimestamp(renderer.lastSeenAt) : "Unavailable"}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-border/70 bg-card/80 shadow-sm">
            <CardHeader className="p-5">
              <CardDescription>Diagnostics</CardDescription>
              <CardTitle className="text-lg font-semibold">Last error</CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-0 text-sm text-muted-foreground">
              {renderer?.lastError ?? "None"}
            </CardContent>
          </Card>
        </div>
      </div>
    </DesktopCompanionShell>
  )
}

export function DesktopCompanionPage() {
  const state = useTinkariaAppState()
  const params = useParams()
  const rendererId = params.rendererId ?? ""
  const renderer = findDesktopRendererSnapshot(state.desktopRenderers, rendererId)

  return <DesktopCompanionPageBody renderer={renderer} rendererId={rendererId} />
}
