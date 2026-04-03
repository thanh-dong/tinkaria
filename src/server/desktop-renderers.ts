import type { DesktopRendererSnapshot, DesktopRenderersSnapshot } from "../shared/types"

export interface RegisterDesktopRendererInput {
  rendererId: string
  machineName: string
  capabilities: string[]
  serverUrl?: string | null
  natsUrl?: string | null
  lastError?: string | null
}

export class DesktopRenderersRegistry {
  private readonly renderers = new Map<string, DesktopRendererSnapshot>()

  register(input: RegisterDesktopRendererInput, now = Date.now()): DesktopRendererSnapshot {
    const existing = this.renderers.get(input.rendererId)
    const snapshot: DesktopRendererSnapshot = {
      rendererId: input.rendererId,
      machineName: input.machineName,
      capabilities: [...input.capabilities],
      serverUrl: input.serverUrl ?? existing?.serverUrl ?? null,
      natsUrl: input.natsUrl ?? existing?.natsUrl ?? null,
      lastError: input.lastError ?? existing?.lastError ?? null,
      connectedAt: existing?.connectedAt ?? now,
      lastSeenAt: now,
    }
    this.renderers.set(input.rendererId, snapshot)
    return snapshot
  }

  unregister(rendererId: string): void {
    this.renderers.delete(rendererId)
  }

  getSnapshot(): DesktopRenderersSnapshot {
    return {
      renderers: [...this.renderers.values()].sort((left, right) => left.machineName.localeCompare(right.machineName)),
    }
  }
}
