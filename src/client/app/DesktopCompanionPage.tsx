import { Cpu, MonitorSmartphone, PlugZap, RadioTower } from "lucide-react"
import { useOutletContext, useParams } from "react-router-dom"
import type { DesktopRendererSnapshot, DesktopRenderersSnapshot } from "../../shared/types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { PageHeader } from "./PageHeader"
import type { TinkariaState } from "./useTinkariaState"

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

export function DesktopCompanionPageBody({
  renderer,
  rendererId,
}: {
  renderer: DesktopRendererSnapshot | null
  rendererId: string
}) {
  const statusLabel = getDesktopCompanionStatusLabel(renderer)

  return (
    <div className="flex-1 min-w-0 overflow-y-auto bg-background">
      <PageHeader
        title="Desktop Companion"
        subtitle="Renderer-specific companion settings powered by the shared desktop registry."
        icon={MonitorSmartphone}
      />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 pb-10">
        <Card className="rounded-3xl border border-border/70 bg-card/80 shadow-sm">
          <CardHeader className="gap-3 p-6">
            <CardDescription>Renderer</CardDescription>
            <CardTitle className="text-2xl">{rendererId}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {renderer
                ? `Connected from ${renderer.machineName}. Registry-backed desktop settings live here so the companion can share the same UI system as the rest of Tinkaria.`
                : "This renderer is not currently registered. The page stays addressable so the tray can land on a stable per-renderer route."}
            </p>
          </CardHeader>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
            title="NATS"
            value={renderer?.natsUrl ?? "Unavailable"}
            description="Embedded NATS endpoint currently advertised for this renderer."
            icon={Cpu}
          />
          <DesktopCompanionInfoCard
            title="Capabilities"
            value={renderer?.capabilities.join(", ") ?? "Unavailable"}
            description="Desktop-native capabilities currently reported by this renderer."
            icon={MonitorSmartphone}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
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
    </div>
  )
}

export function DesktopCompanionPage() {
  const state = useOutletContext<TinkariaState>()
  const params = useParams()
  const rendererId = params.rendererId ?? ""
  const renderer = findDesktopRendererSnapshot(state.desktopRenderers, rendererId)

  return <DesktopCompanionPageBody renderer={renderer} rendererId={rendererId} />
}
